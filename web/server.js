const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { parse: parseCsv } = require('csv-parse/sync');

const db = require('./src/db');
const { generateSlug, buildVCard, resolveTagPayload } = require('./src/cardPayload');
const { LANGUAGES, translate, resolveLang } = require('./src/i18n');

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — logins will be forced out on every restart. Set it in production.');
}
const AUTH_COOKIE = 'admin_session';
const AUTH_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12h

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Needed so req.protocol/req.secure are correct behind a hosting provider's
// reverse proxy (Render/Railway/Fly all terminate TLS in front of the app).
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:']
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(SESSION_SECRET));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много попыток входа, попробуйте позже'
});

const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  }
});

// Small text-file uploads (JSON backups, CSV bulk-import) never need to touch disk.
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function isAuthed(req) {
  return req.signedCookies && req.signedCookies[AUTH_COOKIE] === 'admin';
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.redirect('/login');
}

/** Shared by create and edit: pulls all type-specific content fields out of a form submission. */
function cardFieldsFromBody(body, file, existingImageUrl) {
  return {
    type: body.type,
    label: (body.label || body.fullName || body.targetUrl || body.wifiSsid || 'Карточка').trim(),
    // profile
    fullName: body.fullName || '',
    phone: body.phone || '',
    email: body.email || '',
    company: body.company || '',
    jobTitle: body.jobTitle || '',
    links: (body.links || '').split('\n').map((l) => l.trim()).filter(Boolean),
    // url / image
    targetUrl: body.targetUrl || '',
    imageUrl: file ? `/uploads/${file.filename}` : body.imageUrl || existingImageUrl || '',
    // wifi
    wifiSsid: body.wifiSsid || '',
    wifiPassword: body.wifiPassword || '',
    wifiEncryption: body.wifiEncryption || 'WPA',
    // custom
    customPayload: body.customPayload || ''
  };
}

// Pinged by a scheduled GitHub Action to stop the free Render instance from
// spinning down after 15 minutes of inactivity. No auth, no session touched.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// ---------- Auth ----------

app.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.getAdmin();
  const ok = username === admin.username && bcrypt.compareSync(password || '', admin.passwordHash);
  if (!ok) return res.render('login', { error: 'Неверный логин или пароль' });
  res.cookie(AUTH_COOKIE, 'admin', {
    signed: true,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE
  });
  res.redirect('/admin');
});

app.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.redirect('/login');
});

app.get('/', (req, res) => res.redirect(isAuthed(req) ? '/admin' : '/login'));

// ---------- Admin: dashboard ----------

app.get('/admin', requireAuth, (req, res) => {
  const cards = db.listCards();
  const stats = cards.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});
  const usingDefaultPassword = bcrypt.compareSync('admin123', db.getAdmin().passwordHash);
  res.render('dashboard', { cards, stats, base: baseUrl(req), usingDefaultPassword });
});

app.get('/admin/cards/new', requireAuth, (req, res) => {
  res.render('new-card', { error: null, values: {}, base: baseUrl(req) });
});

app.post('/admin/cards/new', requireAuth, upload.single('image'), (req, res) => {
  const body = req.body;

  if (!body.type) {
    return res.render('new-card', { error: 'Выберите тип карточки', values: body, base: baseUrl(req) });
  }

  let slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) slug = generateSlug();
  if (db.slugTaken(slug)) {
    return res.render('new-card', { error: 'Такой короткий адрес уже занят, выберите другой', values: body, base: baseUrl(req) });
  }

  const card = {
    id: crypto.randomUUID(),
    slug,
    createdAt: Date.now(),
    viewCount: 0,
    lastViewedAt: null,
    active: true,
    ...cardFieldsFromBody(body, req.file)
  };

  db.addCard(card);
  res.redirect(`/admin/cards/${card.id}`);
});

app.get('/admin/cards/:id/edit', requireAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');
  res.render('edit-card', { card, error: null });
});

app.post('/admin/cards/:id/edit', requireAuth, upload.single('image'), (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');

  if (!req.body.type) {
    return res.render('edit-card', { card, error: 'Выберите тип карточки' });
  }

  const updated = cardFieldsFromBody(req.body, req.file, card.imageUrl);
  db.updateCard(card.id, { ...updated, updatedAt: Date.now() });
  res.redirect(`/admin/cards/${card.id}`);
});

app.post('/admin/cards/:id/duplicate', requireAuth, (req, res) => {
  const source = db.getCardById(req.params.id);
  if (!source) return res.status(404).send('Карточка не найдена');

  const { id, slug, createdAt, viewCount, lastViewedAt, updatedAt, active, ...content } = source;
  const copy = {
    id: crypto.randomUUID(),
    slug: generateSlug(),
    createdAt: Date.now(),
    viewCount: 0,
    lastViewedAt: null,
    ...content,
    active: true, // a duplicate is a fresh start even if the source was paused
    label: `${content.label} (копия)`
  };
  db.addCard(copy);
  res.redirect(`/admin/cards/${copy.id}`);
});

app.get('/admin/cards/bulk', requireAuth, (req, res) => {
  res.render('bulk-new', { error: null, created: null });
});

app.post('/admin/cards/bulk', requireAuth, memoryUpload.single('csvFile'), (req, res) => {
  const csvText = req.file ? req.file.buffer.toString('utf-8') : req.body.csvText || '';
  if (!csvText.trim()) {
    return res.render('bulk-new', { error: 'Вставьте CSV-текст или загрузите файл', created: null });
  }

  let rows;
  try {
    rows = parseCsv(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.render('bulk-new', { error: `Не удалось разобрать CSV: ${e.message}`, created: null });
  }

  if (rows.length === 0) {
    return res.render('bulk-new', { error: 'В файле не найдено ни одной строки с данными', created: null });
  }

  const created = [];
  for (const row of rows) {
    const fullName = (row.fullName || row.name || row['Имя'] || '').trim();
    if (!fullName) continue; // skip rows without at least a name
    let slug = generateSlug();
    while (db.slugTaken(slug)) slug = generateSlug();
    const card = {
      id: crypto.randomUUID(),
      slug,
      type: 'profile',
      label: fullName,
      createdAt: Date.now(),
      viewCount: 0,
      lastViewedAt: null,
      active: true,
      fullName,
      phone: row.phone || row['Телефон'] || '',
      email: row.email || row['Email'] || '',
      company: row.company || row['Компания'] || '',
      jobTitle: row.jobTitle || row['Должность'] || '',
      links: (row.links || '').split(/[,;]/).map((l) => l.trim()).filter(Boolean),
      targetUrl: '',
      imageUrl: '',
      wifiSsid: '',
      wifiPassword: '',
      wifiEncryption: 'WPA',
      customPayload: ''
    };
    db.addCard(card);
    created.push(card);
  }

  res.render('bulk-new', {
    error: created.length === 0 ? 'Ни одна строка не содержала колонку fullName/name' : null,
    created: created.map((c) => ({ label: c.label, url: `${baseUrl(req)}/u/${c.slug}` }))
  });
});

app.get('/admin/cards/:id', requireAuth, async (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');
  const payload = resolveTagPayload(card, baseUrl(req));
  const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 260 });
  res.render('card-detail', { card, payload, qrDataUrl, base: baseUrl(req) });
});

app.get('/admin/cards/:id/qr.png', requireAuth, async (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');
  const payload = resolveTagPayload(card, baseUrl(req));
  const buffer = await QRCode.toBuffer(payload, { margin: 1, width: 1024, type: 'png' });
  res.set('Content-Type', 'image/png');
  res.set('Content-Disposition', `attachment; filename="qr-${card.slug}.png"`);
  res.send(buffer);
});

app.post('/admin/cards/:id/toggle-active', requireAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');
  const isCurrentlyActive = card.active !== false;
  db.updateCard(card.id, { active: !isCurrentlyActive });
  const referer = req.get('Referer') || '';
  res.redirect(referer.includes('/admin/cards/') ? `/admin/cards/${card.id}` : '/admin');
});

app.post('/admin/cards/:id/delete', requireAuth, (req, res) => {
  db.deleteCard(req.params.id);
  res.redirect('/admin');
});

// ---------- Backup / restore (free hosting tiers don't always guarantee the
// local disk survives a redeploy, so admins should export before deploying
// new code and can restore if a redeploy ever resets the disk). ----------

app.get('/admin/export', requireAuth, (req, res) => {
  const data = { exportedAt: new Date().toISOString(), cards: db.exportCards() };
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="nfc-cards-backup-${Date.now()}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

app.get('/admin/export.csv', requireAuth, (req, res) => {
  const columns = ['label', 'type', 'slug', 'fullName', 'phone', 'email', 'company', 'jobTitle', 'viewCount', 'active'];
  const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.join(',')];
  for (const c of db.listCards()) {
    lines.push(columns.map((col) => escapeCsv(col === 'active' ? (c.active !== false) : c[col])).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="nfc-cards-${Date.now()}.csv"`);
  res.send(lines.join('\r\n'));
});

// ---------- Printable label sheet: a grid of QR + name per selected card,
// meant to be printed (or saved as PDF) and cut out next to the physical
// NFC tags while they're being written. ----------

app.get('/admin/print', requireAuth, async (req, res) => {
  const idsParam = (req.query.ids || '').toString();
  const ids = idsParam ? idsParam.split(',').filter(Boolean) : db.listCards().map((c) => c.id);
  const cards = ids.map((id) => db.getCardById(id)).filter(Boolean);

  const items = await Promise.all(
    cards.map(async (card) => {
      const payload = resolveTagPayload(card, baseUrl(req));
      const qrDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 300 });
      return { label: card.label, slug: card.slug, qrDataUrl };
    })
  );

  res.render('print', { items });
});

app.get('/admin/import', requireAuth, (req, res) => {
  res.render('import', { error: null, success: null });
});

app.post('/admin/import', requireAuth, memoryUpload.single('backupFile'), (req, res) => {
  if (!req.file) return res.render('import', { error: 'Выберите файл резервной копии', success: null });
  try {
    const parsed = JSON.parse(req.file.buffer.toString('utf-8'));
    const cards = Array.isArray(parsed) ? parsed : parsed.cards;
    db.importCards(cards);
    res.render('import', { error: null, success: `Восстановлено карточек: ${cards.length}` });
  } catch (e) {
    res.render('import', { error: `Не удалось прочитать файл: ${e.message}`, success: null });
  }
});

app.get('/admin/change-password', requireAuth, (req, res) => {
  res.render('change-password', { error: null, success: null });
});

app.post('/admin/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const admin = db.getAdmin();
  if (!bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
    return res.render('change-password', { error: 'Текущий пароль неверен', success: null });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.render('change-password', { error: 'Новый пароль должен быть не короче 6 символов', success: null });
  }
  if (newPassword !== confirmPassword) {
    return res.render('change-password', { error: 'Пароли не совпадают', success: null });
  }
  db.setAdminPassword(bcrypt.hashSync(newPassword, 10));
  res.render('change-password', { error: null, success: 'Пароль обновлён' });
});

// ---------- Public: what the physical NFC tag / QR points to ----------

app.get('/u/:slug', async (req, res) => {
  const lang = resolveLang(req, res);
  const t = (key) => translate(lang, key);

  const card = db.getCardBySlug(req.params.slug);
  if (!card) return res.status(404).render('not-found', { t, lang, languages: LANGUAGES });

  db.recordView(card.id);

  if (card.active === false) {
    return res.status(410).render('disabled', { t, lang, languages: LANGUAGES });
  }

  switch (card.type) {
    case 'url':
      if (card.targetUrl) return res.redirect(card.targetUrl);
      return res.status(404).render('not-found', { t, lang, languages: LANGUAGES });
    case 'image':
      if (card.imageUrl) return res.redirect(card.imageUrl);
      return res.status(404).render('not-found', { t, lang, languages: LANGUAGES });
    case 'profile':
    case 'wifi':
    case 'custom':
    default: {
      // Lets the card's own owner show this same QR from their phone screen
      // as a fallback when the person they're greeting can't read NFC.
      const selfUrl = `${baseUrl(req)}/u/${card.slug}`;
      const qrDataUrl = await QRCode.toDataURL(selfUrl, { margin: 1, width: 220 });
      return res.render('public-profile', { card, qrDataUrl, t, lang, languages: LANGUAGES });
    }
  }
});

app.get('/u/:slug/vcard', (req, res) => {
  const card = db.getCardBySlug(req.params.slug);
  if (!card || card.type !== 'profile') return res.status(404).send('Not found');
  const vcard = buildVCard(card);
  res.set('Content-Type', 'text/vcard; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${(card.fullName || 'contact').replace(/[^a-z0-9]/gi, '_')}.vcf"`);
  res.send(vcard);
});

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`NFC card admin running on http://localhost:${PORT}`);
    console.log('Default login: admin / admin123 (change it under "Сменить пароль" after first login)');
    console.log(process.env.REDIS_URL ? 'Persistence: Redis (durable)' : 'Persistence: local file only (not durable across redeploys)');
  });
});
