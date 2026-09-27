/**
 * Detects a known social/messaging/other platform from a URL so the public
 * card can show a recognizable icon instead of a generic "Link" row.
 * Icons are small inline SVGs (currentColor) — no external icon font/CDN.
 * Platforms with no hand-drawn icon below fall back to a plain lettered
 * badge (see letterIcon), so any recognized hostname still gets an icon.
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
  viber: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5c4.4 0 7.5 2.7 7.5 7.2 0 4-2.6 6.7-6.5 7.1-.9.1-1.7.4-2.4 1l-2.1 1.8a.5.5 0 0 1-.8-.4v-2.2c-2.4-1-3.9-3.3-3.9-6.5 0-4.6 3.5-8 8.2-8Z" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.3c-.1 3 2.3 5.5 5.4 5.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14.7 12.9c-.3-.2-.9-.6-1.2-.4-.3.1-.5.5-.7.7-.1.1-.3.2-.5.1-.7-.3-1.5-.9-1.9-1.7 0-.2 0-.4.1-.5.2-.2.5-.4.5-.7.1-.3-.4-1-.6-1.3-.2-.2-.4-.2-.6-.1-.5.2-.8.7-.8 1.2 0 1.4 1.6 3.6 3 4.1.5.2 1.1.1 1.4-.3.2-.3.5-.6.4-1z" fill="currentColor"/></svg>',
  signal: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5a8.4 8.4 0 0 0-7.2 12.7L3.5 20.5l4.4-1.2A8.4 8.4 0 1 0 12 3.5Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  skype: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.5c0-1 1-1.7 2.3-1.7 1.4 0 2.4.8 2.4 1.6 0 .6-.4 1-1 1.1M9 14.5c0 1 1 1.7 2.4 1.7 1.4 0 2.4-.7 2.4-1.6 0-1.2-1.3-1.5-2.6-1.8-1.5-.3-3-.7-3-2.1 0-1.2 1.1-2 2.3-2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  wechat: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 4.5c-3.6 0-6.2 2.4-6.2 5.4 0 1.7 1 3.2 2.5 4.2l-.5 2 2-1c.7.2 1.4.3 2.2.3h.4a5.4 5.4 0 0 1-.2-1.5c0-3 2.9-5.4 6.4-5.4h.3C15.4 6 12.5 4.5 9 4.5Z" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 10.5c-3 0-5.4 2-5.4 4.5s2.4 4.5 5.4 4.5c.6 0 1.2-.1 1.8-.3l1.8.9-.5-1.8c1.1-.8 1.8-1.9 1.8-3.3 0-2.5-2.4-4.5-4.9-4.5Z" stroke="currentColor" stroke-width="1.6"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4.5" width="19" height="13" rx="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M7 10v3.5M9.5 10v3.5M12 10v3.5l2-3.5v3.5M15.5 10h2.2v3.5h-2.2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  website: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 12h19M12 2.5c2.5 2.7 3.8 6 3.8 9.5s-1.3 6.8-3.8 9.5c-2.5-2.7-3.8-6-3.8-9.5s1.3-6.8 3.8-9.5Z" stroke="currentColor" stroke-width="1.8"/></svg>'
};

/** A plain lettered badge for a recognized platform that has no bespoke icon above. */
function letterIcon(letter) {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15.7" text-anchor="middle" font-size="10.5" font-weight="700" fill="currentColor" font-family="Arial, sans-serif">${letter}</text></svg>`;
}

const MATCHERS = [
  // -- Social / content platforms --
  { key: 'instagram', label: 'Instagram', category: 'social', test: (h) => h.includes('instagram.com') },
  { key: 'facebook', label: 'Facebook', category: 'social', test: (h) => h.includes('facebook.com') || h.includes('fb.com') },
  { key: 'x', label: 'X (Twitter)', category: 'social', test: (h) => h.includes('twitter.com') || h.includes('x.com') },
  { key: 'linkedin', label: 'LinkedIn', category: 'social', test: (h) => h.includes('linkedin.com') },
  { key: 'tiktok', label: 'TikTok', category: 'social', test: (h) => h.includes('tiktok.com') },
  { key: 'youtube', label: 'YouTube', category: 'social', test: (h) => h.includes('youtube.com') || h.includes('youtu.be') },
  { key: 'github', label: 'GitHub', category: 'social', test: (h) => h.includes('github.com') },
  { key: 'pinterest', label: 'Pinterest', category: 'social', test: (h) => h.includes('pinterest.') },
  { key: 'reddit', label: 'Reddit', category: 'social', test: (h) => h.includes('reddit.com') },
  { key: 'discord', label: 'Discord', category: 'social', test: (h) => h.includes('discord.gg') || h.includes('discord.com') },
  { key: 'twitch', label: 'Twitch', category: 'social', test: (h) => h.includes('twitch.tv') },
  { key: 'spotify', label: 'Spotify', category: 'social', test: (h) => h.includes('spotify.com') },
  { key: 'soundcloud', label: 'SoundCloud', category: 'social', test: (h) => h.includes('soundcloud.com') },
  { key: 'applemusic', label: 'Apple Music', category: 'social', test: (h) => h.includes('music.apple.com') },
  { key: 'snapchat', label: 'Snapchat', category: 'social', test: (h) => h.includes('snapchat.com') },
  { key: 'threads', label: 'Threads', category: 'social', test: (h) => h.includes('threads.net') },
  { key: 'medium', label: 'Medium', category: 'social', test: (h) => h.includes('medium.com') },
  { key: 'behance', label: 'Behance', category: 'social', test: (h) => h.includes('behance.net') },
  { key: 'dribbble', label: 'Dribbble', category: 'social', test: (h) => h.includes('dribbble.com') },
  { key: 'vimeo', label: 'Vimeo', category: 'social', test: (h) => h.includes('vimeo.com') },
  { key: 'tumblr', label: 'Tumblr', category: 'social', test: (h) => h.includes('tumblr.com') },
  { key: 'mastodon', label: 'Mastodon', category: 'social', test: (h) => h.includes('mastodon.social') },
  { key: 'vk', label: 'VK', category: 'social', test: (h) => h.includes('vk.com') },
  { key: 'ok', label: 'Odnoklassniki', category: 'social', test: (h) => h.includes('ok.ru') },
  { key: 'wikipedia', label: 'Wikipedia', category: 'social', test: (h) => h.includes('wikipedia.org') },
  { key: 'quora', label: 'Quora', category: 'social', test: (h) => h.includes('quora.com') },
  { key: 'flickr', label: 'Flickr', category: 'social', test: (h) => h.includes('flickr.com') },
  // -- Business / commerce / booking --
  { key: 'yelp', label: 'Yelp', category: 'social', test: (h) => h.includes('yelp.com') },
  { key: 'tripadvisor', label: 'TripAdvisor', category: 'social', test: (h) => h.includes('tripadvisor.') },
  { key: 'booking', label: 'Booking.com', category: 'social', test: (h) => h.includes('booking.com') },
  { key: 'airbnb', label: 'Airbnb', category: 'social', test: (h) => h.includes('airbnb.') },
  { key: 'etsy', label: 'Etsy', category: 'social', test: (h) => h.includes('etsy.com') },
  { key: 'amazon', label: 'Amazon', category: 'social', test: (h) => h.includes('amazon.') },
  { key: 'googlemaps', label: 'Google Maps', category: 'social', test: (h) => h.includes('maps.google.') || h.includes('goo.gl/maps') },
  { key: 'googlebusiness', label: 'Google Business', category: 'social', test: (h) => h.includes('g.page') },
  { key: 'patreon', label: 'Patreon', category: 'social', test: (h) => h.includes('patreon.com') },
  { key: 'paypal', label: 'PayPal', category: 'social', test: (h) => h.includes('paypal.') },
  { key: 'cashapp', label: 'Cash App', category: 'social', test: (h) => h.includes('cash.app') },
  { key: 'venmo', label: 'Venmo', category: 'social', test: (h) => h.includes('venmo.com') },
  { key: 'calendly', label: 'Calendly', category: 'social', test: (h) => h.includes('calendly.com') },
  { key: 'zoom', label: 'Zoom', category: 'social', test: (h) => h.includes('zoom.us') },
  { key: 'slack', label: 'Slack', category: 'social', test: (h) => h.includes('slack.com') },
  // -- Messengers --
  { key: 'whatsapp', label: 'WhatsApp', category: 'messenger', test: (h) => h.includes('wa.me') || h.includes('whatsapp.com') },
  { key: 'telegram', label: 'Telegram', category: 'messenger', test: (h) => h.includes('t.me') || h.includes('telegram.me') },
  { key: 'viber', label: 'Viber', category: 'messenger', test: (h) => h.includes('viber.com') },
  { key: 'signal', label: 'Signal', category: 'messenger', test: (h) => h.includes('signal.me') || h.includes('signal.org') },
  { key: 'skype', label: 'Skype', category: 'messenger', test: (h) => h.includes('skype.com') || h.includes('join.skype.com') },
  { key: 'wechat', label: 'WeChat', category: 'messenger', test: (h) => h.includes('wechat.com') || h.includes('weixin.qq.com') },
  { key: 'line', label: 'LINE', category: 'messenger', test: (h) => h.includes('line.me') },
  { key: 'kakao', label: 'KakaoTalk', category: 'messenger', test: (h) => h.includes('kakao.com') || h.includes('pf.kakao.com') }
];

/** category is 'social', 'messenger', or null for an unrecognized/generic link. */
function detectSocial(url) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { key: 'website', label: 'Website', svg: ICONS.website, category: null };
  }
  const match = MATCHERS.find((m) => m.test(hostname));
  if (match) {
    const svg = ICONS[match.key] || letterIcon(match.label.charAt(0).toUpperCase());
    return { key: match.key, label: match.label, svg, category: match.category };
  }
  return { key: 'website', label: 'Website', svg: ICONS.website, category: null };
}

module.exports = { detectSocial };
