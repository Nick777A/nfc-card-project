const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const REDIS_KEY = 'nfc-card-db';

const REDIS_URL = process.env.REDIS_URL;
let redisClient = null;
if (REDIS_URL) {
  const Redis = require('ioredis');
  redisClient = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
  redisClient.on('error', (err) => console.error('Redis error:', err.message));
}

function defaultData() {
  return {
    admin: {
      username: 'admin',
      // default password: "admin123" — change it after first login in production use
      passwordHash: bcrypt.hashSync('admin123', 10)
    },
    cards: []
  };
}

function loadFromFile() {
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveToFile(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Single in-memory copy, read/written synchronously by every request handler
// so the rest of the app never has to know or care whether persistence is
// local-disk or Redis. Local disk is a best-effort cache (instant, but wiped
// on every redeploy on free hosting tiers); when REDIS_URL is set, Redis is
// the durable source of truth and every mutation is also pushed there.
let state = loadFromFile() || defaultData();

/**
 * Must be awaited once at startup, before the server accepts requests.
 * Pulls the durable copy from Redis (if configured) into memory.
 */
async function init() {
  if (!redisClient) return;
  try {
    const raw = await redisClient.get(REDIS_KEY);
    if (raw) {
      state = JSON.parse(raw);
    } else {
      // First run against this Redis instance: seed it with what we have.
      await redisClient.set(REDIS_KEY, JSON.stringify(state));
    }
  } catch (err) {
    console.error('Failed to load from Redis, falling back to local disk copy:', err.message);
  }
}

function persist() {
  saveToFile(state);
  if (redisClient) {
    redisClient.set(REDIS_KEY, JSON.stringify(state)).catch((err) => {
      console.error('Failed to persist to Redis:', err.message);
    });
  }
}

module.exports = {
  init,
  getAdmin() {
    return state.admin;
  },
  setAdminPassword(newPasswordHash) {
    state.admin.passwordHash = newPasswordHash;
    persist();
  },
  listCards() {
    return [...state.cards].sort((a, b) => b.createdAt - a.createdAt);
  },
  getCardBySlug(slug) {
    return state.cards.find((c) => c.slug === slug) || null;
  },
  getCardById(id) {
    return state.cards.find((c) => c.id === id) || null;
  },
  addCard(card) {
    state.cards.push(card);
    persist();
    return card;
  },
  updateCard(id, patch) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return null;
    Object.assign(card, patch);
    persist();
    return card;
  },
  deleteCard(id) {
    state.cards = state.cards.filter((c) => c.id !== id);
    persist();
  },
  slugTaken(slug, excludeId) {
    return state.cards.some((c) => c.slug === slug && c.id !== excludeId);
  },
  recordView(id) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    card.viewCount = (card.viewCount || 0) + 1;
    card.lastViewedAt = Date.now();
    persist();
  },
  exportCards() {
    return state.cards;
  },
  /** Replaces all cards wholesale (used by the backup-restore flow). Admin credentials are left untouched. */
  importCards(cards) {
    if (!Array.isArray(cards)) throw new Error('Ожидался массив карточек');
    state.cards = cards;
    persist();
  }
};
