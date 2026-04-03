'use strict';

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../../tokens/google.json');

/**
 * Returns upcoming calendar events in the next `hoursAhead` hours.
 * Fails gracefully.
 */
async function fetchUpcomingEvents(hoursAhead = 24, max = 8) {
  try {
    const auth = buildAuth();
    if (!auth) return [];

    const calendar = google.calendar({ version: 'v3', auth });
    const now      = new Date();
    const end      = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin:    now.toISOString(),
      timeMax:    end.toISOString(),
      maxResults: max,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items || []).map(event => ({
      id:         event.id,
      title:      event.summary || '(No title)',
      start:      event.start?.dateTime || event.start?.date,
      end:        event.end?.dateTime   || event.end?.date,
      attendees:  (event.attendees || []).map(a => a.email).slice(0, 5),
      location:   event.location || '',
      description: (event.description || '').slice(0, 200),
      isAllDay:   !event.start?.dateTime,
    }));
  } catch (err) {
    console.warn('[calendar] skipped:', err.message);
    return [];
  }
}

function buildAuth() {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
    if (!fs.existsSync(TOKEN_PATH)) return null;

    const tokens       = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const oAuth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth/callback',
    );
    oAuth2Client.setCredentials(tokens);

    oAuth2Client.on('tokens', (newTokens) => {
      const merged = { ...tokens, ...newTokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    });

    return oAuth2Client;
  } catch (_) {
    return null;
  }
}

module.exports = { fetchUpcomingEvents };
