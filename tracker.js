const fs = require("fs");
const os = require("os");
const path = require("path");

// Cross-platform writable temp dir (works on Vercel, Mac, Windows, Linux)
const STORAGE_PATH = path.join(os.tmpdir(), "jd-sourcing-usage-stats.json");

// Cost per unit (USD) — update as pricing changes
const COSTS = {
  claude: {
    input_per_1m: 3.0,   // claude-sonnet-4-6: $3/M input tokens
    output_per_1m: 15.0, // claude-sonnet-4-6: $15/M output tokens
  },
  serper: {
    per_request: 0.005,  // ~$5 per 1,000 searches
  },
  github: {
    per_request: 0,      // Free tier (rate-limited at 60 req/hr unauthenticated)
  },
  litellm: {
    input_per_1m: 0,     // Variable — depends on underlying model configured
    output_per_1m: 0,
  },
};

function emptyStats() {
  return {
    claude:  { requests: 0, input_tokens: 0, output_tokens: 0, errors: 0, cost_usd: 0 },
    serper:  { requests: 0, errors: 0, cost_usd: 0 },
    github:  { requests: 0, errors: 0, cost_usd: 0 },
    litellm: { requests: 0, input_tokens: 0, output_tokens: 0, errors: 0, cost_usd: 0 },
    total_cost_usd: 0,
    last_updated: null,
    calls: [], // ring buffer of last 100 calls
  };
}

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_PATH, "utf8"));
  } catch {
    return emptyStats();
  }
}

function saveStats(stats) {
  stats.total_cost_usd =
    (stats.claude.cost_usd || 0) +
    (stats.serper.cost_usd || 0) +
    (stats.litellm.cost_usd || 0);
  stats.last_updated = new Date().toISOString();
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(stats, null, 2), "utf8");
  } catch (e) {
    console.error("[tracker] write failed:", e.message);
  }
}

function pushCall(stats, entry) {
  if (!Array.isArray(stats.calls)) stats.calls = [];
  stats.calls.unshift({ ts: new Date().toISOString(), ...entry });
  if (stats.calls.length > 100) stats.calls.length = 100;
}

// ── Claude ──────────────────────────────────────────────────────────────────
// Pass the parsed Anthropic response body; set isError=true on failure.
function trackClaude(responseData, isError = false) {
  const stats = loadStats();
  stats.claude.requests++;
  if (isError) {
    stats.claude.errors++;
    pushCall(stats, { service: "claude", status: "error" });
  } else {
    const inp = responseData?.usage?.input_tokens || 0;
    const out = responseData?.usage?.output_tokens || 0;
    const cost =
      (inp / 1_000_000) * COSTS.claude.input_per_1m +
      (out / 1_000_000) * COSTS.claude.output_per_1m;
    stats.claude.input_tokens += inp;
    stats.claude.output_tokens += out;
    stats.claude.cost_usd += cost;
    pushCall(stats, {
      service: "claude",
      status: "ok",
      model: responseData?.model,
      input_tokens: inp,
      output_tokens: out,
      cost_usd: +cost.toFixed(6),
    });
  }
  saveStats(stats);
}

// ── Serper ───────────────────────────────────────────────────────────────────
// Call after each Serper search request.
function trackSerper(isError = false, query = "") {
  const stats = loadStats();
  stats.serper.requests++;
  if (isError) {
    stats.serper.errors++;
    pushCall(stats, { service: "serper", status: "error", query });
  } else {
    const cost = COSTS.serper.per_request;
    stats.serper.cost_usd += cost;
    pushCall(stats, { service: "serper", status: "ok", query, cost_usd: cost });
  }
  saveStats(stats);
}

// ── GitHub ───────────────────────────────────────────────────────────────────
// Call after each GitHub API request.
function trackGithub(endpoint = "", isError = false) {
  const stats = loadStats();
  stats.github.requests++;
  if (isError) {
    stats.github.errors++;
    pushCall(stats, { service: "github", status: "error", endpoint });
  } else {
    pushCall(stats, { service: "github", status: "ok", endpoint });
  }
  saveStats(stats);
}

// ── LiteLLM ──────────────────────────────────────────────────────────────────
// Pass the LiteLLM/OpenAI-compatible response body.
function trackLiteLLM(responseData, isError = false) {
  const stats = loadStats();
  stats.litellm.requests++;
  if (isError) {
    stats.litellm.errors++;
    pushCall(stats, { service: "litellm", status: "error" });
  } else {
    const inp = responseData?.usage?.prompt_tokens || 0;
    const out = responseData?.usage?.completion_tokens || 0;
    stats.litellm.input_tokens += inp;
    stats.litellm.output_tokens += out;
    pushCall(stats, {
      service: "litellm",
      status: "ok",
      model: responseData?.model,
      input_tokens: inp,
      output_tokens: out,
    });
  }
  saveStats(stats);
}

function getStats() {
  return loadStats();
}

function resetStats() {
  const fresh = emptyStats();
  saveStats(fresh);
  return fresh;
}

module.exports = { trackClaude, trackSerper, trackGithub, trackLiteLLM, getStats, resetStats };
