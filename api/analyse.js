export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { food } = req.body;
  if (!food) return res.status(400).json({ error: "No food provided" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a nutrition expert. Analyse this food log and return ONLY a JSON object, no markdown, no explanation, no backticks.

Food: "${food}"

Return this exact structure:
{"items":[{"name":"food item","calories":123,"protein":12,"carbs":15,"fat":5}],"totals":{"calories":456,"protein":30,"carbs":45,"fat":15}}

Rules:
- Break into individual food items
- Use realistic average estimates
- All values are numbers not strings
- protein carbs fat in grams
- If quantity not specified assume 1 standard serving`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "Anthropic API error", detail: errText });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: e.message });
  }
}