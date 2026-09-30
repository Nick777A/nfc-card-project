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
const { KINDS, isValidKind, getKind } = require('./src/cardKinds');

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
// Bridges "registered/logged in for this card" to "actually made it theirs":
// a stock card is only ever linked to a customer once they hit Save on the
// edit form, so scanning + registering without finishing never assigns
// ownership. This cookie is the only thing that lets that first edit-page
// visit in before the card is really theirs.
const PENDING_CLAIM_COOKIE = 'pending_claim_card';
const PENDING_CLAIM_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours

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

/** Same as resolveUploadedUrl but for a whole multer file array (e.g. a gallery field). */
function resolveUploadedUrls(files) {
  if (!files || !files.length) return Promise.resolve(null);
  return Promise.all(files.map((f) => resolveUploadedUrl(f)));
}

const uploadCardFiles = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
  { name: 'banner', maxCount: 1 },
  { name: 'gallery', maxCount: 6 }
]);

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
/** Only ever hands back an http(s) URL (or empty) — rejects javascript:/data: and any other scheme outright. */
function normalizeExternalUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return ''; // some other explicit scheme — refuse rather than guess
  return `https://${trimmed}`;
}

/**
 * Parses the "links" textarea into { label, url } pairs. Each line is either
 * a bare URL, or "Description | url" so a customer can caption a link (e.g.
 * a "Links" tab entry) instead of just showing the raw address.
 */
function parseLinksInput(text) {
  return (text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const pipeIndex = line.indexOf('|');
      if (pipeIndex === -1) return { label: '', url: normalizeExternalUrl(line) };
      const label = line.slice(0, pipeIndex).trim();
      const url = normalizeExternalUrl(line.slice(pipeIndex + 1).trim());
      return { label, url };
    })
    .filter((l) => l.url);
}

/** The reverse of parseLinksInput, for pre-filling an edit form's textarea. */
function formatLinksForInput(links) {
  return (links || [])
    .map((l) => {
      if (typeof l === 'string') return l;
      return l.label ? `${l.label} | ${l.url}` : l.url;
    })
    .join('\n');
}

/** card.links may still be plain URL strings on cards saved before labels existed. */
function linkUrl(l) {
  return typeof l === 'string' ? l : l.url;
}
function linkLabel(l) {
  return typeof l === 'string' ? '' : l.label || '';
}

/** Groups a raw phone number into readable chunks for display (the tel: link keeps the untouched original). */
function formatPhoneDisplay(phone) {
  const trimmed = (phone || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  const groups = digits.match(/.{1,3}/g) || [];
  return (hasPlus ? '+' : '') + groups.join(' ');
}

/**
 * Shared by create and edit: pulls all type-specific content fields out of a
 * form submission. `files` is req.files from the multi-field upload
 * middleware (image for "image"-type cards, photo for a profile's picture);
 * `existing` carries over the previous card's file URLs when no new file
 * was submitted this time.
 */
function sanitizeHexColor(value, fallback) {
  const s = (value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

/** Builds the customer's chosen look for their public card, or null to keep the default Digilama style. */
function buildThemeFromBody(body) {
  const enabled = body.themeEnabled === 'on' || body.themeEnabled === '1' || body.themeEnabled === 'true';
  if (!enabled) return null;
  return {
    bgMode: body.bgMode === 'gradient' ? 'gradient' : 'solid',
    bgColor1: sanitizeHexColor(body.bgColor1, '#07070b'),
    bgColor2: sanitizeHexColor(body.bgColor2, '#1a1a2e'),
    bgAngle: Math.max(0, Math.min(360, parseInt(body.bgAngle, 10) || 135)),
    accentColor1: sanitizeHexColor(body.accentColor1, '#ff2e88'),
    accentColor2: sanitizeHexColor(body.accentColor2, '#00e6c3'),
    iconColor: sanitizeHexColor(body.iconColor, '#9a9aab'),
    iconSize: ['sm', 'md', 'lg'].includes(body.iconSize) ? body.iconSize : 'md'
  };
}

/** Turns a stored theme into inline style strings for the profile-page wrapper and card elements. */
function themeStyles(theme) {
  if (!theme) return { wrapStyle: '', cardStyle: '' };
  const bg = theme.bgMode === 'gradient'
    ? `linear-gradient(${theme.bgAngle}deg, ${theme.bgColor1}, ${theme.bgColor2})`
    : theme.bgColor1;
  const iconScale = theme.iconSize === 'sm' ? 0.85 : theme.iconSize === 'lg' ? 1.2 : 1;
  return {
    wrapStyle: `background:${bg};`,
    cardStyle: `--u-accent1:${theme.accentColor1};--u-accent2:${theme.accentColor2};--u-icon-color:${theme.iconColor};--u-icon-scale:${iconScale};`
  };
}

// ---------- Card-kind field parsing: menu, portfolio, booking availability ----------

/** "# Category\nName | description | price" text into [{ name, items: [{name, description, price}] }]. */
function parseMenuInput(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const categories = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('#')) {
      current = { name: line.replace(/^#+\s*/, ''), items: [] };
      categories.push(current);
      continue;
    }
    const [name, description, price] = line.split('|').map((s) => (s || '').trim());
    if (!name) continue;
    if (!current) {
      current = { name: 'Menu', items: [] };
      categories.push(current);
    }
    current.items.push({ name, description: description || '', price: price || '' });
  }
  return categories;
}

function formatMenuForInput(categories) {
  return (categories || [])
    .map((cat) => `# ${cat.name}\n${(cat.items || []).map((i) => [i.name, i.description, i.price].join(' | ')).join('\n')}`)
    .join('\n\n');
}

/** "Title | description | link" per line, paired by order with uploaded images. */
function parsePortfolioInput(text, imageUrls, existingItems) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const [title, description, link] = line.split('|').map((s) => (s || '').trim());
    const existingImage = existingItems && existingItems[i] ? existingItems[i].imageUrl : '';
    return {
      title: title || `Project ${i + 1}`,
      description: description || '',
      link: link ? normalizeExternalUrl(link) : '',
      imageUrl: (imageUrls && imageUrls[i]) || existingImage || ''
    };
  });
}

function formatPortfolioForInput(items) {
  return (items || []).map((i) => [i.title, i.description, i.link].join(' | ')).join('\n');
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Reads avail_<day>_on / _from / _to fields into { mon: [{start,end}], ... } (one range per day, kept simple on purpose). */
function parseAvailabilityFromBody(body) {
  const availability = {};
  WEEKDAYS.forEach((day) => {
    if (body[`avail_${day}_on`] === 'on') {
      const start = body[`avail_${day}_from`] || '09:00';
      const end = body[`avail_${day}_to`] || '18:00';
      if (start < end) availability[day] = [{ start, end }];
    }
  });
  return availability;
}

/** Every HH:MM slot of the given duration that fits inside the day's open ranges. */
function slotsForDay(availability, weekday, durationMin) {
  const ranges = availability[weekday] || [];
  const slots = [];
  ranges.forEach((range) => {
    let [h, m] = range.start.split(':').map(Number);
    const [endH, endM] = range.end.split(':').map(Number);
    while (h * 60 + m + durationMin <= endH * 60 + endM) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += durationMin;
      if (m >= 60) { h += Math.floor(m / 60); m %= 60; }
    }
  });
  return slots;
}

async function cardFieldsFromBody(body, files, existing = {}) {
  const imageFile = files && files.image && files.image[0];
  const photoFile = files && files.photo && files.photo[0];
  const bannerFile = files && files.banner && files.banner[0];
  const galleryFiles = files && files.gallery;
  const [uploadedImageUrl, uploadedPhotoUrl, uploadedBannerUrl, uploadedGalleryUrls] = await Promise.all([
    resolveUploadedUrl(imageFile),
    resolveUploadedUrl(photoFile),
    resolveUploadedUrl(bannerFile),
    resolveUploadedUrls(galleryFiles)
  ]);
  return {
    type: body.type,
    label: (body.label || body.fullName || body.targetUrl || body.wifiSsid || 'Карточка').trim(),
    // profile
    fullName: body.fullName || '',
    tagline: body.tagline || '',
    photoUrl: uploadedPhotoUrl || existing.photoUrl || '',
    bannerUrl: uploadedBannerUrl || existing.bannerUrl || '',
    galleryUrls: uploadedGalleryUrls || existing.galleryUrls || [],
    scheduleText: body.scheduleText || '',
    address: body.address || '',
    phone: body.phone || '',
    email: body.email || '',
    website: normalizeExternalUrl(body.website || ''),
    company: body.company || '',
    jobTitle: body.jobTitle || '',
    links: parseLinksInput(body.links),
    theme: buildThemeFromBody(body),
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

// Always the marketing page, regardless of any leftover admin/customer login
// cookie in the browser — a signed-in admin or customer can still reach their
// own area via /admin or /my, but "/" itself never auto-redirects, so it's
// never a moving target depending on who last logged in on this device.
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.render('landing', { tiers: computeVolumeTiersForDisplay(), designOptions: DESIGN_OPTIONS, base: baseUrl(req) });
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
    showNameOnCard: !!body.showName,
    imagePosition: {
      x: Math.max(0, Math.min(100, parseInt(body.imagePosX, 10) || 50)),
      y: Math.max(0, Math.min(100, parseInt(body.imagePosY, 10) || 50))
    },
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
  const identifier = (req.body.email || '').trim();
  const customer = db.getCustomerByEmail(identifier.toLowerCase()) || db.getCustomerByPhone(identifier);
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
  const next = (req.body && req.body.next) || '';
  res.redirect(next.startsWith('/') ? next : '/customer/login');
});

app.get('/my', requireCustomerAuth, (req, res) => {
  const customer = db.getCustomerById(req.customerId);
  const orders = db.listOrdersByCustomer(req.customerId);
  const cards = db.listCardsByCustomer(req.customerId);
  res.render('customer-dashboard', { customer, orders, cards, designOptions: DESIGN_OPTIONS, base: baseUrl(req) });
});

/** True while this card is unclaimed but this browser just registered/attached for it and hasn't saved yet. */
function hasPendingClaim(req, card) {
  const pendingId = req.signedCookies && req.signedCookies[PENDING_CLAIM_COOKIE];
  return !!(card.claimable && !card.customerId && pendingId === card.id);
}

/** The kind an already-owned card renders/edits as; unset only ever happens for cards from before this feature. */
function effectiveKind(card) {
  return card.kind || 'business';
}

app.get('/my/cards/:id/edit', requireCustomerAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  const pendingClaim = card && hasPendingClaim(req, card);
  if (!card || (card.customerId !== req.customerId && !pendingClaim)) return res.status(404).send('Card not found');

  if (pendingClaim && !card.kind) {
    return res.render('choose-card-kind', { card, kinds: KINDS, error: null });
  }

  const kind = effectiveKind(card);
  const view = kind === 'business' ? 'customer-edit-card' : `edit-kind-${kind}`;
  const locals = { card, pendingClaim, kind, kindMeta: getKind(kind), error: null };
  if (kind === 'menu') locals.menuText = formatMenuForInput(card.menuCategories);
  if (kind === 'portfolio') locals.portfolioText = formatPortfolioForInput(card.portfolioItems);
  if (kind === 'booking') locals.weekdays = WEEKDAYS;
  res.render(view, locals);
});

app.post('/my/cards/:id/kind', requireCustomerAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  const pendingClaim = card && hasPendingClaim(req, card);
  if (!card || !pendingClaim) return res.status(404).send('Card not found');
  if (card.kind) return res.redirect(`/my/cards/${card.id}/edit`); // already chosen — locked in
  if (!isValidKind(req.body.kind)) {
    return res.render('choose-card-kind', { card, kinds: KINDS, error: 'Please choose one of the options below.' });
  }
  db.updateCard(card.id, { kind: req.body.kind });
  res.redirect(`/my/cards/${card.id}/edit`);
});

app.post('/my/cards/:id/edit', requireCustomerAuth, uploadCardFiles, async (req, res) => {
  const card = db.getCardById(req.params.id);
  const pendingClaim = card && hasPendingClaim(req, card);
  if (!card || (card.customerId !== req.customerId && !pendingClaim)) return res.status(404).send('Card not found');
  if (pendingClaim && !card.kind) return res.status(400).send('Choose a card type first');

  const kind = effectiveKind(card);
  const body = req.body;
  const photoFile = req.files && req.files.photo && req.files.photo[0];
  const bannerFile = req.files && req.files.banner && req.files.banner[0];
  const galleryFiles = req.files && req.files.gallery;

  let photoUrl, bannerUrl, galleryUrls;
  try {
    [photoUrl, bannerUrl, galleryUrls] = await Promise.all([
      resolveUploadedUrl(photoFile),
      resolveUploadedUrl(bannerFile),
      resolveUploadedUrls(galleryFiles)
    ]);
  } catch (e) {
    console.error('Upload failed:', e.message);
    const view = kind === 'business' ? 'customer-edit-card' : `edit-kind-${kind}`;
    return res.render(view, { card, pendingClaim, kind, kindMeta: getKind(kind), weekdays: WEEKDAYS, error: 'Could not upload the image, please try again' });
  }

  const fullName = body.fullName || '';
  const common = {
    fullName,
    tagline: body.tagline || '',
    photoUrl: photoUrl || card.photoUrl,
    bannerUrl: bannerUrl || card.bannerUrl,
    theme: buildThemeFromBody(body),
    updatedAt: Date.now()
  };

  let extra = {};
  if (kind === 'business') {
    extra = {
      phone: body.phone || '',
      email: body.email || '',
      website: normalizeExternalUrl(body.website || ''),
      company: body.company || '',
      jobTitle: body.jobTitle || '',
      address: body.address || '',
      scheduleText: body.scheduleText || '',
      links: parseLinksInput(body.links),
      galleryUrls: galleryUrls || card.galleryUrls || []
    };
  } else if (kind === 'website') {
    extra = { website: normalizeExternalUrl(body.website || '') };
  } else if (kind === 'review') {
    extra = {
      reviewMode: body.reviewMode === 'internal' ? 'internal' : 'external',
      reviewGoogleUrl: normalizeExternalUrl(body.reviewGoogleUrl || '')
    };
  } else if (kind === 'menu') {
    extra = { menuCategories: parseMenuInput(body.menuText) };
  } else if (kind === 'portfolio') {
    extra = { portfolioItems: parsePortfolioInput(body.portfolioText, galleryUrls, card.portfolioItems) };
  } else if (kind === 'info') {
    extra = { infoBody: body.infoBody || '', address: body.address || '', galleryUrls: galleryUrls || card.galleryUrls || [] };
  } else if (kind === 'booking') {
    extra = {
      address: body.address || '',
      bookingDurationMin: [15, 30, 45, 60, 90].includes(parseInt(body.bookingDurationMin, 10)) ? parseInt(body.bookingDurationMin, 10) : 30,
      bookingWindowDays: Math.max(1, Math.min(60, parseInt(body.bookingWindowDays, 10) || 14)),
      bookingAvailability: parseAvailabilityFromBody(body)
    };
  }

  db.updateCard(card.id, {
    ...common,
    ...extra,
    // This save is what actually makes the card theirs — scanning and
    // registering alone never does, so an abandoned signup leaves the
    // card free for the next person to claim.
    ...(pendingClaim
      ? { customerId: req.customerId, claimable: false, label: `${card.slug.toUpperCase()} — ${fullName || 'Card'}` }
      : {})
  });
  if (pendingClaim) res.clearCookie(PENDING_CLAIM_COOKIE);
  res.redirect('/my');
});

app.post('/my/cards/:id/bookings/:bookingId/cancel', requireCustomerAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card || card.customerId !== req.customerId) return res.status(404).send('Card not found');
  const bookings = (card.bookings || []).map((b) => (b.id === req.params.bookingId ? { ...b, status: 'cancelled' } : b));
  db.updateCard(card.id, { bookings });
  res.redirect(`/my/cards/${card.id}/edit`);
});

// ---------- Admin: dashboard ----------

app.get('/admin', requireAuth, (req, res) => {
  const cards = db.listCards();
  const manualCards = cards.filter((c) => !c.batchId);
  const stockCards = cards.filter((c) => c.batchId);
  const stats = cards.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});
  const overview = {
    total: cards.length,
    active: cards.filter((c) => c.active !== false && !(c.claimable && !c.customerId)).length,
    paused: cards.filter((c) => c.active === false).length,
    unclaimed: cards.filter((c) => c.claimable && !c.customerId).length,
    totalViews: cards.reduce((sum, c) => sum + (c.viewCount || 0), 0)
  };
  const usingDefaultPassword = bcrypt.compareSync('admin123', db.getAdmin().passwordHash);
  res.render('dashboard', { cards, manualCards, stockCards, stats, overview, base: baseUrl(req), usingDefaultPassword });
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
    updated = await cardFieldsFromBody(req.body, req.files, {
      imageUrl: card.imageUrl,
      photoUrl: card.photoUrl,
      bannerUrl: card.bannerUrl,
      galleryUrls: card.galleryUrls
    });
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

app.get('/admin/cards/stock', requireAuth, (req, res) => {
  res.render('stock-new', { error: null });
});

app.post('/admin/cards/stock', requireAuth, (req, res) => {
  const quantity = parseInt(req.body.quantity, 10);
  if (!quantity || quantity < 1 || quantity > 100) {
    return res.render('stock-new', { error: 'Введите количество от 1 до 100' });
  }

  const batchId = crypto.randomUUID();
  for (let i = 0; i < quantity; i += 1) {
    const slug = db.nextStockCode();
    db.addCard({
      id: crypto.randomUUID(),
      slug,
      type: 'profile',
      label: slug.toUpperCase(),
      createdAt: Date.now(),
      viewCount: 0,
      lastViewedAt: null,
      active: true,
      claimable: true,
      kind: null,
      batchId,
      customerId: null,
      fullName: '',
      photoUrl: '',
      phone: '',
      email: '',
      company: '',
      jobTitle: '',
      links: [],
      targetUrl: '',
      imageUrl: '',
      wifiSsid: '',
      wifiPassword: '',
      wifiEncryption: 'WPA',
      customPayload: ''
    });
  }

  res.redirect(`/admin/cards/stock/${batchId}`);
});

app.get('/admin/cards/stock/:batchId.csv', requireAuth, (req, res) => {
  const cards = db.listCards().filter((c) => c.batchId === req.params.batchId);
  if (!cards.length) return res.status(404).send('Партия не найдена');
  const lines = ['slug,url'];
  cards.forEach((c) => lines.push(`${c.slug},${baseUrl(req)}/u/${c.slug}`));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="stock-${req.params.batchId}.csv"`);
  res.send(lines.join('\n'));
});

app.get('/admin/cards/stock/:batchId', requireAuth, (req, res) => {
  const cards = db.listCards().filter((c) => c.batchId === req.params.batchId);
  if (!cards.length) return res.status(404).send('Партия не найдена');
  const rows = cards.map((c) => ({ slug: c.slug, url: `${baseUrl(req)}/u/${c.slug}`, claimed: !c.claimable }));
  res.render('stock-result', { batchId: req.params.batchId, rows, total: rows.length });
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

// Releases a stock card that was claimed (fully or partway) back to a blank,
// claimable state — e.g. when a buyer abandoned registration halfway through
// or claimed the wrong card by mistake. The customer account itself, if one
// was created, is left untouched; only this card's link to it is cleared.
app.post('/admin/cards/:id/unclaim', requireAuth, (req, res) => {
  const card = db.getCardById(req.params.id);
  if (!card || !card.batchId) return res.status(404).send('Карточка не найдена или не является карточкой стока');
  db.updateCard(card.id, {
    customerId: null,
    claimable: true,
    kind: null,
    label: card.slug.toUpperCase(),
    fullName: '', tagline: '', photoUrl: '', bannerUrl: '', galleryUrls: [],
    phone: '', email: '', company: '', jobTitle: '', links: [],
    scheduleText: '', address: '', website: '', theme: null,
    reviewMode: 'external', reviewGoogleUrl: '', reviewFeedback: [],
    menuCategories: [], portfolioItems: [], infoBody: '',
    bookingAvailability: {}, bookingDurationMin: 30, bookingWindowDays: 14, bookings: []
  });
  res.redirect('/admin');
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
  const lang = resolveLang(req, res);
  res.render('privacy', { lang, t: (key) => translate(lang, key) });
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

  if (card.claimable && !card.customerId) {
    return res.render('claim-card', {
      t, lang, languages: LANGUAGES,
      slug: card.slug,
      loggedIn: !!currentCustomerId(req),
      method: 'email',
      error: null
    });
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
      if (card.type === 'profile' && card.kind && card.kind !== 'business') {
        return renderCardKindPublic(card.kind, card, req, res, t, lang);
      }
      // Lets the card's own owner show this same QR from their phone screen
      // as a fallback when the person they're greeting can't read NFC.
      const selfUrl = `${baseUrl(req)}/u/${card.slug}`;
      // 2x the CSS display size (132px) so the code stays crisp on retina screens.
      const qrDataUrl = await QRCode.toDataURL(selfUrl, { margin: 1, width: 264 });
      const allLinks = (card.links || []).map((l) => {
        const url = linkUrl(l);
        const customLabel = linkLabel(l);
        const detected = detectSocial(url);
        return { url, ...detected, label: customLabel || detected.label };
      });
      const socialLinks = allLinks.filter((l) => l.category === 'social');
      const messengerLinks = allLinks.filter((l) => l.category === 'messenger');
      const genericLinks = allLinks.filter((l) => !l.category);
      const ogImage = `${baseUrl(req)}/og-image.png`;
      const ogTitle = card.type === 'profile' ? (card.fullName || card.label) : card.label;
      const ogDescription =
        card.type === 'profile'
          ? [card.jobTitle, card.company].filter(Boolean).join(' · ') || 'Digital business card'
          : card.type === 'wifi'
            ? 'Wi‑Fi network'
            : 'Digital business card';
      const { wrapStyle, cardStyle } = themeStyles(card.theme);
      return res.render('public-profile', {
        card,
        qrDataUrl,
        phoneDisplay: formatPhoneDisplay(card.phone),
        t,
        lang,
        languages: LANGUAGES,
        socialLinks,
        messengerLinks,
        genericLinks,
        ogImage,
        ogTitle,
        ogDescription,
        base: baseUrl(req),
        wrapStyle,
        cardStyle
      });
    }
  }
});

async function renderCardKindPublic(kind, card, req, res, t, lang) {
  const base = baseUrl(req);
  const selfUrl = `${base}/u/${card.slug}`;
  const qrDataUrl = await QRCode.toDataURL(selfUrl, { margin: 1, width: 264 });
  const { wrapStyle, cardStyle } = themeStyles(card.theme);
  const kindMeta = getKind(kind);
  const common = {
    card, qrDataUrl, t, lang, languages: LANGUAGES, base, wrapStyle, cardStyle,
    ogImage: `${base}/og-image.png`,
    ogTitle: card.fullName || card.label,
    ogDescription: card.tagline || (kindMeta && kindMeta.tagline) || 'Digital card'
  };

  if (kind === 'website') {
    return res.render('public-website', common);
  }
  if (kind === 'review') {
    return res.render('public-review', { ...common, sent: req.query.sent === '1' });
  }
  if (kind === 'menu') {
    return res.render('public-menu', common);
  }
  if (kind === 'portfolio') {
    return res.render('public-portfolio', common);
  }
  if (kind === 'info') {
    return res.render('public-info', common);
  }
  if (kind === 'booking') {
    const availability = card.bookingAvailability || {};
    const durationMin = card.bookingDurationMin || 30;
    const windowDays = card.bookingWindowDays || 14;
    const today = new Date();
    const days = [];
    for (let i = 0; i < windowDays; i += 1) {
      const d = new Date(today.getTime() + i * 86400000);
      const weekday = WEEKDAYS[(d.getDay() + 6) % 7]; // JS: 0=Sun -> map to our mon-first index
      const slots = slotsForDay(availability, weekday, durationMin);
      if (!slots.length) continue;
      const dateStr = d.toISOString().slice(0, 10);
      const bookedTimes = (card.bookings || [])
        .filter((b) => b.date === dateStr && b.status !== 'cancelled')
        .map((b) => b.time);
      const openSlots = slots.filter((s) => !bookedTimes.includes(s));
      if (openSlots.length) days.push({ date: dateStr, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), slots: openSlots });
    }
    return res.render('public-booking', { ...common, days, booked: req.query.booked === '1', bookError: req.query.bookError === '1' });
  }
  return res.status(404).render('not-found', { t, lang, languages: LANGUAGES });
}

app.post('/u/:slug/feedback', (req, res) => {
  const card = db.getCardBySlug(req.params.slug);
  if (!card || card.type !== 'profile' || card.kind !== 'review' || card.reviewMode !== 'internal') {
    return res.status(404).send('Not found');
  }
  const comment = (req.body.comment || '').trim().slice(0, 2000);
  if (!comment) return res.redirect(`/u/${card.slug}`);
  const entry = {
    id: crypto.randomUUID(),
    name: (req.body.name || '').trim().slice(0, 200),
    comment,
    createdAt: Date.now()
  };
  db.updateCard(card.id, { reviewFeedback: [entry, ...(card.reviewFeedback || [])].slice(0, 500) });
  res.redirect(`/u/${card.slug}?sent=1`);
});

app.post('/u/:slug/book', (req, res) => {
  const card = db.getCardBySlug(req.params.slug);
  if (!card || card.type !== 'profile' || card.kind !== 'booking') return res.status(404).send('Not found');
  const { date, time } = req.body;
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect(`/u/${card.slug}?bookError=1`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    return res.redirect(`/u/${card.slug}?bookError=1`);
  }
  const durationMin = card.bookingDurationMin || 30;
  const d = new Date(`${date}T00:00:00`);
  const weekday = WEEKDAYS[(d.getDay() + 6) % 7];
  const validSlot = slotsForDay(card.bookingAvailability || {}, weekday, durationMin).includes(time);
  const alreadyBooked = (card.bookings || []).some((b) => b.date === date && b.time === time && b.status !== 'cancelled');
  if (!validSlot || alreadyBooked) return res.redirect(`/u/${card.slug}?bookError=1`);

  const booking = {
    id: crypto.randomUUID(),
    date,
    time,
    name,
    phone: (req.body.phone || '').trim().slice(0, 60),
    email: (req.body.email || '').trim().slice(0, 200),
    note: (req.body.note || '').trim().slice(0, 1000),
    status: 'confirmed',
    createdAt: Date.now()
  };
  db.updateCard(card.id, { bookings: [...(card.bookings || []), booking] });
  res.redirect(`/u/${card.slug}?booked=1`);
});

app.post('/u/:slug/claim', loginLimiter, loginSlowDown, (req, res) => {
  const lang = resolveLang(req, res);
  const t = (key) => translate(lang, key);
  const card = db.getCardBySlug(req.params.slug);
  if (!card || !card.claimable || card.customerId) {
    return res.status(404).render('not-found', { t, lang, languages: LANGUAGES });
  }

  const render = (error) => res.render('claim-card', {
    t, lang, languages: LANGUAGES, slug: card.slug, loggedIn: !!currentCustomerId(req),
    method: req.body.method === 'phone' ? 'phone' : 'email', error
  });

  function goToEditPending() {
    res.cookie(PENDING_CLAIM_COOKIE, card.id, {
      signed: true,
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'lax',
      maxAge: PENDING_CLAIM_MAX_AGE
    });
    res.redirect(`/my/cards/${card.id}/edit`);
  }

  // Already-signed-in customer: send them to the editor, but the card only
  // becomes theirs once they actually save something there.
  const existingCustomerId = currentCustomerId(req);
  if (existingCustomerId) {
    const customer = db.getCustomerById(existingCustomerId);
    if (!customer) return render('Сессия истекла, войдите заново');
    return goToEditPending();
  }

  const method = req.body.method === 'phone' ? 'phone' : 'email';
  const password = req.body.password || '';
  if (password.length < 6) return render('Пароль должен быть не короче 6 символов');

  let existing;
  let email = '';
  let phone = '';
  if (method === 'phone') {
    phone = (req.body.phone || '').trim();
    if (phone.replace(/\D/g, '').length < 6) return render('Введите корректный номер телефона');
    existing = db.getCustomerByPhone(phone);
  } else {
    email = (req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return render('Введите корректный email');
    existing = db.getCustomerByEmail(email);
  }

  let customer;
  if (existing) {
    if (!bcrypt.compareSync(password, existing.passwordHash)) {
      return render(method === 'phone'
        ? 'Аккаунт с таким номером уже есть — пароль не подошёл. Введите правильный пароль.'
        : 'Аккаунт с таким email уже есть — пароль не подошёл. Введите правильный пароль.');
    }
    customer = existing;
  } else {
    const contactName = (req.body.contactName || '').trim();
    if (!contactName) return render('Введите имя');
    if (password !== req.body.confirmPassword) return render('Пароли не совпадают');
    customer = {
      id: crypto.randomUUID(),
      email,
      phone,
      passwordHash: bcrypt.hashSync(password, 10),
      contactName,
      company: '',
      createdAt: Date.now()
    };
    db.addCustomer(customer);
  }

  res.cookie(CUSTOMER_AUTH_COOKIE, customer.id, {
    signed: true,
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: CUSTOMER_AUTH_COOKIE_MAX_AGE
  });
  goToEditPending();
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
