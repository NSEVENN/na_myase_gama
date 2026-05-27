(function () {
    'use strict';

    const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };

    function $(id) { return document.getElementById(id); }
    function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }
    function norm(value) { return String(value || '').trim().toLowerCase(); }
    function money(value) { return Number(value || 0).toFixed(2); }
    function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => escapeMap[ch]); }
    function clearEl(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    function createEl(tag, options = {}) {
        const el = document.createElement(tag);
        if (options.className) el.className = options.className;
        if (options.text !== undefined) el.textContent = options.text ?? '';
        if (options.attrs) Object.entries(options.attrs).forEach(([key, val]) => el.setAttribute(key, val));
        return el;
    }

    window.NM_UTILS = { $, $$, norm, money, esc, clearEl, createEl };
})();
