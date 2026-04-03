'use strict';

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../../tokens/google.json');

/**
 * Returns the last `max` emails as lightweight objects.
 * Fails gracefully — returns [] if tokens are missing or the API errors.
 */
async function fetchRecentEmails(max = 12) {
  try {
    const auth = buildAuth();
    if (!auth) return [];

    const gmail    = google.gmail({ version: 'v1', auth });
    const listRes  = await gmail.users.messages.list({
      userId: 'me',
      maxResults: max,
      q: 'in:inbox -category:promotions -category:social',
    });

    const messages = listRes.data.messages || [];
    const emails   = [];

    for (const msg of messages) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers = detail.data.payload.headers || [];
        const get     = (name) => (headers.find(h => h.name === name) || {}).value || '';

        emails.push({
          id:      msg.id,
          from:    get('From'),
          subject: get('Subject'),
          date:    get('Date'),
          snippet: detail.data.snippet || '',
        });
      } catch (_) { /* skip individual message errors */ }
    }

    return emails;
  } catch (err) {
    console.warn('[gmail] skipped:', err.message);
    return [];
  }
}

function buildAuth() {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
    if (!fs.existsSync(TOKEN_PATH)) return null;

    const tokens     = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth/callback',
    );
    oAuth2Client.setCredentials(tokens);

    // Persist refreshed tokens automatically
    oAuth2Client.on('tokens', (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oAuth2Client;
  } catch (_) {
    return null;
  }
}

module.exports = { fetchRecentEmails };
