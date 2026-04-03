# Motivation App

Reads your **email, calendar, Slack, and Granola** then sends you a personalised motivational Slack message throughout the day, powered by Claude Opus 4.6.

---

## Quick start

### 1. Install

```bash
cd motivation-app
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | What it is |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-…`) — see below |
| `SLACK_CHANNEL_ID` | Channel ID to **post** messages into |
| `SLACK_READ_CHANNEL_IDS` | Comma-separated channel IDs to **read** context from |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for Gmail + Calendar) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `USER_NAME` | Your first name |
| `CRON_SCHEDULE` | When to send messages (default: 8,10,12,14,16,18 Mon–Fri) |
| `GRANOLA_DB_PATH` | Path to Granola's SQLite DB (auto-detected if blank) |

### 3. Set up Slack bot

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. Under **OAuth & Permissions → Bot Token Scopes**, add:
   - `channels:history`, `channels:read`, `chat:write`, `users:read`
3. Install the app to your workspace → copy the `xoxb-…` token
4. Invite the bot to your target channel: `/invite @yourbot`

### 4. Set up Google OAuth (Gmail + Calendar)

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project
2. Enable **Gmail API** and **Google Calendar API**
3. Create **OAuth 2.0 credentials** (Desktop app type)
4. Copy Client ID + Secret into `.env`
5. Run the one-time setup:

```bash
npm run setup
```

Your browser opens for Google sign-in. Tokens are saved to `tokens/google.json`.

### 5. Run

```bash
# Start the daemon (fires immediately, then on schedule)
npm start

# Send one message right now
npm run send-now
```

---

## How it works

```
Every N hours
    ↓
Gather context in parallel
  ├── Gmail: last 12 inbox emails (subject, sender, snippet)
  ├── Google Calendar: next 8 events in the next 24 h
  ├── Slack: last 6 h of messages from configured channels
  └── Granola: last 5 meeting notes from local SQLite DB
    ↓
Claude Opus 4.6 (adaptive thinking)
  → reads context, crafts a 2-4 sentence personalised message
    ↓
Slack chat.postMessage → your channel
```

Each integration fails gracefully — if Gmail tokens are missing or Granola isn't installed, the others still run.

---

## Granola notes

Granola stores meeting notes in a SQLite database at:
```
~/Library/Application Support/Granola/granola.db
```
The app auto-detects this path. Set `GRANOLA_DB_PATH` in `.env` to override.

---

## Schedule format

Uses [node-cron](https://github.com/kelektiv/node-cron) syntax:
```
 ┌────────── second (0-59)
 │ ┌──────── minute (0-59)
 │ │ ┌────── hour (0-23)
 │ │ │ ┌──── day of month
 │ │ │ │ ┌── month
 │ │ │ │ │ ┌ day of week (0=Sun, 1=Mon…)
 │ │ │ │ │ │
 0 0 8,10,12,14,16,18 * * 1-5   ← default
```
