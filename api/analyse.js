export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { food } = req.body;
  if (!food) return res.status(400).json({ error: "No food provided" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a nutrition expert. Analyse this food log and return ONLY a JSON object, no markdown, no explanation, no backticks.

Food: "${food}"

Return this exact structure:
{
  "items": [
    { "name": "food item", "calories": 123, "protein": 12, "carbs": 15, "fat": 5 }
  ],
  "totals": { "calories": 456, "protein": 30, "carbs": 45, "fat": 15 }
}

Rules:
- Break into individual food items
- Use realistic average estimates for Indian and international foods
- All values are numbers (no strings)
- protein/carbs/fat in grams
- If quantity not specified, assume 1 standard serving`
            }]
          }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    if (!parsed.items || !parsed.totals) throw new Error("Invalid response structure");

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to analyse food", detail: e.message });
  }
}