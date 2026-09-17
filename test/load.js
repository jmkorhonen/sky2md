// Loads the conversion core out of index.html so it can run in Node (no DOM needed).
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const mod = { exports: {} };
new Function('module', src)(mod);
module.exports = mod.exports;
