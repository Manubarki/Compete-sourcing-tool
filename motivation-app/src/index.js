#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const cron = require('node-cron');

const { fetchRecentEmails }    = require('./integrations/gmail');
const { fetchUpcomingEvents }  = require('./integrations/calendar');
const { fetchRecentMessages, sendMessage } = require('./integrations/slack');
const { fetchRecentNotes }     = require('./integrations/granola');
const { generateMotivation }   = require('./motivator');

// ─── Validate required env vars ───────────────────────────────────────────────

function validateEnv() {
  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!process.env.SLACK_BOT_TOKEN)   missing.push('SLACK_BOT_TOKEN');
  if (!process.env.SLACK_CHANNEL_ID)  missing.push('SLACK_CHANNEL_ID');
  if (missing.length) {
    console.error(`\n❌  Missing required env vars: ${missing.join(', ')}`);
    console.error('   Copy .env.example → .env and fill them in.\n');
    process.exit(1);
  }
}

// ─── Core: gather → generate → send ──────────────────────────────────────────

async function run() {
  const startedAt = new Date().toLocaleTimeString();
  console.log(`\n[${startedAt}] 🔍 Gathering context…`);

  const [emails, events, slack, granola] = await Promise.all([
    fetchRecentEmails(12),
    fetchUpcomingEvents(24, 8),
    fetchRecentMessages(20),
    Promise.resolve().then(() => fetchRecentNotes(5)), // sync, wrapped in promise
  ]);

  console.log(`  ✉️  ${emails.length} emails  📅 ${events.length} events  💬 ${slack.length} Slack msgs  📓 ${granola.length} Granola notes`);

  console.log('  🤔 Generating message with Claude…');
  const message = await generateMotivation({ emails, events, slack, granola });

  if (!message) {
    console.error('  ⚠️  Claude returned an empty message – skipping send.');
    return;
  }

  console.log(`\n  💬 Message:\n  "${message}"\n`);

  await sendMessage(message);
  console.log(`  ✅  Sent to Slack channel ${process.env.SLACK_CHANNEL_ID}\n`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

validateEnv();

const runOnce = process.argv.includes('--once');

if (runOnce) {
  // npm run send-now
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else {
  // Scheduled daemon
  const schedule = process.env.CRON_SCHEDULE || '0 0 8,10,12,14,16,18 * * 1-5';
  console.log(`\n🚀 Motivation daemon started`);
  console.log(`   Schedule: ${schedule}`);
  console.log(`   Slack channel: ${process.env.SLACK_CHANNEL_ID}`);
  console.log(`   Press Ctrl+C to stop\n`);

  // Fire immediately on startup so you don't wait for the first cron tick
  run().catch(err => console.error('Startup run error:', err.message));

  cron.schedule(schedule, () => {
    run().catch(err => console.error('Scheduled run error:', err.message));
  }, {
    scheduled: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}
