#!/usr/bin/env node
/*
  Builds data/skins.json with 2000+ real CS2 items.

  Sources:
  - Names/images/rarity: ByMykel CSGO-API skins_not_grouped.json
  - Prices, best quality: CSGOSKINS.GG API with your key, or Steam Market priceoverview fallback.

  Examples:
    node tools/build-best-skins-db.mjs --limit=3500
    node tools/build-best-skins-db.mjs --limit=2500 --steam-prices
    CSGOSKINS_API_KEY=xxxx node tools/build-best-skins-db.mjs --limit=5000 --csgoskins-prices
*/
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUT_DIR = path.join(ROOT, 'data');
const OUT_FILE = path.join(OUT_DIR, 'skins.json');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v = true] = a.replace(/^--/, '').split('=');
  return [k, v];
}));
const LIMIT = Number(args.limit || 3000);
const USE_STEAM = Boolean(args['steam-prices']);
const USE_CSGOSKINS = Boolean(args['csgoskins-prices'] || process.env.CSGOSKINS_API_KEY);
const CSGOSKINS_API_KEY = process.env.CSGOSKINS_API_KEY || '';
const BYMYKEL_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json';
const WEARS = [
  { name: 'Factory New', short: 'FN', min: 0, max: 0.07, mult: 1.75 },
  { name: 'Minimal Wear', short: 'MW', min: 0.07, max: 0.15, mult: 1.22 },
  { name: 'Field-Tested', short: 'FT', min: 0.15, max: 0.38, mult: 1.00 },
  { name: 'Well-Worn', short: 'WW', min: 0.38, max: 0.45, mult: 0.82 },
  { name: 'Battle-Scarred', short: 'BS', min: 0.45, max: 1, mult: 0.68 }
];
const RARITY_BASE_PRICE = { consumer: .35, industrial: .85, milspec: 2.4, restricted: 8.5, classified: 26, covert: 78, contraband: 650, knife: 190, gloves: 155 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = v => String(v || '').trim().toLowerCase();
function hashText(text) { let h = 2166136261; for (const ch of String(text || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function slug(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/★/g, 'star').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96); }
function normalizeRarity(value, name = '') {
  const text = norm(`${value || ''} ${name || ''}`).replace(/[-_\s]/g, '');
  if (text.includes('contraband')) return 'contraband';
  if (norm(name).includes('glove')) return 'gloves';
  if (name.includes('★') || norm(name).includes('knife') || norm(name).includes('bayonet') || norm(name).includes('karambit')) return 'knife';
  if (text.includes('covert') || text.includes('extraordinary')) return 'covert';
  if (text.includes('classified')) return 'classified';
  if (text.includes('restricted')) return 'restricted';
  if (text.includes('milspec') || text.includes('mil-spec')) return 'milspec';
  if (text.includes('industrial')) return 'industrial';
  if (text.includes('consumer')) return 'consumer';
  return 'milspec';
}
function isWeaponSkin(item) {
  const text = norm(`${item?.type || ''} ${item?.name || ''} ${item?.category || ''} ${item?.rarity || ''}`);
  const blocked = ['sticker','graffiti','case','capsule','music','agent','patch','pin','souvenir package','key','collectible'];
  if (blocked.some(x => text.includes(x))) return false;
  const words = ['ak-47','m4a4','m4a1-s','awp','usp-s','glock','desert eagle','deagle','p250','p90','mp9','mac-10','famas','galil','ssg 08','aug','sg 553','tec-9','five-seven','cz75','dual berettas','mp7','mp5','ump-45','pp-bizon','nova','xm1014','mag-7','sawed-off','negev','m249','scar-20','g3sg1','knife','bayonet','karambit','butterfly','gloves','★'];
  return words.some(w => text.includes(w));
}
function inferType(item, name = '') { return String(item?.weapon?.name || item?.category?.name || item?.type || item?.weapon || String(name).split('|')[0] || 'Skin').trim(); }
function isWearAllowed(item, wear) {
  const min = Number(item?.min_float ?? item?.wear_min ?? item?.paintkits?.[0]?.wear_min ?? 0);
  const max = Number(item?.max_float ?? item?.wear_max ?? item?.paintkits?.[0]?.wear_max ?? 1);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return true;
  return wear.max >= min && wear.min <= max;
}
function estimate(name, rarity, type, wearShort) {
  const h = hashText(`${name}|${rarity}|${type}|${wearShort}`);
  let base = RARITY_BASE_PRICE[rarity] || 2.2;
  if (rarity === 'knife' || String(name).includes('★')) base *= 1.2 + (h % 240) / 100;
  if (rarity === 'gloves') base *= 1.1 + (h % 220) / 100;
  if (/dragon lore|gungnir|wild lotus|howl|medusa|dlore/i.test(name)) base *= 18;
  if (/doppler|fade|marble fade|gamma doppler|slaughter/i.test(name)) base *= 2.2;
  const wear = WEARS.find(w => w.short === wearShort) || WEARS[2];
  const spread = 0.72 + ((h >>> 8) % 90) / 100;
  return Math.max(0.03, Number((base * wear.mult * spread).toFixed(2)));
}
function expand(item, index) {
  const baseName = String(item?.name || item?.market_hash_name || '').trim();
  const type = inferType(item, baseName);
  if (!baseName || !isWeaponSkin({ name: baseName, type, rarity: item?.rarity?.name || item?.rarity })) return [];
  const rarity = normalizeRarity(item?.rarity?.name || item?.rarity || item?.rarity_color, baseName);
  const image = item?.image || item?.image_url || item?.image_url_steam || item?.icon_url || '';
  const alreadyHasWear = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i.test(baseName);
  const variants = alreadyHasWear ? [WEARS.find(w => baseName.includes(w.name)) || WEARS[2]] : WEARS.filter(w => isWearAllowed(item, w));
  return variants.map(w => {
    const marketName = alreadyHasWear ? baseName : `${baseName} (${w.name})`;
    return { id: slug(marketName), name: marketName, market_hash_name: marketName, price: estimate(marketName, rarity, type, w.short), priceSource: 'estimate', type, wear: w.short, rarity, category: item?.category?.name || item?.category || '', image, source: 'ByMykel CSGO-API', sourceIndex: index };
  });
}
async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}
async function applyCsgoskinsPrices(rows) {
  if (!CSGOSKINS_API_KEY) return rows;
  console.log('Loading CSGOSKINS.GG prices...');
  const data = await fetchJson('https://csgoskins.gg/api/v1/prices?range=current', { headers: { Authorization: `Bearer ${CSGOSKINS_API_KEY}`, Accept: 'application/json' } });
  const priceByName = new Map();
  for (const item of data.data || []) {
    const prices = Array.isArray(item.prices) ? item.prices : [];
    const valid = prices.filter(p => Number(p.price) > 0).sort((a, b) => Number(a.price) - Number(b.price));
    if (valid[0]) priceByName.set(norm(item.market_hash_name), { price: Number(valid[0].price) / 100, updatedAt: valid[0].updated_at });
  }
  for (const row of rows) {
    const p = priceByName.get(norm(row.market_hash_name));
    if (p) Object.assign(row, { price: Number(p.price.toFixed(2)), priceSource: 'csgoskins.gg', priceUpdatedAt: p.updatedAt });
  }
  return rows;
}
async function steamPrice(row) {
  const url = new URL('https://steamcommunity.com/market/priceoverview/');
  url.searchParams.set('appid', '730');
  url.searchParams.set('currency', '1');
  url.searchParams.set('market_hash_name', row.market_hash_name);
  const data = await fetchJson(url);
  const text = data.lowest_price || data.median_price || '';
  const num = Number(String(text).replace(/[^0-9.,]/g, '').replace(',', '.'));
  if (Number.isFinite(num) && num > 0) return Number(num.toFixed(2));
  return null;
}
async function applySteamPrices(rows) {
  console.log(`Loading Steam prices for ${rows.length} items. This is slow to avoid rate-limit...`);
  let ok = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      const p = await steamPrice(rows[i]);
      if (p) { rows[i].price = p; rows[i].priceSource = 'steam'; rows[i].priceUpdatedAt = Math.floor(Date.now() / 1000); ok++; }
    } catch {}
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${rows.length}, priced ${ok}`);
    await sleep(850);
  }
  return rows;
}
console.log('Downloading ByMykel skins...');
const raw = await fetchJson(BYMYKEL_URL);
const seen = new Set();
let rows = [];
raw.forEach((item, i) => expand(item, i).forEach(row => {
  const key = norm(row.market_hash_name);
  if (!seen.has(key)) { seen.add(key); rows.push(row); }
}));
rows = rows.sort((a, b) => a.price - b.price).slice(0, LIMIT);
if (USE_CSGOSKINS) rows = await applyCsgoskinsPrices(rows);
if (USE_STEAM) rows = await applySteamPrices(rows);
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(OUT_FILE, JSON.stringify(rows, null, 2));
console.log(`Done: ${rows.length} skins -> ${path.relative(ROOT, OUT_FILE)}`);
