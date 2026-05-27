const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'skins.js');
const code = fs.readFileSync(file, 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const skins = sandbox.window.LARGE_SKINS_DATABASE || sandbox.LARGE_SKINS_DATABASE || [];

const ids = new Set();
const errors = [];
skins.forEach((skin, index) => {
    if (!skin.id) errors.push(`#${index}: empty id`);
    if (ids.has(skin.id)) errors.push(`#${index}: duplicate id ${skin.id}`);
    ids.add(skin.id);
    if (!skin.name) errors.push(`${skin.id}: empty name`);
    if (!Number.isFinite(Number(skin.price)) || Number(skin.price) <= 0) errors.push(`${skin.id}: invalid price`);
});

if (errors.length) {
    console.error(`Found ${errors.length} data problem(s):`);
    errors.forEach(err => console.error(`- ${err}`));
    process.exit(1);
}
console.log(`OK: ${skins.length} skins, all ids/prices/names look valid.`);
