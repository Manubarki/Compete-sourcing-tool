const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Config (stored in platform userData dir) ────────────────────────────────
function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), "utf8")); }
  catch { return { anthropicApiKey: "" }; }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 680,
    minHeight: 540,
    title: "JD → Competitor Profiles",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");

  // Open external links in the system browser, not inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file://")) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: config ─────────────────────────────────────────────────────────────
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("save-config", (_, cfg) => { saveConfig(cfg); return { ok: true }; });

// ── IPC: analyze (Claude API) ────────────────────────────────────────────────
const PROMPT_TEMPLATE = (jd) => `You are a senior technical recruiter. Analyse this job description carefully.

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

ipcMain.handle("analyze", async (_, jd) => {
  const { trackClaude } = require("./tracker");
  const cfg = loadConfig();
  const apiKey = cfg.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("API key not configured — add it in the Settings tab.");

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content: PROMPT_TEMPLATE(jd) }],
      }),
    });
  } catch (err) {
    trackClaude(null, true);
    throw new Error("Network error: " + err.message);
  }

  if (!response.ok) {
    const errText = await response.text();
    trackClaude(null, true);
    throw new Error("Anthropic API error: " + errText.slice(0, 300));
  }

  const data = await response.json();
  trackClaude(data);

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
    throw new Error("Could not parse AI response: " + raw.slice(0, 200));
  }

  return parsed;
});

// ── IPC: usage stats ─────────────────────────────────────────────────────────
ipcMain.handle("get-usage",   () => { const { getStats }   = require("./tracker"); return getStats(); });
ipcMain.handle("reset-usage", () => { const { resetStats } = require("./tracker"); return resetStats(); });
