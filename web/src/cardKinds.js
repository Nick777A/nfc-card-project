// The card "kind" is chosen once, when a buyer first activates a stock card,
// and is then locked forever — the public template and the fields available
// to edit both depend on it. Kept as a single source of truth so the picker
// UI, the edit-form dispatcher and the public-render dispatcher never drift.
const KINDS = [
  {
    id: 'business',
    label: 'Business Card',
    tagline: 'The classic digital business card',
    description: 'Contact details, socials, photo and a Save Contact button. The right choice for a person or a small team.',
    icon: 'business'
  },
  {
    id: 'website',
    label: 'Website',
    tagline: 'A clean gateway to your site',
    description: 'A short pitch, your logo, and a big button straight to your website — for a brand that already has a site to show.',
    icon: 'website'
  },
  {
    id: 'review',
    label: 'Reviews & Feedback',
    tagline: 'Collect reviews your way',
    description: 'One button visitors tap to leave feedback — send it straight to your Google review page, or keep it inside Digilama.',
    icon: 'review'
  },
  {
    id: 'menu',
    label: 'Menu',
    tagline: 'For cafés, bars & restaurants',
    description: 'A categorized menu with descriptions and prices, always up to date — no reprinting when prices change.',
    icon: 'menu'
  },
  {
    id: 'booking',
    label: 'Booking',
    tagline: 'Let people book your time',
    description: 'Set your weekly opening hours once — visitors pick an open slot and request a booking, no back-and-forth.',
    icon: 'booking'
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    tagline: 'Show off your work',
    description: 'A gallery of projects, each with an image, a description and a link — for creatives, agencies and freelancers.',
    icon: 'portfolio'
  },
  {
    id: 'info',
    label: 'Info Page',
    tagline: 'Tell the story of a place or thing',
    description: 'A rich page with photos and a long description — for a landmark, an exhibit, a rental, or anything worth explaining.',
    icon: 'info'
  }
];

const KIND_IDS = KINDS.map((k) => k.id);

function isValidKind(id) {
  return KIND_IDS.includes(id);
}

function getKind(id) {
  return KINDS.find((k) => k.id === id) || null;
}

module.exports = { KINDS, KIND_IDS, isValidKind, getKind };
