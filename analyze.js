module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { jd } = req.body || {};
  if (!jd || jd.trim().length < 60) {
    return res.status(400).json({ error: "JD text too short" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const prompt = `You are a senior technical recruiter. Analyse this job description carefully.

Return ONLY a raw JSON object. No markdown, no backticks, no explanation before or after. Start with { and end with }.

Use this exact structure:
{
  "team": "team name e.g. Data Platform, ML Infra, Growth Engineering",
  "product": "specific product area e.g. Data Catalog, Observability Pipeline",
  "level": "seniority level e.g. Senior, Staff, L5, Principal",
  "key_requirements": ["requirement 1", "requirement 2", "requirement 3", "requirement 4", "requirement 5"],
  "competitors": ["Company1", "Company2", "Company3", "Company4", "Company5"],
  "profiles": [
    {
      "rank": 1,
      "name": "First Last",
      "current_role": "Job Title",
      "current_company": "Company",
      "years_exp": 6,
      "match_reason": "2-3 sentences explaining why this person is a strong match — reference specific skills, tech, or experience from the JD.",
      "linkedin_search": "https://www.linkedin.com/search/results/people/?keywords=First+Last+Company"
    }
  ]
}

Critical rules:
- competitors: ONLY companies building the EXACT same product/category
- profiles: exactly 20, distributed across competitor companies
- years_exp must be an integer
- No text or markdown outside the JSON object

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
        model: "claude-opus-4-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: "Anthropic API error: " + err.slice(0, 300) });
    }

    const data = await response.json();
    const raw = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");

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
    if (!parsed || !Array.isArray(parsed.profiles)) {
      return res.status(500).json({ error: "Could not parse AI response", raw: raw.slice(0, 500) });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
