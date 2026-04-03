'use strict';

const { WebClient } = require('@slack/web-api');

let _client = null;

function getClient() {
  if (!_client && process.env.SLACK_BOT_TOKEN) {
    _client = new WebClient(process.env.SLACK_BOT_TOKEN);
  }
  return _client;
}

/**
 * Reads recent messages from configured SLACK_READ_CHANNEL_IDS.
 * Returns an array of { channel, user, text, ts } objects.
 */
async function fetchRecentMessages(maxPerChannel = 20) {
  const client = getClient();
  if (!client) {
    console.warn('[slack] skipped: no SLACK_BOT_TOKEN');
    return [];
  }

  const channelIds = (process.env.SLACK_READ_CHANNEL_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!channelIds.length) return [];

  const all = [];
  const oldest = String(Math.floor(Date.now() / 1000) - 6 * 60 * 60); // last 6 h

  for (const channelId of channelIds) {
    try {
      const res = await client.conversations.history({
        channel: channelId,
        limit:   maxPerChannel,
        oldest,
      });

      const msgs = (res.messages || [])
        .filter(m => m.type === 'message' && !m.bot_id && m.text)
        .map(m => ({
          channel: channelId,
          user:    m.user || 'unknown',
          text:    m.text.replace(/<[^>]+>/g, '').trim(), // strip Slack mention/link markup
          ts:      new Date(parseFloat(m.ts) * 1000).toISOString(),
        }));

      all.push(...msgs);
    } catch (err) {
      console.warn(`[slack] channel ${channelId} skipped:`, err.message);
    }
  }

  return all;
}

/**
 * Sends a message to SLACK_CHANNEL_ID.
 */
async function sendMessage(text) {
  const client = getClient();
  if (!client) throw new Error('SLACK_BOT_TOKEN not set');

  const channelId = process.env.SLACK_CHANNEL_ID;
  if (!channelId) throw new Error('SLACK_CHANNEL_ID not set');

  await client.chat.postMessage({
    channel: channelId,
    text,
    mrkdwn: true,
  });
}

module.exports = { fetchRecentMessages, sendMessage };
