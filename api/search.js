module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try {
    const raw = await new Promise((resolve, reject) => {
      let d = "";
      req.on("data", c => { d += c.toString(); });
      req.on("end", () => resolve(d));
      req.on("error", reject);
    });
    body = JSON.parse(raw);
  } catch (e) {
    return res.status(400).json({ error: "Bad request: " + e.message });
  }

  const {
    competitors = [],
    requirements = [],
    search_keywords = [],
    level = "",
    location = "",
    product = "",
    team = "",
  } = body;

  const serperKey = process.env.SERPER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!serperKey) {
    return res.status(500).json({
      error: "SERPER_API_KEY not configured. Add it in your Vercel environment variables — get a free key at serper.dev",
    });
  }
  if (!anthropicKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const skillKw = search_keywords[0] || requirements[0] || product || "";
  const locPart = location ? ` "${location}"` : "";
  const levelPart = level ? ` "${level}"` : "";

  const allResults = [];
  await Promise.all(
    competitors.slice(0, 5).map(async (company) => {
      const query = `site:linkedin.com/in "${company}"${levelPart} "${skillKw}"${locPart}`;
      try {
        const r = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: 6 }),
        });
        if (!r.ok) return;
        const d = await r.json();
        (d.organic || []).forEach(result => {
          if (result.link && result.link.includes("linkedin.com/in/")) {
            allResults.push({
              company,
              link: result.link,
              title: result.title || "",
              snippet: result.snippet || "",
            });
          }
        });
      } catch {
        // skip failed searches, continue with other companies
      }
    })
  );

  if (allResults.length === 0) {
    return res.status(200).json({
      profiles: [],
      total_found: 0,
      message: "No live results found. Try removing the location filter or selecting different companies.",
    });
  }

  const context = allResults
    .slice(0, 30)
    .map((r, i) =>
      `${i + 1}. URL: ${r.link}\nTitle: ${r.title}\nSnippet: ${r.snippet}\nCompany: ${r.company}`
    )
    .join("\n\n");

  const prompt = `You are a senior technical recruiter. Analyze these real LinkedIn profiles found via Google search and rank them for the role below.

Role context:
- Team: ${team}
- Product: ${product}
- Seniority target: ${level || "any"}
- Key requirements: ${requirements.join(", ")}
- Location preference: ${location || "any"}

LinkedIn profiles found:
${context}

Return ONLY a raw JSON array. No markdown, no extra text. Start with [ end with ].

Each element:
{
  "rank": 1,
  "name": "Full name extracted from LinkedIn title (format: 'Name - Role at Company | LinkedIn')",
  "current_role": "job title from the title field",
  "current_company": "company from the search context",
  "years_exp": 6,
  "location": "city if visible in snippet, otherwise null",
  "match_reason": "2-3 sentences on why this person fits based on their visible title/skills vs the requirements",
  "linkedin_url": "exact linkedin.com/in/... URL"
}

Rules:
- Only include profiles with valid linkedin.com/in/ URLs
- Estimate years_exp from seniority in title: Junior=2, Mid=4, Senior=6, Staff=8, Principal=10, Director=12
- Rank by relevance to the role
- Return up to 20 profiles`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "AI ranking error: " + err.slice(0, 200) });
    }

    const d = await r.json();
    const raw = d.content.filter(b => b.type === "text").map(b => b.text).join("");

    let profiles = null;
    try { profiles = JSON.parse(raw); } catch {}
    if (!profiles) {
      const s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      try { profiles = JSON.parse(s); } catch {}
    }
    if (!profiles) {
      const a = raw.indexOf("["), b = raw.lastIndexOf("]");
      if (a !== -1 && b > a) try { profiles = JSON.parse(raw.slice(a, b + 1)); } catch {}
    }
    if (!Array.isArray(profiles)) {
      return res.status(500).json({ error: "Could not parse AI response", raw: raw.slice(0, 300) });
    }

    return res.status(200).json({ profiles, total_found: allResults.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
