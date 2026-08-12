module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let jd;
  try {
    const rawBody = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    const parsed = JSON.parse(rawBody);
    jd = parsed.jd;
  } catch (e) {
    return res.status(400).json({ error: "Bad request body: " + e.message });
  }

  if (!jd || jd.trim().length < 60) {
    return res.status(400).json({ error: "JD text too short" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const prompt = `You are a senior technical recruiter. Analyse this job description carefully.

Return ONLY a raw JSON object. No markdown, no backticks, no explanation. Start with { end with }.

{
  "team": "team name e.g. Data Platform, ML Infra, Growth Engineering",
  "product": "specific product area e.g. Data Catalog, Query Engine, Observability Pipeline",
  "level": "seniority level e.g. Senior, Staff, Principal, Director",
  "key_requirements": ["req 1", "req 2", "req 3", "req 4", "req 5"],
  "search_keywords": ["2-3 short skill/tech keywords best for LinkedIn search e.g. dbt, spark, data catalog"],
  "competitors": ["Company1", "Company2", "Company3", "Company4", "Company5"]
}

Rules:
- competitors: ONLY companies building the EXACT same product/category (not general tech companies)
- search_keywords: short terms a recruiter types on LinkedIn to find this person
- No text outside the JSON

Job Description:
${jd.slice(0, 4000)}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Anthropic API error: " + err.slice(0, 300) });
    }

    const data = await response.json();
    const raw = data.content.filter(b => b.type === "text").map(b => b.text).join("");

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch {}
    if (!parsed) {
      const stripped = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      try { parsed = JSON.parse(stripped); } catch {}
    }
    if (!parsed) {
      const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
      if (a !== -1 && b > a) try { parsed = JSON.parse(raw.slice(a, b + 1)); } catch {}
    }
    if (!parsed || !parsed.competitors) {
      return res.status(500).json({ error: "Could not parse AI response", raw: raw.slice(0, 500) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
