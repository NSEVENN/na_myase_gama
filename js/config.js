(function () {
    'use strict';

    window.NM_CONFIG = Object.freeze({
        USERS_KEY: 'na_myase_users_v2',
        SESSION_KEY: 'na_myase_session_v2',
        LEGACY_USER_KEYS: ['na_myase_users', 'na_myase_users_v1', 'na_myase_users_v2'],
        LEGACY_SESSION_KEYS: ['na_myase_session', 'na_myase_session_v1', 'na_myase_session_v2'],
        LIVE_HISTORY_KEY: 'na_myase_live_history_v1',
        MAX_LIVE_ITEMS: 20,
        PROMO_CODES: {
            nsevenn: { amount: 500, once: true },
            stage: { amount: 500, once: true },
            jumbo: { amount: 500, once: true },
            mozamba: { amount: 500, once: true },
            'папик': { amount: 1000, once: false }
        }
    });
})();
