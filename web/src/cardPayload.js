const { customAlphabet } = require('nanoid');

const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/1/l/o/i - easier to read out loud
const generateSlug = customAlphabet(SLUG_ALPHABET, 7);

function escapeVCard(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n');
}

function buildVCard(card) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`FN:${escapeVCard(card.fullName)}`);
  lines.push(`N:${escapeVCard(card.fullName)};;;;`);
  if (card.company) lines.push(`ORG:${escapeVCard(card.company)}`);
  if (card.jobTitle) lines.push(`TITLE:${escapeVCard(card.jobTitle)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(card.phone)}`);
  if (card.email) lines.push(`EMAIL:${escapeVCard(card.email)}`);
  (card.links || [])
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((link) => lines.push(`URL:${escapeVCard(link)}`));
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/** Raw NFC Forum Wi-Fi text payload understood by most QR Wi-Fi scanners. */
function buildWifiPayload(card) {
  const enc = card.wifiEncryption === 'nopass' ? 'nopass' : card.wifiEncryption === 'WEP' ? 'WEP' : 'WPA';
  const ssid = String(card.wifiSsid || '').replace(/([\\;,:"])/g, '\\$1');
  const pass = enc === 'nopass' ? '' : `P:${String(card.wifiPassword || '').replace(/([\\;,:"])/g, '\\$1')};`;
  return `WIFI:T:${enc};S:${ssid};${pass};`;
}

/** The exact string/URL that should be written onto the physical NFC tag. */
function resolveTagPayload(card, baseUrl) {
  switch (card.type) {
    case 'profile':
    case 'url':
    case 'image':
      return `${baseUrl}/u/${card.slug}`;
    case 'wifi':
      return buildWifiPayload(card);
    case 'custom':
      return card.customPayload || `${baseUrl}/u/${card.slug}`;
    default:
      return `${baseUrl}/u/${card.slug}`;
  }
}

module.exports = { generateSlug, buildVCard, buildWifiPayload, resolveTagPayload };
