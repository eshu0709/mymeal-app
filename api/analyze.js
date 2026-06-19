export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { meal, restrictions } = req.body;

  if (!meal || typeof meal !== 'string' || meal.trim().length === 0) {
    return res.status(400).json({ error: 'meal is required' });
  }

  const restrictionLine = Array.isArray(restrictions) && restrictions.length > 0
    ? `\nDietary restrictions (STRICT — every suggested addition must comply with ALL of these): ${restrictions.join(', ')}\n`
    : '';

  const prompt = `You are a certified nutritionist and dietitian. A user has told you their current meal. Your job is to:
1. Identify nutritional problems or imbalances with this meal (excess sodium, saturated fat, refined carbs, lack of fiber, missing vitamins, etc.)
2. Suggest 3-4 specific, realistic food items they could ADD to this meal (or alongside it) to make it healthier and more balanced — without telling them to replace their food entirely.

Current meal: "${meal.trim()}"
${restrictionLine}

Respond ONLY with valid JSON in exactly this structure:
{
  "problems": [
    { "title": "Short issue name", "description": "1-2 sentence explanation", "icon": "single emoji" }
  ],
  "additions": [
    {
      "name": "Food name",
      "emoji": "single emoji",
      "portion": "suggested serving size",
      "why": "1-2 sentence explanation of why this addition helps",
      "nutrients": ["nutrient1", "nutrient2", "nutrient3"]
    }
  ],
  "scores": {
    "before": { "fiber": 20, "protein": 40, "vitamins": 15, "balance": 25 },
    "after":  { "fiber": 55, "protein": 60, "vitamins": 50, "balance": 60 }
  }
}

Rules:
- problems: 2-4 items
- additions: exactly 3-4 realistic additions (real foods, not supplements)
- scores: 0-100 scale for each dimension (before = current meal, after = with additions)
- nutrients: 2-4 short nutrient labels per addition
- Return ONLY the JSON object, no other text`;

  try {
    // ── Call OpenAI ──
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}));
      return res.status(openaiRes.status).json({ error: err?.error?.message || 'OpenAI API error' });
    }

    const data = await openaiRes.json();
    const raw = data.choices[0].message.content.trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse AI response' });
    }

    const result = JSON.parse(jsonMatch[0]);

    // ── Log to Google Sheets (fire-and-forget — never blocks the response) ──
    logToSheets(meal, restrictions, result).catch(() => {});

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

// ── Google Sheets logger ──
async function logToSheets(meal, restrictions, result) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  // Get a Google OAuth access token using the service account
  const token = await getGoogleToken(credentials);

  const timestamp = new Date().toISOString();
  const restrictionsStr = Array.isArray(restrictions) && restrictions.length > 0
    ? restrictions.join(', ')
    : 'None';
  const problemsStr = (result.problems || []).map(p => p.title).join('; ');
  const additionsStr = (result.additions || []).map(a => a.name).join('; ');
  const scoresBefore = JSON.stringify(result.scores?.before || {});
  const scoresAfter  = JSON.stringify(result.scores?.after  || {});

  const row = [timestamp, meal, restrictionsStr, problemsStr, additionsStr, scoresBefore, scoresAfter];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:G1:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    }
  );
}

// ── Minimal Google service account JWT auth ──
async function getGoogleToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;

  // Sign with RS256 using the private key
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}
