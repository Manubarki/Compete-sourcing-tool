const http = require("http");
const fs = require("fs");
const path = require("path");

// Load .env file if present (no external dependency needed)
try {
  fs.readFileSync(".env", "utf8").split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

const PORT = process.env.PORT || 3000;

// Add Vercel-style helpers to Node's native res object
function adapt(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json   = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };
  return res;
}

const routes = {
  "/api/analyze": require("./analyze"),
  "/api/usage":   require("./usage"),
};

http.createServer(async (req, res) => {
  adapt(res);
  const handler = routes[req.url.split("?")[0]];
  if (handler) {
    try { await handler(req, res); } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }
  // Serve index.html for everything else
  fs.readFile(path.join(__dirname, "index.html"), (err, data) => {
    if (err) { res.statusCode = 404; res.end("Not found"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  App running → http://localhost:${PORT}\n`);
});
