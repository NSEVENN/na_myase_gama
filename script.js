(function () {
    'use strict';

    const USERS_KEY = 'na_myase_users_v2';
    const SESSION_KEY = 'na_myase_session_v2';
    const LEGACY_USER_KEYS = ['na_myase_users', 'na_myase_users_v1', 'na_myase_users_v2'];
    const LEGACY_SESSION_KEYS = ['na_myase_session', 'na_myase_session_v1', 'na_myase_session_v2'];
    const PROMO_CODES = {
        nsevenn: { amount: 500, once: true },
        stage: { amount: 500, once: true },
        'папик': { amount: 1000, once: false }
    };

    let skins = [];
    let currentLogin = '';
    let balance = 0;
    let inventory = [];
    let selectedSource = null;
    let selectedTarget = null;
    let started = false;
    let isUpgrading = false;

    const $ = (id) => document.getElementById(id);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const norm = (v) => String(v || '').trim().toLowerCase();
    const money = (n) => Number(n || 0).toFixed(2);
    const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));


    const REAL_IMAGE_ENDPOINTS = [
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/skins_not_grouped.json'
    ];
    const REAL_IMAGE_CACHE_KEY = 'na_myase_real_skin_images_weapons_v4';
    const REAL_IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const realImages = new Map();
    let realImagesLoading = false;
    let realImagesLoaded = false;

    function normalizeImageName(name) {
        return String(name || '')
            .replace(/[’`´]/g, "'")
            .replace(/^★\s*/, '')
            .replace(/^StatTrak™\s*/i, '')
            .replace(/^Souvenir\s*/i, '')
            .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function imageKeys(name) {
        const raw = String(name || '').trim();
        const keys = new Set([normalizeImageName(raw)]);
        keys.add(normalizeImageName(raw.replace(/^Sticker\s*\|\s*/i, '')));
        keys.add(normalizeImageName(raw.replace(/^Sealed Graffiti\s*\|\s*/i, 'Graffiti | ')));
        keys.add(normalizeImageName(raw.replace(/^Collectible Pin\s*\|\s*/i, 'Pin | ')));
        keys.add(normalizeImageName(raw.replace(/^Souvenir Package\s*\|\s*/i, '')));
        return Array.from(keys).filter(Boolean);
    }

    function rememberRealImage(name, image) {
        if (!name || !image) return;
        imageKeys(name).forEach(key => {
            if (!realImages.has(key)) realImages.set(key, image);
        });
    }

    function walkImageApi(value) {
        if (!value) return;
        if (Array.isArray(value)) {
            value.forEach(walkImageApi);
            return;
        }
        if (typeof value !== 'object') return;
        const image = value.image || value.image_url || value.icon_url;
        const names = [value.name, value.market_hash_name, value.item_name, value.weapon?.name && value.pattern?.name ? `${value.weapon.name} | ${value.pattern.name}` : ''];
        names.forEach(name => rememberRealImage(name, image));
        Object.values(value).forEach(child => {
            if (child && typeof child === 'object') walkImageApi(child);
        });
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
        let changed = loadCachedRealImages();
        if (changed) renderAll();
        try {
            const seen = new Set();
            for (const url of REAL_IMAGE_ENDPOINTS) {
                const fileName = url.split('/').pop();
                if (seen.has(fileName)) continue;
                seen.add(fileName);
                try {
                    const res = await fetch(url, { cache: 'force-cache' });
                    if (!res.ok) continue;
                    walkImageApi(await res.json());
                } catch (_) {}
            }
            realImagesLoaded = realImages.size > 0;
            if (realImagesLoaded) {
                localStorage.setItem(REAL_IMAGE_CACHE_KEY, JSON.stringify({ time: Date.now(), rows: Array.from(realImages.entries()) }));
                renderAll();
            }
        } finally {
            realImagesLoading = false;
        }
    }

    function getRealImageUrl(skin) {
        if (!skin) return '';
        // 1) локальный ассет из skins.js — главный источник
        if (skin.image) return String(skin.image);
        // 2) fallback: настоящая Steam/CS2 картинка из ByMykel CSGO-API, если локальный ассет еще не скачан
        for (const key of imageKeys(skin.name)) {
            const url = realImages.get(key);
            if (url) return url;
        }
        return '';
    }

    function getUsers() {
        const out = {};
        LEGACY_USER_KEYS.forEach(key => {
            try {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                if (data && typeof data === 'object') Object.assign(out, data);
            } catch (_) {}
        });
        return out;
    }

    function saveUsers(users) {
        localStorage.setItem(USERS_KEY, JSON.stringify(users || {}));
    }

    function getSession() {
        for (const key of LEGACY_SESSION_KEYS) {
            const v = norm(localStorage.getItem(key));
            if (v) return v;
        }
        return '';
    }

    function saveSession(login) {
        LEGACY_SESSION_KEYS.forEach(key => localStorage.setItem(key, login));
    }

    function clearSession() {
        LEGACY_SESSION_KEYS.forEach(key => localStorage.removeItem(key));
    }

    function authStatus(text, ok) {
        const el = $('auth-status');
        if (!el) return;
        el.textContent = text || '';
        el.style.color = ok ? 'var(--color-green)' : 'var(--color-red)';
    }

    function showAuth(tab = 'login') {
        document.body.classList.add('auth-locked');
        document.body.classList.remove('auth-ready');
        const overlay = $('auth-overlay');
        if (overlay) overlay.classList.add('active');
        switchAuthTab(tab);
    }

    function hideAuth() {
        document.body.classList.remove('auth-locked');
        document.body.classList.add('auth-ready');
        const overlay = $('auth-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function switchAuthTab(tab) {
        $$('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === tab));
        $$('.auth-form').forEach(form => form.classList.toggle('active', form.id === `${tab}-form`));
        authStatus('', true);
    }

    function loadAccount(login) {
        const users = getUsers();
        const account = users[login];
        if (!account) return false;
        currentLogin = login;
        balance = Number(account.balance || 0);
        inventory = Array.isArray(account.inventory) ? account.inventory.filter(isWeaponSkin) : [];
        saveSession(login);
        const chip = $('user-chip');
        if (chip) chip.textContent = login;
        hideAuth();
        startApp();
        return true;
    }

    function saveAccount() {
        if (!currentLogin) return;
        const users = getUsers();
        users[currentLogin] = users[currentLogin] || { password: '' };
        users[currentLogin].balance = balance;
        users[currentLogin].inventory = inventory;
        users[currentLogin].usedPromos = users[currentLogin].usedPromos || {};
        saveUsers(users);
    }

    function login(e) {
        if (e) e.preventDefault();
        const name = norm($('login-username')?.value);
        const pass = $('login-password')?.value || '';
        const users = getUsers();
        if (!name || !pass) return authStatus('Введите логин и пароль', false);
        if (!users[name] || users[name].password !== pass) return authStatus('Данные неверные', false);
        authStatus('Вход выполнен', true);
        loadAccount(name);
    }

    function register(e) {
        if (e) e.preventDefault();
        const name = norm($('register-username')?.value);
        const pass = $('register-password')?.value || '';
        const pass2 = $('register-password-repeat')?.value || '';
        const users = getUsers();
        if (!name || !pass || !pass2) return authStatus('Заполните все поля', false);
        if (name.length < 3) return authStatus('Логин должен быть минимум 3 символа', false);
        if (pass.length < 3) return authStatus('Пароль должен быть минимум 3 символа', false);
        if (pass !== pass2) return authStatus('Пароли не совпадают', false);
        if (users[name]) return authStatus('Такой логин уже существует', false);
        users[name] = { password: pass, balance: 0, inventory: [], usedPromos: {}, createdAt: Date.now() };
        saveUsers(users);
        authStatus('Аккаунт создан', true);
        loadAccount(name);
    }

    function logout() {
        saveAccount();
        clearSession();
        currentLogin = '';
        balance = 0;
        inventory = [];
        selectedSource = null;
        selectedTarget = null;
        showAuth('login');
    }


    function isWeaponSkin(item) {
        const text = norm(`${item?.type || ''} ${item?.name || ''} ${item?.category || ''} ${item?.rarity || ''}`);
        const blocked = ['sticker', 'graffiti', 'case', 'capsule', 'music', 'agent', 'patch', 'pin', 'souvenir package', 'key', 'collectible'];
        if (blocked.some(x => text.includes(x))) return false;
        const weaponWords = ['ak-47','m4a4','m4a1-s','awp','usp-s','glock','desert eagle','deagle','p250','p90','mp9','mac-10','famas','galil','ssg 08','aug','sg 553','tec-9','five-seven','cz75','dual berettas','mp7','mp5','ump-45','pp-bizon','nova','xm1014','mag-7','sawed-off','negev','m249','scar-20','g3sg1','knife','bayonet','karambit','butterfly','gloves'];
        return weaponWords.some(w => text.includes(w));
    }



    // === BEST CS2 DATABASE LOADER ===
    // Источник ассетов/названий: ByMykel CSGO-API skins_not_grouped.json.
    // Если рядом есть data/skins.json, проект сначала берет его: туда можно положить уже собранную базу 2000+ с актуальными ценами.
    const BEST_SKINS_CACHE_KEY = 'na_myase_best_skins_db_v1';
    const BEST_SKINS_CACHE_TTL = 12 * 60 * 60 * 1000;
    const BEST_SKIN_DATA_ENDPOINTS = [
        './data/skins.json',
        'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json',
        'https://cdn.jsdelivr.net/gh/ByMykel/CSGO-API@main/public/api/en/skins_not_grouped.json'
    ];
    const WEAR_VARIANTS = [
        { name: 'Factory New', short: 'FN', min: 0, max: 0.07, mult: 1.75 },
        { name: 'Minimal Wear', short: 'MW', min: 0.07, max: 0.15, mult: 1.22 },
        { name: 'Field-Tested', short: 'FT', min: 0.15, max: 0.38, mult: 1.00 },
        { name: 'Well-Worn', short: 'WW', min: 0.38, max: 0.45, mult: 0.82 },
        { name: 'Battle-Scarred', short: 'BS', min: 0.45, max: 1, mult: 0.68 }
    ];
    const RARITY_BASE_PRICE = {
        consumer: 0.35,
        industrial: 0.85,
        milspec: 2.4,
        restricted: 8.5,
        classified: 26,
        covert: 78,
        contraband: 650,
        knife: 190,
        gloves: 155
    };

    function slugifySkinId(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/★/g, 'star')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 96) || `skin_${Math.random().toString(36).slice(2)}`;
    }

    function normalizeRarity(value, name = '') {
        const text = norm(`${value || ''} ${name || ''}`).replace(/[-_\s]/g, '');
        if (text.includes('contraband')) return 'contraband';
        if (text.includes('covert') || text.includes('extraordinary')) return norm(name).includes('glove') ? 'gloves' : (norm(name).includes('knife') || name.includes('★') ? 'knife' : 'covert');
        if (text.includes('classified')) return 'classified';
        if (text.includes('restricted')) return 'restricted';
        if (text.includes('milspec') || text.includes('mil-spec')) return 'milspec';
        if (text.includes('industrial')) return 'industrial';
        if (text.includes('consumer')) return 'consumer';
        if (norm(name).includes('glove')) return 'gloves';
        if (name.includes('★') || norm(name).includes('knife') || norm(name).includes('bayonet') || norm(name).includes('karambit')) return 'knife';
        return 'milspec';
    }

    function inferSkinType(item, name = '') {
        return String(item?.weapon?.name || item?.category?.name || item?.type || item?.weapon || String(name).split('|')[0] || 'Skin').trim();
    }

    function getApiImage(item) {
        return item?.image || item?.image_url || item?.image_url_steam || item?.icon_url || item?.texture || '';
    }

    function isWearAllowed(item, wear) {
        const min = Number(item?.min_float ?? item?.wear_min ?? item?.paintkits?.[0]?.wear_min ?? 0);
        const max = Number(item?.max_float ?? item?.wear_max ?? item?.paintkits?.[0]?.wear_max ?? 1);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return true;
        return wear.max >= min && wear.min <= max;
    }

    function estimatedMarketPrice(name, rarity, type, wearShort) {
        const h = hashText(`${name}|${rarity}|${type}|${wearShort}`);
        let base = RARITY_BASE_PRICE[rarity] || 2.2;
        if (rarity === 'knife' || String(name).includes('★')) base *= 1.2 + (h % 240) / 100;
        if (rarity === 'gloves') base *= 1.1 + (h % 220) / 100;
        if (/dragon lore|gungnir|wild lotus|howl|medusa|dlore/i.test(name)) base *= 18;
        if (/doppler|fade|marble fade|gamma doppler|slaughter/i.test(name)) base *= 2.2;
        const wear = WEAR_VARIANTS.find(w => w.short === wearShort) || WEAR_VARIANTS[2];
        const spread = 0.72 + ((h >>> 8) % 90) / 100;
        return Math.max(0.03, Number((base * wear.mult * spread).toFixed(2)));
    }

    function expandApiSkin(item, index) {
        const baseName = String(item?.name || item?.market_hash_name || '').trim();
        if (!baseName || !isWeaponSkin({ name: baseName, type: inferSkinType(item, baseName), rarity: item?.rarity?.name || item?.rarity })) return [];
        const image = getApiImage(item);
        const type = inferSkinType(item, baseName);
        const rarity = normalizeRarity(item?.rarity?.name || item?.rarity || item?.rarity_color, baseName);
        const alreadyHasWear = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i.test(baseName);
        const variants = alreadyHasWear ? [WEAR_VARIANTS.find(w => baseName.includes(w.name)) || WEAR_VARIANTS[2]] : WEAR_VARIANTS.filter(w => isWearAllowed(item, w));
        return variants.map(wear => {
            const marketName = alreadyHasWear ? baseName : `${baseName} (${wear.name})`;
            const p = Number(item?.price || item?.steam_price || item?.avg_price || 0);
            return {
                id: slugifySkinId(marketName),
                name: marketName,
                market_hash_name: marketName,
                price: p > 0 ? Number(p.toFixed(2)) : estimatedMarketPrice(marketName, rarity, type, wear.short),
                priceSource: p > 0 ? 'api' : 'estimate',
                type,
                wear: wear.short,
                rarity,
                category: item?.category?.name || item?.category || '',
                image,
                sourceIndex: index
            };
        });
    }

    function normalizeExternalSkinRows(payload) {
        const source = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        const seen = new Set();
        const rows = [];
        source.forEach((item, index) => {
            const converted = item?.market_hash_name && item?.price && item?.image
                ? [{
                    id: slugifySkinId(item.market_hash_name),
                    name: String(item.market_hash_name),
                    market_hash_name: String(item.market_hash_name),
                    price: Number(item.price) > 1000 ? Number(item.price) / 100 : Number(item.price),
                    priceSource: item.priceSource || 'external',
                    type: inferSkinType(item, item.market_hash_name),
                    wear: (String(item.market_hash_name).match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i)?.[1] || 'ITEM').replace('Factory New','FN').replace('Minimal Wear','MW').replace('Field-Tested','FT').replace('Well-Worn','WW').replace('Battle-Scarred','BS'),
                    rarity: normalizeRarity(item.rarity, item.market_hash_name),
                    category: item.category || '',
                    image: item.image || item.image_url || item.image_url_steam || ''
                }]
                : expandApiSkin(item, index);
            converted.forEach(row => {
                if (!row?.name || !isWeaponSkin(row)) return;
                const key = normalizeImageName(row.name);
                if (seen.has(key)) return;
                seen.add(key);
                rows.push(row);
                if (row.image) rememberRealImage(row.name, row.image);
            });
        });
        return rows.sort((a, b) => a.price - b.price);
    }

    function applyBestSkinRows(rows) {
        if (!Array.isArray(rows) || rows.length < 2000) return false;
        skins = rows.map((item, index) => ({
            id: String(item.id || slugifySkinId(item.name || `skin_${index}`)),
            name: String(item.name || item.market_hash_name || 'Unknown skin'),
            market_hash_name: String(item.market_hash_name || item.name || ''),
            price: Math.max(0.01, Number(item.price || 1)),
            priceSource: item.priceSource || 'api',
            type: String(item.type || String(item.name || 'Skin').split('|')[0]).trim(),
            wear: item.wear || item.category || 'ITEM',
            rarity: normalizeRarity(item.rarity, item.name),
            category: item.category || '',
            image: item.image || item.image_url || item.image_url_steam || ''
        })).filter(item => item.name && Number.isFinite(item.price) && isWeaponSkin(item));
        window.LARGE_SKINS_DATABASE = skins;
        return skins.length >= 2000;
    }

    function tryLoadBestSkinsCache() {
        try {
            const cached = JSON.parse(localStorage.getItem(BEST_SKINS_CACHE_KEY) || 'null');
            if (!cached || Date.now() - cached.time > BEST_SKINS_CACHE_TTL || !Array.isArray(cached.rows)) return false;
            if (applyBestSkinRows(cached.rows)) {
                renderAll();
                return true;
            }
        } catch (_) {}
        return false;
    }

    async function loadBestSkinsDatabase() {
        tryLoadBestSkinsCache();
        for (const url of BEST_SKIN_DATA_ENDPOINTS) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) continue;
                const payload = await res.json();
                const rows = normalizeExternalSkinRows(payload);
                if (applyBestSkinRows(rows)) {
                    try { localStorage.setItem(BEST_SKINS_CACHE_KEY, JSON.stringify({ time: Date.now(), rows: skins.slice(0, 6500) })); } catch (_) {}
                    renderAll();
                    loadRealImages();
                    return true;
                }
            } catch (_) {}
        }
        return false;
    }

    function prepareSkins() {
        // Важно для GitHub Pages: top-level `const LARGE_SKINS_DATABASE` из skins.js
        // НЕ становится window.LARGE_SKINS_DATABASE. Поэтому читаем оба варианта.
        let raw = [];
        if (Array.isArray(window.LARGE_SKINS_DATABASE)) {
            raw = window.LARGE_SKINS_DATABASE;
        } else {
            try {
                if (typeof LARGE_SKINS_DATABASE !== 'undefined' && Array.isArray(LARGE_SKINS_DATABASE)) {
                    raw = LARGE_SKINS_DATABASE;
                    window.LARGE_SKINS_DATABASE = raw;
                }
            } catch (e) {}
        }

        // Жёсткий аварийный fallback, чтобы поле никогда не было пустым.
        if (!raw.length) {
            raw = [
                { id: 'fallback_ak_47_redline_ft', name: 'AK-47 | Redline (Field-Tested)', price: 18.50, type: 'AK-47', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_awp_asiimov_bs', name: 'AWP | Asiimov (Battle-Scarred)', price: 95.00, type: 'AWP', wear: 'BS', rarity: 'covert' },
                { id: 'fallback_m4a1_s_decimator_ft', name: 'M4A1-S | Decimator (Field-Tested)', price: 14.20, type: 'M4A1-S', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_glock_18_water_elemental_ft', name: 'Glock-18 | Water Elemental (Field-Tested)', price: 7.10, type: 'Glock-18', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_usp_s_cortex_ft', name: 'USP-S | Cortex (Field-Tested)', price: 6.20, type: 'USP-S', wear: 'FT', rarity: 'restricted' },
                { id: 'fallback_desert_eagle_printstream_ft', name: 'Desert Eagle | Printstream (Field-Tested)', price: 72.00, type: 'Desert Eagle', wear: 'FT', rarity: 'covert' }
            ];
            window.LARGE_SKINS_DATABASE = raw;
        }

        skins = raw.map((item, index) => ({
            id: String(item.id || slugifySkinId(item.name || `skin_${index}`)),
            name: String(item.name || item.market_hash_name || 'Unknown skin'),
            market_hash_name: String(item.market_hash_name || item.name || ''),
            price: Math.max(0.01, Number(item.price || 1)),
            priceSource: item.priceSource || item.source || 'local',
            type: String(item.type || String(item.name || 'Skin').split('|')[0]).trim(),
            wear: item.wear || item.category || 'ITEM',
            rarity: normalizeRarity(item.rarity || 'consumer', item.name),
            category: item.category || '',
            image: item.image || item.image_url || item.image_url_steam || ''
        })).filter(item => item.name && Number.isFinite(item.price) && isWeaponSkin(item));

        // Чтобы на GitHub Pages всегда были именно оружейные CS2-скины, а не стикеры/кейсы.
        if (!skins.length) {
            skins = [
                { id: 'fallback_ak_47_redline_ft', name: 'AK-47 | Redline (Field-Tested)', price: 18.50, type: 'AK-47', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_awp_asiimov_bs', name: 'AWP | Asiimov (Battle-Scarred)', price: 95.00, type: 'AWP', wear: 'BS', rarity: 'covert' },
                { id: 'fallback_m4a1_s_decimator_ft', name: 'M4A1-S | Decimator (Field-Tested)', price: 14.20, type: 'M4A1-S', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_glock_18_water_elemental_ft', name: 'Glock-18 | Water Elemental (Field-Tested)', price: 7.10, type: 'Glock-18', wear: 'FT', rarity: 'classified' },
                { id: 'fallback_usp_s_cortex_ft', name: 'USP-S | Cortex (Field-Tested)', price: 6.20, type: 'USP-S', wear: 'FT', rarity: 'restricted' },
                { id: 'fallback_desert_eagle_printstream_ft', name: 'Desert Eagle | Printstream (Field-Tested)', price: 72.00, type: 'Desert Eagle', wear: 'FT', rarity: 'covert' }
            ];
        }

        // Убираем возможные пустые фильтры/старые значения, которые скрывали все скины.
        ['left-search-input','left-min-price','left-max-price','search-input','min-price','max-price'].forEach(id => {
            const el = $(id);
            if (el) el.value = '';
        });
    }

    function skinColor(skin) {
        const colors = {
            consumer: '#8b96a8',
            industrial: '#5e98d9',
            milspec: '#4b69ff',
            restricted: '#8847ff',
            classified: '#d32ce6',
            covert: '#eb4b4b',
            contraband: '#e4ae39',
            knife: '#ffd700',
            gloves: '#ffd700',
            case: '#d6a647',
            sticker: '#80d8ff',
            music: '#ff7ad9',
            agent: '#8fd14f'
        };
        return colors[skin?.rarity] || '#5e98d9';
    }

    function hashText(text) {
        let h = 2166136261;
        for (const ch of String(text || '')) {
            h ^= ch.charCodeAt(0);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function svgSafe(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function skinPalette(skin) {
        const h = hashText((skin?.name || '') + (skin?.rarity || ''));
        const hue1 = h % 360;
        const hue2 = (hue1 + 62 + (h % 47)) % 360;
        const hue3 = (hue1 + 180) % 360;
        return {
            a: `hsl(${hue1} 88% 62%)`,
            b: `hsl(${hue2} 90% 48%)`,
            c: `hsl(${hue3} 80% 65%)`,
            rarity: skinColor(skin)
        };
    }

    function weaponSilhouette(type, skin) {
        const t = norm(type + ' ' + (skin?.name || ''));
        const pal = skinPalette(skin);
        const pattern = `<defs>
            <linearGradient id="paint" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stop-color="${pal.a}"/>
                <stop offset=".52" stop-color="#eef6ff"/>
                <stop offset="1" stop-color="${pal.b}"/>
            </linearGradient>
            <pattern id="stripes" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
                <rect width="22" height="22" fill="url(#paint)"/>
                <rect x="0" y="0" width="8" height="22" fill="${pal.c}" opacity=".32"/>
            </pattern>
        </defs>`;
        if (t.includes('sticker') || t.includes('capsule') && !t.includes('case')) {
            const initials = svgSafe(String(skin?.name || 'ST').replace(/\|/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || 'ST');
            return `${pattern}<circle cx="150" cy="88" r="56" fill="url(#paint)" opacity=".98"/><circle cx="150" cy="88" r="43" fill="#101522" opacity=".78"/><path d="M106 94 C128 62 176 62 198 94 C177 84 128 84 106 94Z" fill="#fff" opacity=".22"/><text x="150" y="103" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" fill="#fff">${initials}</text>`;
        }
        if (t.includes('graffiti')) {
            const word = svgSafe((String(skin?.name || 'GRAFFITI').split('|').pop() || 'GG').replace(/\(.+?\)/g,'').trim().slice(0,8).toUpperCase());
            return `${pattern}<path d="M45 104 C73 51 132 49 157 78 C189 47 241 58 260 107 C216 96 86 96 45 104Z" fill="url(#stripes)"/><text x="150" y="112" text-anchor="middle" font-family="Arial Black,Arial" font-size="24" fill="#fff" stroke="#111827" stroke-width="5" paint-order="stroke">${word}</text>`;
        }
        if (t.includes('case') || t.includes('capsule')) {
            return `${pattern}<rect x="70" y="45" width="160" height="98" rx="16" fill="url(#stripes)"/><rect x="100" y="32" width="100" height="28" rx="10" fill="#e8f2ff" opacity=".82"/><rect x="91" y="76" width="118" height="14" rx="7" fill="#0b0c10" opacity=".28"/><circle cx="150" cy="113" r="18" fill="#fff" opacity=".65"/>`;
        }
        if (t.includes('awp') || t.includes('ssg') || t.includes('scar') || t.includes('g3sg1')) {
            return `${pattern}<path d="M20 91 L202 61 L272 70 L270 85 L215 87 L187 104 L123 104 L96 119 L58 115 L82 98 L20 99 Z" fill="url(#stripes)"/><rect x="201" y="51" width="42" height="8" rx="3" fill="#e8f2ff" opacity=".88"/><circle cx="124" cy="85" r="11" fill="#111827" opacity=".35"/>`;
        }
        if (t.includes('ak') || t.includes('m4') || t.includes('galil') || t.includes('famas')) {
            return `${pattern}<path d="M23 97 C70 70 126 66 181 77 L230 55 L267 74 L221 96 L269 107 L261 124 L184 106 C135 120 75 119 23 105 Z" fill="url(#stripes)"/><path d="M74 112 L119 136 L147 126 L107 104 Z" fill="#e8f2ff" opacity=".72"/><rect x="159" y="72" width="45" height="10" rx="5" fill="#111827" opacity=".28"/>`;
        }
        if (t.includes('knife') || t.includes('★')) {
            return `${pattern}<path d="M55 111 L197 55 C234 40 259 48 273 62 C247 73 221 87 191 106 L81 137 Z" fill="url(#stripes)"/><path d="M45 112 L93 135 L79 151 L31 124 Z" fill="#e8f2ff" opacity=".8"/>`;
        }
        if (t.includes('glock') || t.includes('usp') || t.includes('p250') || t.includes('deagle') || t.includes('desert')) {
            return `${pattern}<path d="M57 92 C91 73 149 72 211 89 L255 86 L268 103 L225 116 C159 125 103 123 57 109 Z" fill="url(#stripes)"/><path d="M100 109 L124 142 L151 134 L128 105 Z" fill="#e8f2ff" opacity=".76"/><rect x="193" y="88" width="54" height="9" rx="4" fill="#111827" opacity=".23"/>`;
        }
        return `${pattern}<path d="M55 103 C96 78 153 75 220 93 L253 88 L267 105 L228 117 C162 126 104 124 55 111 Z" fill="url(#stripes)"/><path d="M91 110 L121 134 L149 127 L119 105 Z" fill="#e8f2ff" opacity=".76"/>`;
    }

    function renderThumb(skin) {
        const realUrl = getRealImageUrl(skin);
        if (realUrl) {
            return `<div class="skin-real-wrap"><img class="skin-real-img" src="${esc(realUrl)}" alt="${esc(skin.name)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='none';"><div class="skin-loading-img" style="display:none"></div></div>`;
        }
        return `<div class="skin-loading-img" aria-hidden="true"></div>`;
    }

    function rarityLabel(skin) {
        const map = { consumer:'Consumer', industrial:'Industrial', milspec:'Mil-Spec', restricted:'Restricted', classified:'Classified', covert:'Covert', contraband:'Contraband', knife:'Knife', gloves:'Gloves' };
        return map[skin.rarity] || 'Skin';
    }

    function getFilters(prefix) {
        const search = norm($(prefix + 'search-input')?.value);
        const sort = $(prefix + 'sort-select')?.value || 'low-to-high';
        const minVal = $(prefix + 'min-price')?.value;
        const maxVal = $(prefix + 'max-price')?.value;
        const min = minVal === '' || minVal == null ? 0 : Number(minVal);
        const max = maxVal === '' || maxVal == null ? Infinity : Number(maxVal);
        return { search, sort, min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : Infinity };
    }

    function filterSkins(prefix) {
        const f = getFilters(prefix);
        const result = skins.filter(s => norm(s.name).includes(f.search) && s.price >= f.min && s.price <= f.max);
        result.sort((a, b) => f.sort === 'high-to-low' ? b.price - a.price : a.price - b.price);
        return result;
    }

    function card(skin, action, selected) {
        return `<div class="skin-item-card ${selected ? 'selected' : ''}" data-id="${esc(skin.id)}" data-action="${action}">
            <div class="thumb-holder">${renderThumb(skin)}<span class="wear-tag">${esc(skin.wear)}</span><span class="rarity-tag ${esc(skin.rarity)}">${esc(rarityLabel(skin))}</span></div>
            <p title="${esc(skin.name)}">${esc(skin.name)}</p>
            <span class="price-tag">${money(skin.price)}$</span>
        </div>`;
    }

    function renderShop() {
        const grid = $('shop-grid');
        if (!grid) return;
        const items = filterSkins('left-');
        grid.innerHTML = items.length ? items.map(s => card(s, 'buy', false)).join('') : '<p class="empty-notice">Скины не найдены</p>';
    }

    function renderTargets() {
        const grid = $('target-shop-grid');
        if (!grid) return;
        const items = filterSkins('');
        grid.innerHTML = items.length ? items.map(s => card(s, 'target', selectedTarget && selectedTarget.id === s.id)).join('') : '<p class="empty-notice">Скины не найдены</p>';
    }

    function renderInventory() {
        const grid = $('inventory-grid');
        const empty = $('inv-empty');
        const count = $('inv-count');
        if (count) count.textContent = inventory.length;
        if (!grid) return;
        if (empty) empty.style.display = inventory.length ? 'none' : 'block';
        grid.innerHTML = inventory.map((s, i) => card({ ...s, invIndex: i }, 'source', selectedSource && selectedSource.invIndex === i)).join('');
    }

    function updateBalance() {
        const el = $('balance');
        if (el) el.textContent = money(balance);
    }

    function preview(elId, skin, title) {
        const el = $(elId);
        if (!el) return;
        if (!skin) {
            el.innerHTML = `<div class="slot-title">${esc(title)}</div><div class="slot-placeholder"><div class="chevron-arrow"></div></div>`;
            return;
        }
        el.innerHTML = `<div class="slot-title">${esc(title)}</div><div class="slot-preview-thumb">${renderThumb(skin)}</div><div class="slot-item-info"><h4 title="${esc(skin.name)}">${esc(skin.name)}</h4><div class="price">${money(skin.price)}$</div></div>`;
    }

    function calcChance() {
        const chanceEl = $('chance-percent');
        const btn = $('upgrade-btn');
        const status = $('status-text');
        let chance = 0;
        if (selectedSource && selectedTarget && selectedTarget.price > 0) {
            chance = Math.min(95, Math.max(0.1, (selectedSource.price / selectedTarget.price) * 100));
        }
        if (chanceEl) chanceEl.textContent = `${chance.toFixed(2)}%`;
        if (btn) btn.disabled = !(selectedSource && selectedTarget);
        if (status) status.textContent = selectedSource && selectedTarget ? 'Готово к апгрейду' : 'Выберите свой скин и целевой скин';
        const wheel = $('wheel-track');
        if (wheel) wheel.style.background = `conic-gradient(var(--color-gold) 0deg ${chance * 3.6}deg, #202636 ${chance * 3.6}deg 360deg)`;
        return chance;
    }

    function buySkin(id) {
        const skin = skins.find(s => s.id === id);
        if (!skin) return;
        if (balance < skin.price) return alert('Недостаточно баланса. Нажмите + и активируйте промокод nsevenn или stage.');
        balance -= skin.price;
        inventory.push({ ...skin, boughtAt: Date.now() });
        saveAccount();
        renderAll();
    }

    function selectSource(index) {
        const skin = inventory[index];
        if (!skin) return;
        selectedSource = { ...skin, invIndex: index };
        preview('source-preview', selectedSource, 'Выбранный скин');
        renderInventory();
        calcChance();
    }

    function selectTarget(id) {
        const skin = skins.find(s => s.id === id);
        if (!skin) return;
        selectedTarget = { ...skin };
        preview('target-preview', selectedTarget, 'Цель апгрейда');
        renderTargets();
        calcChance();
    }

    function animatePointerSpin(finalWin, duration = 6000) {
        const pointer = $('wheel-pointer');
        const track = $('wheel-track');
        if (!pointer) return Promise.resolve();

        const finalAngle = finalWin
            ? 2160 + 18 + Math.random() * 64
            : 2160 + 126 + Math.random() * 170;
        const start = performance.now();

        pointer.classList.add('spin-now');
        if (track) track.classList.add('spin-now');
        pointer.style.setProperty('transition', 'none', 'important');
        pointer.style.setProperty('animation', 'none', 'important');
        pointer.style.setProperty('transform', 'rotate(0deg)', 'important');

        return new Promise(resolve => {
            function easeOutCubic(t) {
                return 1 - Math.pow(1 - t, 3);
            }
            function frame(now) {
                const t = Math.min(1, (now - start) / duration);
                const eased = easeOutCubic(t);
                const wobble = t < 0.92 ? Math.sin(t * Math.PI * 18) * (1 - t) * 5 : 0;
                const angle = finalAngle * eased + wobble;
                pointer.style.setProperty('transform', `rotate(${angle}deg)`, 'important');
                if (t < 1) requestAnimationFrame(frame);
                else {
                    pointer.style.setProperty('transform', `rotate(${finalAngle}deg)`, 'important');
                    resolve();
                }
            }
            requestAnimationFrame(frame);
        }).finally(() => {
            pointer.classList.remove('spin-now');
            if (track) track.classList.remove('spin-now');
        });
    }

    async function upgrade() {
        if (isUpgrading) return;
        if (!selectedSource || !selectedTarget) {
            const status = $('status-text');
            if (status) status.textContent = 'Сначала выберите свой скин и цель справа';
            return;
        }

        isUpgrading = true;
        const btn = $('upgrade-btn');
        const status = $('status-text');
        const chance = calcChance();
        const win = Math.random() * 100 <= chance;

        if (btn) btn.disabled = true;
        if (status) status.textContent = 'Апгрейд запущен... стрелка крутится';

        await animatePointerSpin(win, 6000);

        const removeIndex = selectedSource.invIndex;
        const sourceName = selectedSource.name;
        const targetName = selectedTarget.name;

        if (Number.isInteger(removeIndex) && inventory[removeIndex]) {
            inventory.splice(removeIndex, 1);
        } else {
            const found = inventory.findIndex(x => x.id === selectedSource.id && x.boughtAt === selectedSource.boughtAt);
            if (found >= 0) inventory.splice(found, 1);
        }

        if (win) inventory.push({ ...selectedTarget, wonAt: Date.now() });

        selectedSource = null;
        selectedTarget = null;
        preview('source-preview', null, 'Выберите скины для использования');
        preview('target-preview', null, 'Выберите скин для апгрейда');
        saveAccount();
        renderAll();

        if (status) status.textContent = win ? `Успех! Получен ${targetName}` : `Неудача. ${sourceName} сгорел.`;
        isUpgrading = false;
        calcChance();
    }

    function openDeposit() {
        const modal = $('deposit-modal');
        const status = $('modal-status');
        if (status) status.textContent = '';
        if (modal) modal.classList.add('active');
    }

    function closeDeposit() {
        const modal = $('deposit-modal');
        if (modal) modal.classList.remove('active');
    }

    function activatePromo() {
        const input = $('promo-input');
        const status = $('modal-status');
        const code = norm(input?.value);
        const cfg = PROMO_CODES[code];
        if (!cfg) {
            if (status) { status.textContent = 'Промокод не найден'; status.style.color = 'var(--color-red)'; }
            return;
        }
        const users = getUsers();
        const account = users[currentLogin] || {};
        account.usedPromos = account.usedPromos || {};
        if (cfg.once && account.usedPromos[code]) {
            if (status) { status.textContent = 'Этот промокод уже активирован'; status.style.color = 'var(--color-red)'; }
            return;
        }
        balance += cfg.amount;
        if (cfg.once) account.usedPromos[code] = true;
        users[currentLogin] = { ...account, balance, inventory };
        saveUsers(users);
        updateBalance();
        if (input) input.value = '';
        if (status) { status.textContent = `Успешно +${cfg.amount}$`; status.style.color = 'var(--color-green)'; }
    }

    function setTab(tab) {
        const leftPanel = $('inventory-tab')?.closest('.grid-panel');
        if (!leftPanel) return;
        leftPanel.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
        ['inventory', 'shop'].forEach(name => {
            const el = $(`${name}-tab`);
            if (el) el.classList.toggle('active', name === tab);
        });
        if (tab === 'shop') renderShop();
        if (tab === 'inventory') renderInventory();
    }

    function quickPick(btn) {
        if (!selectedSource) return alert('Сначала выберите скин из инвентаря слева.');
        $$('.mult-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.type;
        const val = Number(btn.dataset.val);
        let targetPrice = selectedSource.price * 2;
        if (type === 'mult') targetPrice = selectedSource.price * val;
        if (type === 'pct') targetPrice = selectedSource.price * 100 / val;
        const candidate = skins.filter(s => s.price >= targetPrice).sort((a, b) => Math.abs(a.price - targetPrice) - Math.abs(b.price - targetPrice))[0];
        if (candidate) selectTarget(candidate.id);
    }

    function bindEvents() {
        $('auth-login-tab')?.addEventListener('click', () => switchAuthTab('login'));
        $('auth-register-tab')?.addEventListener('click', () => switchAuthTab('register'));
        $('login-form')?.addEventListener('submit', login);
        $('register-form')?.addEventListener('submit', register);
        $('auth-login-btn')?.addEventListener('click', login);
        $('auth-register-btn')?.addEventListener('click', register);
        $('logout-btn')?.addEventListener('click', logout);

        $('open-deposit-btn')?.addEventListener('click', openDeposit);
        $('close-deposit-btn')?.addEventListener('click', closeDeposit);
        $('deposit-modal')?.addEventListener('click', e => { if (e.target === $('deposit-modal')) closeDeposit(); });
        $('activate-promo-btn')?.addEventListener('click', activatePromo);
        $('promo-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') activatePromo(); });
        $('upgrade-btn')?.addEventListener('click', upgrade);

        $$('.nav-tab-btn').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
        ['left-search-input','left-sort-select','left-min-price','left-max-price'].forEach(id => $(id)?.addEventListener('input', renderShop));
        ['search-input','sort-select','min-price','max-price'].forEach(id => $(id)?.addEventListener('input', renderTargets));
        $$('.mult-btn').forEach(btn => btn.addEventListener('click', () => quickPick(btn)));

        document.addEventListener('click', e => {
            const cardEl = e.target.closest('.skin-item-card[data-action]');
            if (!cardEl) return;
            const action = cardEl.dataset.action;
            const id = cardEl.dataset.id;
            if (action === 'buy') buySkin(id);
            if (action === 'target') selectTarget(id);
            if (action === 'source') selectSource(Number($$('.skin-item-card[data-action="source"]').indexOf(cardEl)));
        });
    }

    function renderAll() {
        updateBalance();
        renderInventory();
        renderShop();
        renderTargets();
        calcChance();
    }

    function startApp() {
        if (!skins.length) prepareSkins();
        if (!skins.length) {
            const msg = '<p class="empty-notice">База skins.js не загрузилась. Проверьте, что файл skins.js лежит рядом с index.html.</p>';
            if ($('shop-grid')) $('shop-grid').innerHTML = msg;
            if ($('target-shop-grid')) $('target-shop-grid').innerHTML = msg;
            return;
        }
        if (!started) started = true;
        renderAll();
        loadBestSkinsDatabase();
        loadRealImages();
        setTab('inventory');
    }

    function init() {
        prepareSkins();
        loadBestSkinsDatabase();
        bindEvents();
        const session = getSession();
        const users = getUsers();
        if (session && users[session]) loadAccount(session);
        else showAuth('login');
        window.NM_DEBUG = { startApp, renderAll, loadRealImages, loadBestSkinsDatabase, get skins() { return skins; }, get state() { return { currentLogin, balance, inventory, selectedSource, selectedTarget }; } };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
