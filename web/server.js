const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Sentry must be initialized before anything else is required so it can
// instrument them; it's a no-op with no network calls when SENTRY_DSN is unset.
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', tracesSampleRate: 0.1 });
}

const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { authenticator } = require('otplib');

const { parse: parseCsv } = require('csv-parse/sync');

const db = require('./src/db');
const { generateSlug, buildVCard, resolveTagPayload } = require('./src/cardPayload');
const { LANGUAGES, translate, resolveLang } = require('./src/i18n');
const { detectSocial } = require('./src/socialIcons');
const { DESIGN_OPTIONS, RU_DESIGN_LABELS, computeOrderPricing } = require('./src/pricing');

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — logins will be forced out on every restart. Set it in production.');
}
const AUTH_COOKIE = 'admin_session';
const AUTH_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12h
const PENDING_2FA_COOKIE = 'admin_2fa_pending';
const PENDING_2FA_MAX_AGE = 5 * 60 * 1000; // 5 minutes to enter the code
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const BACKUP_TOKEN = process.env.BACKUP_TOKEN;
const CUSTOMER_AUTH_COOKIE = 'customer_session';
const CUSTOMER_AUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

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
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']
      }
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(SESSION_SECRET));

// Two layers of brute-force defense on top of the per-account lockout below:
// a hard per-IP cap, and a progressive delay that slows down automated
// guessing long before that cap is hit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много попыток входа с этого адреса, попробуйте позже'
});

const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 2,
  delayMs: (hits) => hits * 300,
  maxDelayMs: 5000
});

const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Local disk survives just fine in dev, but on Render's free tier it's wiped
// on every redeploy — so once Cloudinary credentials are configured, uploaded
// photos/images go there instead and get a durable, CDN-backed URL.
const CLOUDINARY_CONFIGURED = !!(
  process.env.CLOUDINARY_URL ||
  (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);
let cloudinary = null;
if (CLOUDINARY_CONFIGURED) {
  cloudinary = require('cloudinary').v2;
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }
}

const upload = multer({
  storage: CLOUDINARY_CONFIGURED
    ? multer.memoryStorage()
    : multer.diskStorage({
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

/** Resolves an uploaded image field to a durable URL: local /uploads/... path, or a Cloudinary URL when configured. */
function resolveUploadedUrl(file) {
  if (!file) return Promise.resolve(null);
  if (!CLOUDINARY_CONFIGURED) return Promise.resolve(`/uploads/${file.filename}`);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'nfc-card-uploads', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(file.buffer);
  });
}

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

function currentCustomerId(req) {
  return (req.signedCookies && req.signedCookies[CUSTOMER_AUTH_COOKIE]) || null;
}

function requireCustomerAuth(req, res, next) {
  const id = currentCustomerId(req);
  if (!id || !db.getCustomerById(id)) return res.redirect('/customer/login');
  req.customerId = id;
  next();
}

/** A human-typeable one-time recovery code, e.g. "K7H4-9XPT-3RQW-Y2LM". */
function generateRecoveryCode() {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/1/O/I — avoids ambiguity
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += alphabet[crypto.randomInt(alphabet.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/**
 * A URL typed without "https://" (e.g. "greenwich.am") isn't an absolute
 * link — a redirect to it resolves as *relative* to the current page,
 * which silently breaks the whole card ("Card not found"). Adding the
 * scheme when it's missing is what a normal user expects to happen.
 */
function normalizeExternalUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Shared by create and edit: pulls all type-specific content fields out of a
 * form submission. `files` is req.files from the multi-field upload
 * middleware (image for "image"-type cards, photo for a profile's picture);
 * `existing` carries over the previous card's file URLs when no new file
 * was submitted this time.
 */
async function cardFieldsFromBody(body, files, existing = {}) {
  const imageFile = files && files.image && files.image[0];
  const photoFile = files && files.photo && files.photo[0];
  const [uploadedImageUrl, uploadedPhotoUrl] = await Promise.all([
    resolveUploadedUrl(imageFile),
    resolveUploadedUrl(photoFile)
  ]);
  return {
    type: body.type,
    label: (body.label || body.fullName || body.targetUrl || body.wifiSsid || 'Карточка').trim(),
    // profile
    fullName: body.fullName || '',
    photoUrl: uploadedPhotoUrl || existing.photoUrl || '',
    phone: body.phone || '',
    email: body.email || '',
    company: body.company || '',
    jobTitle: body.jobTitle || '',
    links: (body.links || '').split('\n').map((l) => l.trim()).filter(Boolean).map(normalizeExternalUrl),
    // url / image
    targetUrl: normalizeExternalUrl(body.targetUrl),
    imageUrl: uploadedImageUrl || normalizeExternalUrl(body.imageUrl) || existing.imageUrl || '',
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

app.post('/login', loginLimiter, loginSlowDown, (req, res) => {
  const remainingLockMs = db.getLockoutRemainingMs();
  if (remainingLockMs > 0) {
    const minutes = Math.ceil(remainingLockMs / 60000);
    return res.render('login', {
      error: `Слишком много неверных попыток. Аккаунт временно заблокирован — попробуйте через ${minutes} мин, или воспользуйтесь восстановлением доступа.`
    });
  }

  const { username, password } = req.body;
  const admin = db.getAdmin();
  const ok = username === admin.username && bcrypt.compareSync(password || '', admin.passwordHash);
  if (!ok) {
    db.recordFailedLogin(MAX_LOGIN_ATTEMPTS, LOCKOUT_MS);
    return res.render('login', { error: 'Неверный логин или пароль' });
  }

  if (admin.totpEnabled) {
    // Password alone isn't enough — hold off on the real session cookie until
    // the second factor is verified too.
    res.cookie(PENDING_2FA_COOKIE, 'admin', {
      signed: true,
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: PENDING_2FA_MAX_AGE
    });
    return res.redirect('/login/2fa');
  }

  db.recordSuccessfulLogin();
  setAuthCookie(res);
  res.redirect('/admin');
});

app.get('/login/2fa', (req, res) => {
  if (!req.signedCookies || req.signedCookies[PENDING_2FA_COOKIE] !== 'admin') {
    return res.redirect('/login');
  }
  res.render('login-2fa', { error: null });
});

app.post('/login/2fa', loginLimiter, loginSlowDown, (req, res) => {
  if (!req.signedCookies || req.signedCookies[PENDING_2FA_COOKIE] !== 'admin') {
    return res.redirect('/login');
  }
  const remainingLockMs = db.getLockoutRemainingMs();
  if (remainingLockMs > 0) {
    const minutes = Math.ceil(remainingLockMs / 60000);
    return res.render('login-2fa', {
      error: `Слишком много неверных попыток. Аккаунт временно заблокирован — попробуйте через ${minutes} мин.`
    });
  }

  const admin = db.getAdmin();
  const code = (req.body.code || '').replace(/\s+/g, '');
  const valid = admin.totpSecret && authenticator.check(code, admin.totpSecret);
  if (!valid) {
    db.recordFailedLogin(MAX_LOGIN_ATTEMPTS, LOCKOUT_MS);
    return res.render('login-2fa', { error: 'Неверный код' });
  }

  db.recordSuccessfulLogin();
  res.clearCookie(PENDING_2FA_COOKIE);
  setAuthCookie(res);
  res.redirect('/admin');
});

function setAuthCookie(res) {
  res.cookie(AUTH_COOKIE, 'admin', {
    signed: true,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE
  });
}

app.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.redirect('/login');
});

// ---------- Digilama: public storefront (landing, order form, customer accounts) ----------

app.get('/', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  if (currentCustomerId(req)) return res.redirect('/my');
  res.render('landing', { tiers: computeVolumeTiersForDisplay(), designOptions: DESIGN_OPTIONS });
});

function computeVolumeTiersForDisplay() {
  return [
    { qty: '1–2', ...computeOrderPricing(1, 'classic') },
    { qty: '3–9', ...computeOrderPricing(3, 'classic') },
    { qty: '10+', ...computeOrderPricing(10, 'classic') }
  ];
}

app.get('/order/price', (req, res) => {
  const pricing = computeOrderPricing(req.query.quantity, req.query.design);
  res.json(pricing);
});

app.get('/order', (req, res) => {
  res.render('order', { error: null, values: {}, designOptions: DESIGN_OPTIONS });
});

app.post('/order', loginLimiter, upload.single('designImage'), async (req, res) => {
  const body = req.body;
  const render = (error) => res.render('order', { error, values: body, designOptions: DESIGN_OPTIONS });

  const kind = body.kind === 'organization' ? 'organization' : 'person';
  const email = (body.email || '').trim().toLowerCase();
  const contactName = (body.contactName || '').trim();
  const password = body.password || '';
  const pricing = computeOrderPricing(body.quantity, body.design);

  if (!contactName) return render('Please enter a contact name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return render('Please enter a valid email address');
  if (password.length < 6) return render('Password must be at least 6 characters');
  if (password !== body.confirmPassword) return render('Passwords do not match');
  if (pricing.design !== 'classic' && !req.file) {
    return render('Please upload an image/logo for this design option');
  }

  const existing = db.getCustomerByEmail(email);
  if (existing) {
    return render('An account with this email already exists — log in to your account to place a new order');
  }

  let designImageUrl = '';
  try {
    designImageUrl = (await resolveUploadedUrl(req.file)) || '';
  } catch (e) {
    console.error('Upload failed:', e.message);
    return render('Could not upload the image, please try again');
  }

  const customer = {
    id: crypto.randomUUID(),
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    contactName,
    phone: (body.phone || '').trim(),
    company: (body.company || '').trim(),
    createdAt: Date.now()
  };
  db.addCustomer(customer);

  const order = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    kind,
    quantity: pricing.quantity,
    design: pricing.design,
    pricePerCard: pricing.pricePerCard,
    totalPriceEur: pricing.total,
    designImageUrl,
    cardDetailsNote: (body.cardDetailsNote || '').trim(),
    shippingAddress: (body.shippingAddress || '').trim(),
    status: 'new',
    cardIds: [],
    createdAt: Date.now()
  };
  db.addOrder(order);

  res.cookie(CUSTOMER_AUTH_COOKIE, customer.id, {
    signed: true,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: CUSTOMER_AUTH_COOKIE_MAX_AGE
  });
  res.redirect(`/order/${order.id}/confirmation`);
});

app.get('/order/:id/confirmation', requireCustomerAuth, (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order || order.customerId !== req.customerId) return res.status(404).send('Order not found');
  res.render('order-confirmation', { order, designOptions: DESIGN_OPTIONS });
});

// ---------- Digilama: customer account (self-service editing of their own cards) ----------

app.get('/customer/login', (req, res) => {
  if (currentCustomerId(req)) return res.redirect('/my');
  res.render('customer-login', { error: null });
});

app.post('/customer/login', loginLimiter, loginSlowDown, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const customer = db.getCustomerByEmail(email);
  const ok = customer && bcrypt.compareSync(req.body.password || '', customer.passwordHash);
  if (!ok) return res.render('customer-login', { error: 'Incorrect email or password' });

  res.cookie(CUSTOMER_AUTH_COOKIE, customer.id, {
    signed: true,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: CUSTOMER_AUTH_COOKIE_MAX_AGE
  });
  res.redirect('/my');
});

app.post('/customer/logout', (req, res) => {
  res.clearCookie(CUSTOMER_AUTH_COOKIE);
  res.redirect('/customer/login');
});

app.get('/my', requireCustomerAuth, (req, res) => {
  const orders = db.listOrdersByCustomer(req.customerId);
  const cards = db.listCardsByCustomer(req.customerId);
  res.render('customer-dashboard', { orders, cards, designOptions: DESIGN_OPTIONS, base: baseUrl(req) });
});

app.get('/my/cards/:id/edit', requireCustomerAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card || card.customerId !== req.customerId) return res.status(404).send('Card not found');
  res.render('customer-edit-card', { card, error: null });
});

app.post('/my/cards/:id/edit', requireCustomerAuth, upload.single('photo'), async (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card || card.customerId !== req.customerId) return res.status(404).send('Card not found');

  let photoUrl = card.photoUrl;
  try {
    photoUrl = (await resolveUploadedUrl(req.file)) || card.photoUrl;
  } catch (e) {
    console.error('Upload failed:', e.message);
    return res.render('customer-edit-card', { card, error: 'Could not upload the photo, please try again' });
  }

  const body = req.body;
  db.updateCard(card.id, {
    fullName: body.fullName || '',
    phone: body.phone || '',
    email: body.email || '',
    company: body.company || '',
    jobTitle: body.jobTitle || '',
    links: (body.links || '').split('\n').map((l) => l.trim()).filter(Boolean).map(normalizeExternalUrl),
    photoUrl,
    updatedAt: Date.now()
  });
  res.redirect('/my');
});

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

// ---------- Admin: Digilama orders ----------

app.get('/admin/orders', requireAuth, (req, res) => {
  const orders = db.listOrders().map((o) => ({ ...o, customer: db.getCustomerById(o.customerId) }));
  res.render('admin-orders', { orders });
});

app.get('/admin/orders/:id', requireAuth, (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).send('Заказ не найден');
  const customer = db.getCustomerById(order.customerId);
  const cards = order.cardIds.map((id) => db.getCardById(id)).filter(Boolean);
  res.render('admin-order-detail', { order, customer, cards, designOptions: RU_DESIGN_LABELS });
});

app.post('/admin/orders/:id/status', requireAuth, (req, res) => {
  const order = db.getOrderById(req.params.id);
  if (!order) return res.status(404).send('Заказ не найден');
  const allowed = ['new', 'contacted', 'paid', 'fulfilled', 'cancelled'];
  if (allowed.includes(req.body.status)) {
    db.updateOrder(order.id, { status: req.body.status });
  }
  res.redirect(`/admin/orders/${order.id}`);
});

app.get('/admin/cards/new', requireAuth, (req, res) => {
  const orderId = (req.query.orderId || '').toString();
  const order = orderId ? db.getOrderById(orderId) : null;
  const values = order
    ? {
        type: 'profile',
        fullName: order.kind === 'organization' ? '' : order.customerId && db.getCustomerById(order.customerId)?.contactName,
        company: order.customerId ? db.getCustomerById(order.customerId)?.company : '',
        email: order.customerId ? db.getCustomerById(order.customerId)?.email : '',
        phone: order.customerId ? db.getCustomerById(order.customerId)?.phone : ''
      }
    : {};
  res.render('new-card', { error: null, values, base: baseUrl(req), orderId: order ? order.id : '' });
});

const uploadCardFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

app.post('/admin/cards/new', requireAuth, uploadCardFiles, async (req, res) => {
  const body = req.body;
  const orderId = (body.orderId || '').toString();

  if (!body.type) {
    return res.render('new-card', { error: 'Выберите тип карточки', values: body, base: baseUrl(req), orderId });
  }

  let slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) slug = generateSlug();
  if (db.slugTaken(slug)) {
    return res.render('new-card', { error: 'Такой короткий адрес уже занят, выберите другой', values: body, base: baseUrl(req), orderId });
  }

  let fields;
  try {
    fields = await cardFieldsFromBody(body, req.files);
  } catch (e) {
    console.error('Upload failed:', e.message);
    return res.render('new-card', { error: 'Не удалось загрузить изображение, попробуйте ещё раз', values: body, base: baseUrl(req), orderId });
  }

  const order = orderId ? db.getOrderById(orderId) : null;

  const card = {
    id: crypto.randomUUID(),
    slug,
    createdAt: Date.now(),
    viewCount: 0,
    lastViewedAt: null,
    active: true,
    customerId: order ? order.customerId : null,
    ...fields
  };

  db.addCard(card);

  if (order) {
    db.updateOrder(order.id, { cardIds: [...order.cardIds, card.id], status: 'fulfilled' });
  }

  res.redirect(`/admin/cards/${card.id}`);
});

app.get('/admin/cards/:id/edit', requireAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');
  res.render('edit-card', { card, error: null });
});

app.post('/admin/cards/:id/edit', requireAuth, uploadCardFiles, async (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card) return res.status(404).send('Карточка не найдена');

  if (!req.body.type) {
    return res.render('edit-card', { card, error: 'Выберите тип карточки' });
  }

  let updated;
  try {
    updated = await cardFieldsFromBody(req.body, req.files, { imageUrl: card.imageUrl, photoUrl: card.photoUrl });
  } catch (e) {
    console.error('Upload failed:', e.message);
    return res.render('edit-card', { card, error: 'Не удалось загрузить изображение, попробуйте ещё раз' });
  }
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
      photoUrl: '',
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
  res.redirect('/admin/trash');
});

// ---------- Trash: a delete moves a card here for 30 days before it's gone
// for good, so an accidental click doesn't destroy data outright. ----------

app.get('/admin/trash', requireAuth, (req, res) => {
  res.render('trash', { cards: db.listTrash(), base: baseUrl(req) });
});

app.post('/admin/cards/:id/restore', requireAuth, (req, res) => {
  db.restoreCard(req.params.id);
  res.redirect('/admin/trash');
});

app.post('/admin/cards/:id/delete-forever', requireAuth, (req, res) => {
  db.permanentlyDeleteCard(req.params.id);
  res.redirect('/admin/trash');
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

// Headless export for the scheduled off-site backup (GitHub Action), so a
// single lost/corrupted Redis instance isn't the only copy of the data.
// Auth is a shared secret (BACKUP_TOKEN) instead of the admin cookie, since
// this is called by a CI job with no browser session.
app.get('/internal/backup', (req, res) => {
  if (!BACKUP_TOKEN) return res.status(503).send('BACKUP_TOKEN not configured');
  const provided = Buffer.from((req.query.token || '').toString());
  const expected = Buffer.from(BACKUP_TOKEN);
  const ok = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  if (!ok) return res.status(401).send('Unauthorized');
  res.json({ exportedAt: new Date().toISOString(), cards: db.exportCards() });
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
  const admin = db.getAdmin();
  res.render('change-password', {
    error: null,
    success: null,
    newRecoveryCode: null,
    hasRecoveryCode: !!admin.recoveryCodeHash,
    totpEnabled: !!admin.totpEnabled
  });
});

app.post('/admin/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const admin = db.getAdmin();
  const render = (error, success) =>
    res.render('change-password', {
      error,
      success,
      newRecoveryCode: null,
      hasRecoveryCode: !!admin.recoveryCodeHash,
      totpEnabled: !!admin.totpEnabled
    });

  if (!bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
    return render('Текущий пароль неверен', null);
  }
  if (!newPassword || newPassword.length < 6) {
    return render('Новый пароль должен быть не короче 6 символов', null);
  }
  if (newPassword !== confirmPassword) {
    return render('Пароли не совпадают', null);
  }
  db.setAdminPassword(bcrypt.hashSync(newPassword, 10));
  render(null, 'Пароль обновлён');
});

app.post('/admin/generate-recovery-code', requireAuth, (req, res) => {
  const rawCode = generateRecoveryCode();
  db.setRecoveryCodeHash(bcrypt.hashSync(rawCode, 10));
  res.render('change-password', {
    error: null,
    success: null,
    newRecoveryCode: rawCode,
    hasRecoveryCode: true,
    totpEnabled: !!db.getAdmin().totpEnabled
  });
});

// ---------- Two-factor authentication (TOTP, e.g. Google/Microsoft Authenticator) ----------

app.get('/admin/2fa/setup', requireAuth, async (req, res) => {
  const admin = db.getAdmin();
  if (admin.totpEnabled) return res.redirect('/admin/change-password');

  const secret = authenticator.generateSecret();
  db.setPendingTotpSecret(secret);
  const otpauthUrl = authenticator.keyuri(admin.username, 'NFC Card Admin', secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  res.render('2fa-setup', { secret, qrDataUrl, error: null });
});

app.post('/admin/2fa/setup', requireAuth, (req, res) => {
  const admin = db.getAdmin();
  const code = (req.body.code || '').replace(/\s+/g, '');
  if (!admin.totpSecret || !authenticator.check(code, admin.totpSecret)) {
    return res.render('2fa-setup', {
      secret: admin.totpSecret,
      qrDataUrl: null,
      error: 'Неверный код, попробуйте ещё раз'
    });
  }
  db.enableTotp();
  res.redirect('/admin/change-password');
});

app.post('/admin/2fa/disable', requireAuth, (req, res) => {
  const admin = db.getAdmin();
  if (!bcrypt.compareSync(req.body.password || '', admin.passwordHash)) {
    return res.render('change-password', {
      error: 'Неверный пароль — двухфакторная аутентификация не отключена',
      success: null,
      newRecoveryCode: null,
      hasRecoveryCode: !!admin.recoveryCodeHash,
      totpEnabled: !!admin.totpEnabled
    });
  }
  db.disableTotp();
  res.render('change-password', {
    error: null,
    success: 'Двухфакторная аутентификация отключена',
    newRecoveryCode: null,
    hasRecoveryCode: !!admin.recoveryCodeHash,
    totpEnabled: false
  });
});

app.get('/privacy', (req, res) => {
  res.render('privacy');
});

// ---------- Forgot password: reset via the one-time recovery code ----------

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { error: null, success: null });
});

app.post('/forgot-password', loginLimiter, loginSlowDown, (req, res) => {
  const { recoveryCode, newPassword, confirmPassword } = req.body;
  const admin = db.getAdmin();

  if (!admin.recoveryCodeHash) {
    return res.render('forgot-password', {
      error: 'Код восстановления ещё не был создан заранее — восстановить доступ через него нельзя.',
      success: null
    });
  }
  if (!bcrypt.compareSync((recoveryCode || '').trim(), admin.recoveryCodeHash)) {
    return res.render('forgot-password', { error: 'Неверный код восстановления', success: null });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.render('forgot-password', { error: 'Новый пароль должен быть не короче 6 символов', success: null });
  }
  if (newPassword !== confirmPassword) {
    return res.render('forgot-password', { error: 'Пароли не совпадают', success: null });
  }

  db.setAdminPassword(bcrypt.hashSync(newPassword, 10));
  db.setRecoveryCodeHash(null); // one-time use — a new one must be generated after logging in
  db.recordSuccessfulLogin(); // also clears any active lockout
  res.render('forgot-password', {
    error: null,
    success: 'Пароль сброшен. Войдите с новым паролем и сразу создайте новый код восстановления в разделе «Пароль».'
  });
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
      const linksWithIcons = (card.links || []).map((url) => ({ url, ...detectSocial(url) }));
      const ogImage = `${baseUrl(req)}/og-image.png`;
      const ogTitle = card.type === 'profile' ? (card.fullName || card.label) : card.label;
      const ogDescription =
        card.type === 'profile'
          ? [card.jobTitle, card.company].filter(Boolean).join(' · ') || 'Digital business card'
          : card.type === 'wifi'
            ? 'Wi‑Fi network'
            : 'Digital business card';
      return res.render('public-profile', {
        card,
        qrDataUrl,
        t,
        lang,
        languages: LANGUAGES,
        linksWithIcons,
        ogImage,
        ogTitle,
        ogDescription,
        base: baseUrl(req)
      });
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

if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

// Final safety net: anything an individual route handler didn't catch lands
// here instead of Express's default HTML stack-trace page.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).send('Внутренняя ошибка сервера');
});

db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`NFC card admin running on http://localhost:${PORT}`);
    console.log('Default login: admin / admin123 (change it under "Сменить пароль" after first login)');
    console.log(process.env.REDIS_URL ? 'Persistence: Redis (durable)' : 'Persistence: local file only (not durable across redeploys)');
  });
});
