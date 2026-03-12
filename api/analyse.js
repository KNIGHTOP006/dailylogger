export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { food } = req.body;
  if (!food) return res.status(400).json({ error: "No food provided" });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a nutrition expert. Always respond with valid JSON only, no explanation.`
          },
          {
            role: "user",
            content: `Analyse this food and return nutrition data as JSON.

Food: "${food}"

Return exactly this structure:
{
  "items": [
    { "name": "food name", "calories": 100, "protein": 10, "carbs": 15, "fat": 5 }
  ],
  "totals": { "calories": 100, "protein": 10, "carbs": 15, "fat": 5 }
}

Rules:
- Break into individual food items
- Realistic estimates including Indian foods
- All values are numbers
- protein/carbs/fat in grams
- Assume 1 standard serving if quantity not given`
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: "Groq API error", detail: JSON.stringify(data.error) });
    }

    const raw = data.choices?.[0]?.message?.content || "";
    if (!raw) {
      return res.status(500).json({ error: "Empty response", detail: JSON.stringify(data) });
    }

    const parsed = JSON.parse(raw);

    if (!parsed.items || !parsed.totals) {
      return res.status(500).json({ error: "Invalid structure", detail: raw });
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to analyse food", detail: e.message });
  }
}