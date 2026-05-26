/*
  Скачивает НАСТОЯЩИЕ картинки CS2/CS:GO скинов и прописывает локальные пути в skins.js.
  Источник картинок: ByMykel CSGO-API -> Steam CDN image.
  Цены: Steam Community Market priceoverview, если Steam не ограничит запросы.

  Запуск из корня проекта:
    node tools/download-real-assets-and-prices.js

  После выполнения сайт будет брать картинки из assets/skins/*.png, а не из интернета.
*/
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKINS_JS = path.join(ROOT, 'skins.js');
const OUT_DIR = path.join(ROOT, 'assets', 'skins');
const API_URLS = [
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json',
  'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/skins_not_grouped.json',
];
const PRICE_CACHE = path.join(ROOT, 'tools', '.steam-price-cache.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanName = name => String(name || '')
  .replace(/[’`´]/g, "'")
  .replace(/^★\s*/, '')
  .replace(/^StatTrak™\s*/i, '')
  .replace(/^Souvenir\s*/i, '')
  .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function parseDatabase(js) {
  const start = js.indexOf('[');
  const end = js.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Не нашел массив LARGE_SKINS_DATABASE в skins.js');
  // skins.js содержит обычные JS object literals; eval только локального файла проекта.
  return Function(`return (${js.slice(start, end + 1)});`)();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'NA_MYASE asset updater' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function loadApi() {
  let lastErr;
  for (const url of API_URLS) {
    try { return await fetchJson(url); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function buildImageMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const image = row.image || row.image_url || row.icon_url;
    const names = [row.name, row.market_hash_name, row.item_name]
      .concat(row.weapon?.name && row.pattern?.name ? [`${row.weapon.name} | ${row.pattern.name}`] : []);
    for (const name of names) {
      const key = cleanName(name);
      if (key && image && !map.has(key)) map.set(key, image);
    }
  }
  return map;
}

async function downloadFile(url, dest) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('Файл слишком маленький, похоже это не картинка');
  await fs.writeFile(dest, buf);
}

function parseSteamPrice(payload) {
  const raw = payload?.lowest_price || payload?.median_price || '';
  const m = String(raw).replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/);
  return m ? Number(Number(m[0]).toFixed(2)) : null;
}

async function getSteamPrice(name, cache) {
  if (cache[name]) return cache[name];
  const url = `https://steamcommunity.com/market/priceoverview/?country=US&currency=1&appid=730&market_hash_name=${encodeURIComponent(name)}`;
  try {
    const data = await fetchJson(url);
    const price = parseSteamPrice(data);
    if (price) cache[name] = price;
    await sleep(900); // не долбим Steam слишком быстро
    return price;
  } catch (_) {
    await sleep(1500);
    return null;
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const src = await fs.readFile(SKINS_JS, 'utf8');
  const skins = parseDatabase(src);
  const api = await loadApi();
  const imageMap = buildImageMap(api);
  let priceCache = {};
  try { priceCache = JSON.parse(await fs.readFile(PRICE_CACHE, 'utf8')); } catch {}

  let okImages = 0, missImages = 0, okPrices = 0;
  for (const skin of skins) {
    const imageUrl = imageMap.get(cleanName(skin.name));
    if (imageUrl) {
      const ext = imageUrl.includes('.png') ? 'png' : 'png';
      const file = `${skin.id}.${ext}`;
      const rel = `assets/skins/${file}`;
      const dest = path.join(OUT_DIR, file);
      try {
        await fs.access(dest);
      } catch {
        await downloadFile(imageUrl, dest);
        await sleep(120);
      }
      skin.image = rel;
      okImages++;
    } else {
      delete skin.image;
      missImages++;
    }

    const price = await getSteamPrice(skin.name, priceCache);
    if (price) { skin.price = price; okPrices++; }
    process.stdout.write(`\rimages ${okImages}/${skins.length}, prices ${okPrices}/${skins.length}, missing ${missImages}`);
  }
  await fs.writeFile(PRICE_CACHE, JSON.stringify(priceCache, null, 2));
  const out = 'const LARGE_SKINS_DATABASE = ' + JSON.stringify(skins, null, 4) + ';\n\nwindow.LARGE_SKINS_DATABASE = LARGE_SKINS_DATABASE;\n';
  await fs.writeFile(SKINS_JS, out, 'utf8');
  console.log(`\nГотово. Картинки: ${okImages}, не найдено: ${missImages}, цены обновлены: ${okPrices}`);
}

main().catch(err => { console.error('\nОшибка:', err); process.exit(1); });
