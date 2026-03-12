export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { food } = req.body;
  if (!food) return res.status(400).json({ error: "No food provided" });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a nutrition expert. Analyse this food and return ONLY raw JSON with no markdown, no backticks, no explanation whatsoever. Just the JSON object starting with { and ending with }.

Food: "${food}"

Required JSON structure:
{"items":[{"name":"food name","calories":100,"protein":10,"carbs":15,"fat":5}],"totals":{"calories":100,"protein":10,"carbs":15,"fat":5}}

Use realistic estimates. All values must be numbers not strings.`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    // Check for API errors
    if (data.error) {
      return res.status(500).json({ error: "Gemini API error", detail: JSON.stringify(data.error) });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!raw) {
      return res.status(500).json({ error: "Empty response from Gemini", detail: JSON.stringify(data) });
    }

    // Extract JSON from the response - find the first { to last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: "No JSON found in response", detail: raw });
    }

    const jsonStr = raw.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr);

    if (!parsed.items || !parsed.totals) {
      return res.status(500).json({ error: "Invalid structure", detail: jsonStr });
    }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to analyse food", detail: e.message });
  }
}