/**
 * Detects a known social/messaging platform from a URL so the public card
 * can show a recognizable icon + label instead of a generic "Link" row.
 * Icons are small inline SVGs (currentColor) — no external icon font/CDN.
 */

const ICONS = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.3" stroke="currentColor" stroke-width="1.8"/><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="M13.8 8.6h1.6V6.2h-1.9c-1.9 0-3 1.1-3 3v1.6H8.9v2.4h1.6V18h2.5v-4.8h1.8l.4-2.4h-2.2V9.3c0-.5.2-.7.8-.7Z" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 4.5 19 19.5M19 4.5 5 19.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="19" height="19" rx="4" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="8" r="1.2" fill="currentColor"/><path d="M7.5 11v6.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11.5 17.2V13c0-1.3.9-2.2 2-2.2s1.8.8 1.8 2.1v4.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11.5 11.2v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 3.5c.4 2 1.9 3.5 3.9 3.7v2.7c-1.4 0-2.8-.4-3.9-1.2v6.1c0 3-2.4 5.2-5.1 5.2-2.8 0-5.1-2.3-5.1-5.2 0-3 2.4-5.2 5.1-5.2.3 0 .6 0 .9.1v2.8a2.4 2.4 0 0 0-.9-.2 2.5 2.5 0 1 0 2.4 2.5V3.5H14Z" fill="currentColor"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M10.3 9.3v5.4l4.6-2.7-4.6-2.7Z" fill="currentColor"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.5 20.5l4.4-1.2A8.4 8.4 0 1 0 12 3.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M8.7 8.6c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .5.4.2.4.6 1.4.7 1.5.1.1.1.3 0 .4-.1.2-.2.3-.3.5-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2 1.1.9 1.9 1.2 2.2 1.3.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.5.7 1.7.8.2.1.4.2.4.3 0 .2 0 .9-.3 1.3-.4.5-1.3.9-1.8.9-.5 0-1.1 0-3.3-1.4-2.7-1.7-3.5-3.6-3.6-3.8-.1-.2-.9-1.3-.9-2.5 0-1.2.6-1.8.8-2Z" fill="currentColor"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 12.3 16.8 8l-1.7 8.8c-.1.5-.5.6-.9.4l-2.5-1.9-1.2 1.2c-.1.1-.3.2-.4.2l.2-2.6 4.9-4.5c.2-.2 0-.3-.2-.1l-6 3.8-2.6-.8c-.6-.2-.6-.6.1-.9Z" fill="currentColor"/></svg>',
  github: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.6-.2.6-.4v-1.7c-2.6.6-3.2-1.1-3.2-1.1-.4-1-1-1.3-1-1.3-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2-.2-4.2-1-4.2-4.5 0-1 .3-1.8.9-2.5-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7.9 1.5.9 2.5 0 3.5-2.2 4.3-4.2 4.5.3.3.6.8.6 1.7v2.4c0 .2.1.5.6.4A9.5 9.5 0 0 0 12 2.5Z" fill="currentColor"/></svg>',
  website: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 12h19M12 2.5c2.5 2.7 3.8 6 3.8 9.5s-1.3 6.8-3.8 9.5c-2.5-2.7-3.8-6-3.8-9.5s1.3-6.8 3.8-9.5Z" stroke="currentColor" stroke-width="1.8"/></svg>'
};

const MATCHERS = [
  { key: 'instagram', label: 'Instagram', test: (h) => h.includes('instagram.com') },
  { key: 'facebook', label: 'Facebook', test: (h) => h.includes('facebook.com') || h.includes('fb.com') },
  { key: 'x', label: 'X (Twitter)', test: (h) => h.includes('twitter.com') || h.includes('x.com') },
  { key: 'linkedin', label: 'LinkedIn', test: (h) => h.includes('linkedin.com') },
  { key: 'tiktok', label: 'TikTok', test: (h) => h.includes('tiktok.com') },
  { key: 'youtube', label: 'YouTube', test: (h) => h.includes('youtube.com') || h.includes('youtu.be') },
  { key: 'whatsapp', label: 'WhatsApp', test: (h) => h.includes('wa.me') || h.includes('whatsapp.com') },
  { key: 'telegram', label: 'Telegram', test: (h) => h.includes('t.me') || h.includes('telegram.me') },
  { key: 'github', label: 'GitHub', test: (h) => h.includes('github.com') }
];

function detectSocial(url) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { key: 'website', label: 'Website', svg: ICONS.website };
  }
  const match = MATCHERS.find((m) => m.test(hostname));
  if (match) return { key: match.key, label: match.label, svg: ICONS[match.key] };
  return { key: 'website', label: 'Website', svg: ICONS.website };
}

module.exports = { detectSocial };
