const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { parse: parseCsv } = require('csv-parse/sync');

const db = require('./src/db');
const { generateSlug, buildVCard, resolveTagPayload } = require('./src/cardPayload');

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — sessions will not survive a restart. Set it in production.');
}

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
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:']
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 12 * 60 * 60 * 1000, // 12h
      secure: IS_PRODUCTION,
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

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

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
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
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const admin = db.getAdmin();
  const ok = username === admin.username && bcrypt.compareSync(password || '', admin.passwordHash);
  if (!ok) return res.render('login', { error: 'Неверный логин или пароль' });
  req.session.isAdmin = true;
  res.redirect('/admin');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', (req, res) => res.redirect(req.session.isAdmin ? '/admin' : '/login'));

// ---------- Admin: dashboard ----------

app.get('/admin', requireAuth, (req, res) => {
  const cards = db.listCards();
  const stats = cards.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});
  res.render('dashboard', { cards, stats, base: baseUrl(req) });
});

app.get('/admin/cards/new', requireAuth, (req, res) => {
  res.render('new-card', { error: null, values: {} });
});

app.post('/admin/cards/new', requireAuth, upload.single('image'), (req, res) => {
  const body = req.body;

  if (!body.type) {
    return res.render('new-card', { error: 'Выберите тип карточки', values: body });
  }

  let slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) slug = generateSlug();
  if (db.slugTaken(slug)) {
    return res.render('new-card', { error: 'Такой короткий адрес уже занят, выберите другой', values: body });
  }

  const card = {
    id: crypto.randomUUID(),
    slug,
    createdAt: Date.now(),
    viewCount: 0,
    lastViewedAt: null,
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

  const { id, slug, createdAt, viewCount, lastViewedAt, updatedAt, ...content } = source;
  const copy = {
    id: crypto.randomUUID(),
    slug: generateSlug(),
    createdAt: Date.now(),
    viewCount: 0,
    lastViewedAt: null,
    ...content,
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

app.get('/u/:slug', (req, res) => {
  const card = db.getCardBySlug(req.params.slug);
  if (!card) return res.status(404).render('not-found');

  db.recordView(card.id);

  switch (card.type) {
    case 'url':
      if (card.targetUrl) return res.redirect(card.targetUrl);
      return res.status(404).render('not-found');
    case 'image':
      if (card.imageUrl) return res.redirect(card.imageUrl);
      return res.status(404).render('not-found');
    case 'profile':
    case 'wifi':
    case 'custom':
    default:
      return res.render('public-profile', { card });
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

app.listen(PORT, () => {
  console.log(`NFC card admin running on http://localhost:${PORT}`);
  console.log('Default login: admin / admin123 (change it under "Сменить пароль" after first login)');
});
