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

    // ── Log to Google Sheets (awaited so Vercel doesn't cut it off) ──
    try {
      await logToSheets(meal, restrictions, result);
    } catch (sheetErr) {
      console.error('Sheets logging failed:', sheetErr.message);
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

// ── Google Sheets logger ──
async function logToSheets(meal, restrictions, result) {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const sheetId     = process.env.GOOGLE_SHEET_ID;

  const token = await getGoogleToken(credentials);

  const row = [
    new Date().toISOString(),
    meal,
    Array.isArray(restrictions) && restrictions.length > 0 ? restrictions.join(', ') : 'None',
    (result.problems  || []).map(p => p.title).join('; '),
    (result.additions || []).map(a => a.name).join('; '),
    JSON.stringify(result.scores?.before || {}),
    JSON.stringify(result.scores?.after  || {})
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:G:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const sheetRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [row] })
  });

  if (!sheetRes.ok) {
    const err = await sheetRes.json().catch(() => ({}));
    throw new Error(`Sheets API ${sheetRes.status}: ${JSON.stringify(err)}`);
  }
}

// ── Google service account JWT auth ──
async function getGoogleToken(credentials) {
  const now = Math.floor(Date.now() / 1000);

  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss:   credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  })}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const jwt = `${unsigned}.${sign.sign(credentials.private_key, 'base64url')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}
