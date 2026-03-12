export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { food } = req.body;
  if (!food) return res.status(400).json({ error: "No food provided" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a nutrition expert. Analyse this food log and return ONLY a JSON object, no markdown, no backticks, no explanation, just raw JSON.\n\nFood: "${food}"\n\nReturn this exact structure:\n{\n  "items": [\n    { "name": "food item", "calories": 123, "protein": 12, "carbs": 15, "fat": 5 }\n  ],\n  "totals": { "calories": 456, "protein": 30, "carbs": 45, "fat": 15 }\n}\n\nRules:\n- Break into individual food items\n- Use realistic average estimates for Indian and international foods\n- All values must be numbers (never strings)\n- protein, carbs, fat in grams\n- If quantity not specified, assume 1 standard serving\n- Return ONLY the JSON object, nothing else`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", errText);
      return res.status(500).json({ error: "Anthropic API error" });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Failed to analyse food" });
  }
}