# JD → Competitor Profiles

Paste a job description → AI identifies the exact product, team, and competitors → returns top 20 sourcing profiles.

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "init"
gh repo create jd-sourcing-tool --public --push
```

### 2. Deploy on Vercel
```bash
npx vercel --prod
```
Or connect the GitHub repo at vercel.com → Import Project.

### 3. Add environment variable
In Vercel dashboard → Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-...
```

### 4. Redeploy
```bash
npx vercel --prod
```

## Local dev
```bash
npm install -g vercel
ANTHROPIC_API_KEY=sk-ant-... vercel dev
```
Then open http://localhost:3000

## How it works
- `public/index.html` — the full UI (tabs, file upload, profile cards)
- `api/analyze.js` — Vercel serverless function → calls Anthropic API → returns JSON
- `vercel.json` — routes `/api/*` to serverless, everything else to static
