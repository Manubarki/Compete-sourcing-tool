'use strict';

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Gathers all context and asks Claude to craft a personalised motivational
 * Slack message. Returns the message text.
 *
 * @param {Object} context
 * @param {Array}  context.emails    - from gmail integration
 * @param {Array}  context.events    - from calendar integration
 * @param {Array}  context.slack     - from slack integration
 * @param {Array}  context.granola   - from granola integration
 */
async function generateMotivation(context) {
  const client  = getClient();
  const name    = process.env.USER_NAME || 'there';
  const now     = new Date().toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

  const contextBlocks = buildContextBlocks(context);

  const systemPrompt = `You are a warm, insightful personal motivator and coach. \
Your job is to craft a short, personalised Slack message that genuinely energises \
the recipient based on what's actually happening in their day.

Rules:
- 2-4 sentences max. Concise. No filler words.
- Reference at least one *specific* detail from the provided context (a meeting, \
  an email topic, a Slack thread, a Granola note). Never sound generic.
- Acknowledge challenges honestly; don't dismiss them.
- End on a forward-looking, energising note.
- Use Slack markdown (*bold*, _italic_) sparingly for emphasis.
- One relevant emoji is fine; avoid emoji overload.
- Do NOT start with "Hey" or "Hi". Be direct and personal.
- Return ONLY the message text. No subject line, no signature.`;

  const userPrompt = `It is ${now}. Please write a motivational Slack message for ${name}.

Here is their current context:

${contextBlocks}

Write the message now.`;

  const stream = await client.messages.stream({
    model:      'claude-opus-4-6',
    max_tokens: 512,
    thinking:   { type: 'adaptive' },
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const finalMsg = await stream.finalMessage();
  const textBlock = finalMsg.content.find(b => b.type === 'text');
  return (textBlock?.text || '').trim();
}

function buildContextBlocks({ emails = [], events = [], slack = [], granola = [] }) {
  const parts = [];

  // Calendar
  if (events.length) {
    parts.push('**UPCOMING CALENDAR EVENTS (next 24 h):**');
    events.forEach(e => {
      const time     = e.isAllDay ? 'all-day' : formatTime(e.start);
      const attendee = e.attendees.length ? ` (with ${e.attendees.length} people)` : '';
      parts.push(`• ${e.title} at ${time}${attendee}`);
      if (e.description) parts.push(`  → ${e.description}`);
    });
    parts.push('');
  }

  // Email
  if (emails.length) {
    parts.push('**RECENT INBOX (last ~12 emails):**');
    emails.slice(0, 8).forEach(e => {
      parts.push(`• From: ${e.from.split('<')[0].trim()} | Subject: ${e.subject}`);
      if (e.snippet) parts.push(`  → ${e.snippet.slice(0, 120)}`);
    });
    parts.push('');
  }

  // Slack
  if (slack.length) {
    parts.push('**RECENT SLACK MESSAGES (last 6 h):**');
    slack.slice(0, 12).forEach(m => {
      parts.push(`• [${m.ts.slice(11, 16)}] ${m.text.slice(0, 150)}`);
    });
    parts.push('');
  }

  // Granola
  if (granola.length) {
    parts.push('**RECENT GRANOLA MEETING NOTES:**');
    granola.forEach(n => {
      parts.push(`• ${n.title}${n.date ? ' (' + n.date.slice(0, 10) + ')' : ''}`);
      if (n.excerpt) parts.push(`  → ${n.excerpt}`);
    });
    parts.push('');
  }

  if (!parts.length) {
    return '(No context data available — generate a universally uplifting message based on the time of day.)';
  }

  return parts.join('\n');
}

function formatTime(iso) {
  if (!iso) return 'unknown time';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch (_) {
    return iso;
  }
}

module.exports = { generateMotivation };
