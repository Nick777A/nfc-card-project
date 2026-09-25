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
      passwordHash: bcrypt.hashSync('admin123', 10),
      recoveryCodeHash: null,
      failedAttempts: 0,
      lockedUntil: null
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

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Permanently drops trash older than the retention window. Called whenever the trash is viewed. */
function purgeOldTrash() {
  const before = state.cards.length;
  state.cards = state.cards.filter((c) => !(c.deletedAt && Date.now() - c.deletedAt > TRASH_RETENTION_MS));
  if (state.cards.length !== before) persist();
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
  setRecoveryCodeHash(hash) {
    state.admin.recoveryCodeHash = hash;
    persist();
  },
  recordFailedLogin(maxAttempts, lockoutMs) {
    const admin = state.admin;
    admin.failedAttempts = (admin.failedAttempts || 0) + 1;
    if (admin.failedAttempts >= maxAttempts) {
      admin.lockedUntil = Date.now() + lockoutMs;
      admin.failedAttempts = 0;
    }
    persist();
  },
  recordSuccessfulLogin() {
    state.admin.failedAttempts = 0;
    state.admin.lockedUntil = null;
    persist();
  },
  getLockoutRemainingMs() {
    const until = state.admin.lockedUntil;
    if (!until) return 0;
    return Math.max(0, until - Date.now());
  },
  listCards() {
    return state.cards
      .filter((c) => !c.deletedAt)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
  /** Soft-deleted cards, newest-deleted first. Auto-purges anything older than 30 days. */
  listTrash() {
    purgeOldTrash();
    return state.cards
      .filter((c) => c.deletedAt)
      .sort((a, b) => b.deletedAt - a.deletedAt);
  },
  getCardBySlug(slug) {
    // Public lookups must not resolve a card that's in the trash.
    return state.cards.find((c) => c.slug === slug && !c.deletedAt) || null;
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
  /** Soft delete: moves the card to the trash (recoverable for 30 days) instead of erasing it. */
  deleteCard(id) {
    const card = state.cards.find((c) => c.id === id);
    if (card) card.deletedAt = Date.now();
    persist();
  },
  restoreCard(id) {
    const card = state.cards.find((c) => c.id === id);
    if (card) delete card.deletedAt;
    persist();
    return card || null;
  },
  permanentlyDeleteCard(id) {
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
