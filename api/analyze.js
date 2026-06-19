export default async function handler(req, res) {
  // Only allow POST
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
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
