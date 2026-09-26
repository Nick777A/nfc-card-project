// Per-card price drops with volume; add-ons are a flat surcharge per card.
const VOLUME_TIERS = [
  { minQty: 10, pricePerCard: 14.9 },
  { minQty: 3, pricePerCard: 17.9 },
  { minQty: 1, pricePerCard: 19.9 }
];

const DESIGN_OPTIONS = {
  classic: { label: 'Классическая белая карта', pricePerCard: 0 },
  'logo-print': { label: 'Ваш логотип на карте (печать)', pricePerCard: 3 },
  sticker: { label: 'Стикер с логотипом и изображениями', pricePerCard: 1 }
};

function basePricePerCard(quantity) {
  const tier = VOLUME_TIERS.find((t) => quantity >= t.minQty);
  return tier.pricePerCard;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function computeOrderPricing(rawQuantity, designKey) {
  const quantity = Math.max(1, Math.min(500, parseInt(rawQuantity, 10) || 1));
  const design = DESIGN_OPTIONS[designKey] ? designKey : 'classic';
  const base = basePricePerCard(quantity);
  const addon = DESIGN_OPTIONS[design].pricePerCard;
  const pricePerCard = round2(base + addon);
  const total = round2(pricePerCard * quantity);
  return { quantity, design, basePricePerCard: base, addonPricePerCard: addon, pricePerCard, total };
}

module.exports = { VOLUME_TIERS, DESIGN_OPTIONS, computeOrderPricing };
