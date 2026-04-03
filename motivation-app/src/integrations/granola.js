'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Candidate paths where Granola might store its database
const CANDIDATE_PATHS = [
  process.env.GRANOLA_DB_PATH,
  path.join(os.homedir(), 'Library', 'Application Support', 'Granola', 'granola.db'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Granola', 'db.sqlite'),
  path.join(os.homedir(), 'Library', 'Application Support', 'Granola', 'notes.db'),
  // Electron apps sometimes use userData in a versioned folder
  path.join(os.homedir(), 'Library', 'Application Support', 'granola', 'granola.db'),
].filter(Boolean);

/**
 * Reads recent meeting notes from Granola's local SQLite database.
 * Tries multiple candidate DB paths and multiple table/column name schemes.
 * Returns [] gracefully if Granola is not installed or DB can't be read.
 */
function fetchRecentNotes(max = 5) {
  const dbPath = CANDIDATE_PATHS.find(p => fs.existsSync(p));
  if (!dbPath) {
    console.warn('[granola] database not found – skipping');
    return [];
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (_) {
    console.warn('[granola] better-sqlite3 not installed – skipping');
    return [];
  }

  let db;
  try {
    // Open in read-only mode so we never corrupt Granola's data
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.warn('[granola] could not open DB:', err.message);
    return [];
  }

  try {
    // Discover what tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map(r => r.name.toLowerCase());

    const notes = [];

    // Strategy 1: notes table
    if (tables.includes('notes')) {
      notes.push(...readTable(db, 'notes', max));
    }

    // Strategy 2: documents table (some versions)
    if (!notes.length && tables.includes('documents')) {
      notes.push(...readTable(db, 'documents', max));
    }

    // Strategy 3: meetings table
    if (!notes.length && tables.includes('meetings')) {
      notes.push(...readTable(db, 'meetings', max));
    }

    return notes.slice(0, max);
  } catch (err) {
    console.warn('[granola] query error:', err.message);
    return [];
  } finally {
    db.close();
  }
}

/**
 * Tries several column-name combinations to extract title + body from a table.
 */
function readTable(db, tableName, max) {
  try {
    const cols = db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map(r => r.name.toLowerCase());

    const titleCol   = cols.find(c => ['title', 'name', 'summary', 'heading'].includes(c)) || cols[0];
    const bodyCol    = cols.find(c => ['body', 'content', 'text', 'transcript', 'notes', 'description'].includes(c));
    const dateCol    = cols.find(c => ['created_at', 'updated_at', 'date', 'timestamp', 'created', 'started_at'].includes(c));

    let query = `SELECT ${titleCol}`;
    if (bodyCol)  query += `, ${bodyCol}`;
    if (dateCol)  query += `, ${dateCol}`;
    query += ` FROM ${tableName}`;
    if (dateCol)  query += ` ORDER BY ${dateCol} DESC`;
    query += ` LIMIT ${max}`;

    return db.prepare(query).all().map(row => ({
      title:   String(row[titleCol] || '').trim().slice(0, 120),
      excerpt: bodyCol ? String(row[bodyCol] || '').replace(/\s+/g, ' ').trim().slice(0, 400) : '',
      date:    dateCol ? String(row[dateCol] || '') : '',
    })).filter(n => n.title || n.excerpt);
  } catch (err) {
    console.warn(`[granola] table ${tableName} read error:`, err.message);
    return [];
  }
}

module.exports = { fetchRecentNotes };
