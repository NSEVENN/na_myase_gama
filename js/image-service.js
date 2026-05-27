(function () {
    'use strict';

    const REAL_IMAGE_ENDPOINTS = [
        'https://bymykel.com/CSGO-API/api/en/skins_not_grouped.json',
        'https://bymykel.com/CSGO-API/api/en/stickers.json',
        'https://bymykel.com/CSGO-API/api/en/sticker_slabs.json',
        'https://bymykel.com/CSGO-API/api/en/crates.json',
        'https://bymykel.com/CSGO-API/api/en/music_kits.json',
        'https://bymykel.com/CSGO-API/api/en/graffiti.json',
        'https://bymykel.com/CSGO-API/api/en/collectibles.json',
        'https://bymykel.com/CSGO-API/api/en/patches.json',
        'https://bymykel.com/CSGO-API/api/en/keychains.json',
        'https://bymykel.com/CSGO-API/api/en/agents.json',
        'https://bymykel.github.io/CSGO-API/api/en/skins_not_grouped.json',
        'https://bymykel.github.io/CSGO-API/api/en/stickers.json',
        'https://bymykel.github.io/CSGO-API/api/en/sticker_slabs.json',
        'https://bymykel.github.io/CSGO-API/api/en/crates.json',
        'https://bymykel.github.io/CSGO-API/api/en/music_kits.json',
        'https://bymykel.github.io/CSGO-API/api/en/graffiti.json',
        'https://bymykel.github.io/CSGO-API/api/en/collectibles.json',
        'https://bymykel.github.io/CSGO-API/api/en/patches.json',
        'https://bymykel.github.io/CSGO-API/api/en/keychains.json',
        'https://bymykel.github.io/CSGO-API/api/en/agents.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/sticker_slabs.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/music_kits.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/graffiti.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collectibles.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/patches.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/skins_not_grouped.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/stickers.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/sticker_slabs.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/crates.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/music_kits.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/graffiti.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/collectibles.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/patches.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/keychains.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/agents.json'
    ];
    const REAL_IMAGE_CACHE_KEY = 'na_myase_real_skin_images_all_items_v13';
    const REAL_IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

    function create({ onImagesUpdated = () => {} } = {}) {
        const realImages = new Map();
        let realImagesLoading = false;
        let realImagesLoaded = false;

        function normalizeImageName(name) {
            return String(name || '').replace(/[’`´]/g, "'").replace(/^★\s*/, '').replace(/^StatTrak™\s*/i, '').replace(/^Souvenir\s*/i, '').replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
        }
        function imageKeys(name) {
            const raw = String(name || '').trim();
            const base = normalizeImageName(raw);
            const withoutWear = base.replace(/\s*\((factory new|minimal wear|field-tested|well-worn|battle-scarred)\)\s*$/i, '');
            const keys = new Set([base, withoutWear]);
            keys.add(withoutWear.replace(/\s+(sapphire|ruby|black pearl|emerald|phase 1|phase 2|phase 3|phase 4)$/i, ''));
            keys.add(normalizeImageName(raw.replace(/^Sticker\s*\|\s*/i, '')));
            keys.add(normalizeImageName(raw.replace(/^Sealed Graffiti\s*\|\s*/i, 'Graffiti | ')));
            keys.add(normalizeImageName(raw.replace(/^Collectible Pin\s*\|\s*/i, 'Pin | ')));
            keys.add(normalizeImageName(raw.replace(/^Souvenir Package\s*\|\s*/i, '')));
            keys.add(normalizeImageName(raw.replace(/^Music Kit\s*\|\s*/i, '')));
            return Array.from(keys).filter(Boolean);
        }
        function rememberRealImage(name, image) {
            if (!name || !image) return;
            imageKeys(name).forEach(key => { if (!realImages.has(key)) realImages.set(key, image); });
        }
        function walkImageApi(value) {
            if (!value) return;
            if (Array.isArray(value)) return value.forEach(walkImageApi);
            if (typeof value !== 'object') return;
            const image = value.image || value.image_url || value.icon_url;
            [value.name, value.market_hash_name, value.item_name, value.weapon?.name && value.pattern?.name ? `${value.weapon.name} | ${value.pattern.name}` : '', value.weapon?.name && value.pattern?.name ? `${value.weapon.name} | ${value.pattern.name} (${value.wear?.name || value.exterior || ''})` : '', value.type && value.name ? `${value.type} | ${value.name}` : ''].forEach(name => rememberRealImage(name, image));
            if (value.market_hash_name) rememberRealImage(value.market_hash_name, image);
            if (value.name && value.paint_index && value.name.toLowerCase().includes('doppler')) rememberRealImage(value.name.replace(/\s*\((.*?)\)\s*$/, ''), image);
            Object.values(value).forEach(child => { if (child && typeof child === 'object') walkImageApi(child); });
        }
        function loadCachedRealImages() {
            try {
                const cached = JSON.parse(localStorage.getItem(REAL_IMAGE_CACHE_KEY) || 'null');
                if (!cached || !cached.time || !Array.isArray(cached.rows)) return false;
                if (Date.now() - cached.time > REAL_IMAGE_CACHE_TTL) return false;
                cached.rows.forEach(([key, url]) => { if (key && url) realImages.set(key, url); });
                realImagesLoaded = realImages.size > 0;
                return realImagesLoaded;
            } catch (_) { return false; }
        }
        async function loadRealImages() {
            if (realImagesLoading || realImagesLoaded) return;
            realImagesLoading = true;
            if (loadCachedRealImages()) onImagesUpdated();
            try {
                const seen = new Set();
                for (const url of REAL_IMAGE_ENDPOINTS) {
                    const fileName = url.split('/').pop();
                    if (seen.has(fileName)) continue;
                    seen.add(fileName);
                    try {
                        const res = await fetch(url, { cache: 'force-cache' });
                        if (res.ok) walkImageApi(await res.json());
                    } catch (_) {}
                }
                realImagesLoaded = realImages.size > 0;
                if (realImagesLoaded) {
                    localStorage.setItem(REAL_IMAGE_CACHE_KEY, JSON.stringify({ time: Date.now(), rows: Array.from(realImages.entries()) }));
                    onImagesUpdated();
                }
            } finally { realImagesLoading = false; }
        }
        function stripDecorationsForMarket(name) {
            return String(name || '').replace(/\s*\+\s*\d+x.*$/i, '').replace(/\s*#\d+.*?(?=\s*\(|$)/i, '').replace(/\s+Blue Gem(?=\s*\(|$)/i, '').replace(/\s+Pattern\s*\d+(?=\s*\(|$)/i, '').replace(/\s+Katowice\s*2014(?=\s*\(|$)/i, '').replace(/\s+Reason\s+Holo\s*2014(?=\s*\(|$)/i, '').replace(/\s+Titan\s+Holo\s*2014(?=\s*\(|$)/i, '').replace(/\s+IBUYPOWER\s+Holo\s*2014(?=\s*\(|$)/i, '').replace(/\s+Factory New(?=\s*\(|$)/i, '').replace(/\s+/g, ' ').trim();
        }
        function withWearIfNeeded(name, skin) {
            const wearMap = { FN: 'Factory New', MW: 'Minimal Wear', FT: 'Field-Tested', WW: 'Well-Worn', BS: 'Battle-Scarred' };
            const wear = wearMap[String(skin?.wear || '').toUpperCase()] || '';
            return wear && /\|/.test(name) && !/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i.test(name) ? `${name} (${wear})` : name;
        }
        function steamMarketNameForImage(skin) {
            let name = String(skin?.market_hash_name || skin?.name || '').trim();
            if (!name) return '';
            return withWearIfNeeded(stripDecorationsForMarket(name), skin);
        }
        function steamApisImageUrlForName(name) { return name ? `https://api.steamapis.com/image/item/730/${encodeURIComponent(name)}` : ''; }
        function steamApisImageUrl(skin) { return steamApisImageUrlForName(steamMarketNameForImage(skin)); }
        function getRealImageUrl(skin) {
            if (!skin) return '';
            if (skin.image) return String(skin.image);
            const keys = imageKeys(skin.name);
            for (const key of keys) {
                const url = realImages.get(key);
                if (url) return url;
            }
            const main = keys[0] || '';
            if (main && realImages.size) {
                const compact = main.replace(/\b(sapphire|ruby|black pearl|emerald|phase 1|phase 2|phase 3|phase 4)\b/g, '').replace(/\s+/g, ' ').trim();
                for (const [key, url] of realImages.entries()) {
                    if (compact && (compact.includes(key) || key.includes(compact))) return url;
                }
            }
            return steamApisImageUrl(skin);
        }
        return { loadRealImages, getRealImageUrl };
    }

    window.NM_ImageService = { create };
})();
