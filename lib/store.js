'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// On serverless hosts (Vercel) the filesystem isn't persistent, so use Redis when configured.
// Accepts Upstash's own variable names or the KV_* names the Vercel Marketplace integration sets.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const REDIS_KEY = 'secret-santa:db';
const redis = REDIS_URL && REDIS_TOKEN
  ? new (require('@upstash/redis').Redis)({ url: REDIS_URL, token: REDIS_TOKEN })
  : null;

const EMPTY = {
  event: { name: 'Secret Santa', budget: '', date: '', message: '' },
  participants: [], // { id, name, token, exclusions: [id], viewedAt, createdAt }
  assignments: null, // { giverId: receiverId }
  drawnAt: null,
};

let cache = null;
let dirty = false;

/** Refresh the cache from Redis (call once per request). No-op in file mode. */
async function hydrate() {
  if (!redis) return;
  const data = await redis.get(REDIS_KEY);
  cache = { ...structuredClone(EMPTY), ...(data || {}) };
  dirty = false;
}

/** Write pending changes to Redis. No-op in file mode (saves happen immediately). */
async function flush() {
  if (!redis || !dirty) return;
  await redis.set(REDIS_KEY, cache);
  dirty = false;
}

function load() {
  if (cache) return cache;
  if (redis) throw new Error('store.hydrate() must run before load() when using Redis');
  try {
    cache = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    cache = structuredClone(EMPTY);
  }
  return cache;
}

function save() {
  if (redis) {
    dirty = true;
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic replace
}

/** Run a mutation against the data and persist it. */
function update(fn) {
  const db = load();
  const result = fn(db);
  save();
  return result;
}

module.exports = { load, update, hydrate, flush, DB_FILE };
