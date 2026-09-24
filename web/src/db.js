const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

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

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const data = defaultData();
    save(data);
    return data;
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    const data = defaultData();
    save(data);
    return data;
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Single in-memory copy, flushed to disk after every mutation. Fine for a
// single-process prototype; not safe for concurrent multi-process writers.
let state = load();

module.exports = {
  getAdmin() {
    return state.admin;
  },
  setAdminPassword(newPasswordHash) {
    state.admin.passwordHash = newPasswordHash;
    save(state);
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
    save(state);
    return card;
  },
  updateCard(id, patch) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return null;
    Object.assign(card, patch);
    save(state);
    return card;
  },
  deleteCard(id) {
    state.cards = state.cards.filter((c) => c.id !== id);
    save(state);
  },
  slugTaken(slug, excludeId) {
    return state.cards.some((c) => c.slug === slug && c.id !== excludeId);
  },
  recordView(id) {
    const card = state.cards.find((c) => c.id === id);
    if (!card) return;
    card.viewCount = (card.viewCount || 0) + 1;
    card.lastViewedAt = Date.now();
    save(state);
  },
  exportCards() {
    return state.cards;
  },
  /** Replaces all cards wholesale (used by the backup-restore flow). Admin credentials are left untouched. */
  importCards(cards) {
    if (!Array.isArray(cards)) throw new Error('Ожидался массив карточек');
    state.cards = cards;
    save(state);
  }
};
