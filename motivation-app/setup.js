#!/usr/bin/env node
/**
 * setup.js — one-time OAuth setup for Google (Gmail + Calendar)
 * Run: node setup.js
 */

'use strict';

const { google } = require('googleapis');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const url        = require('url');
require('dotenv').config();

const TOKEN_PATH = path.join(__dirname, 'tokens', 'google.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

async function main() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('\n❌  Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
    console.error('   Create credentials at https://console.cloud.google.com');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth/callback',
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('\n🔑  Opening browser for Google OAuth…');
  console.log('   If the browser does not open, paste this URL manually:\n');
  console.log('  ', authUrl, '\n');

  // Try to open the browser
  try {
    const { default: open } = await import('open');
    await open(authUrl);
  } catch (_) {
    // silently skip – user will paste manually
  }

  // Start a tiny local server to receive the redirect
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname === '/oauth/callback' && parsed.query.code) {
        res.end('<h2>✅ Authentication successful — you can close this tab.</h2>');
        server.close();
        resolve(parsed.query.code);
      } else if (parsed.query.error) {
        res.end('<h2>❌ Authentication failed: ' + parsed.query.error + '</h2>');
        server.close();
        reject(new Error(parsed.query.error));
      }
    });
    server.listen(3001, () => console.log('   Waiting for OAuth redirect on port 3001…'));
  });

  const { tokens } = await oAuth2Client.getToken(code);

  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\n✅  Google tokens saved to ${TOKEN_PATH}`);
  console.log('\n🚀  Setup complete! Run  npm start  to launch the motivator.\n');
}

main().catch(err => {
  console.error('Setup error:', err.message);
  process.exit(1);
});
