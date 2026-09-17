// Regenerates the embedded emoji shortcode table in index.html:  node tools/emoji-data.js [version]
// Source: GitHub-style shortcodes from emojibase-data (MIT, https://emojibase.dev).
// Only needed when Unicode adds emoji you want converted; unknown emoji are otherwise kept as is.
const fs = require('node:fs');
const path = require('node:path');

const version = process.argv[2] || '17.0.0';
const file = path.join(__dirname, '..', 'index.html');
const BEGIN = '// BEGIN GENERATED EMOJI_SHORTCODES', END = '// END GENERATED EMOJI_SHORTCODES';

(async () => {
  const url = `https://cdn.jsdelivr.net/npm/emojibase-data@${version}/en/shortcodes/github.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const data = await res.json();

  // Keys as index.html looks them up: lowercase hex code points, no U+FE0F, joined by "-".
  const pairs = new Map();
  for (const [hexcode, codes] of Object.entries(data)) {
    const key = hexcode.split('-').map(h => parseInt(h, 16)).filter(cp => cp !== 0xFE0F).map(cp => cp.toString(16)).join('-');
    const list = [].concat(codes);
    const name = list.find(c => /^[a-z]/i.test(c)) || list[0];      // prefer "thumbsup" over "+1"
    if (!pairs.has(key) && /^[\w+-]+$/.test(name)) pairs.set(key, name);
  }

  const lines = [];
  let line = '';
  for (const [k, v] of pairs) {
    const item = `${k}:${v}`;
    if (line && line.length + item.length > 110) { lines.push(line); line = ''; }
    line += (line ? ' ' : '') + item;
  }
  lines.push(line);

  const block = `${BEGIN}\n// emojibase-data@${version} en/shortcodes/github.json (MIT) — ${pairs.size} emoji\n`
    + `const EMOJI_SHORTCODES = \`\n${lines.join('\n')}\n\`;\n${END}`;
  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf(BEGIN), end = html.indexOf(END);
  if (start < 0 || end < 0) throw new Error('generated-block markers not found in index.html');
  fs.writeFileSync(file, html.slice(0, start) + block + html.slice(end + END.length));
  console.log(`Wrote ${pairs.size} shortcodes (${lines.join('').length} bytes) from emojibase-data@${version}.`);
})().catch(e => { console.error(e.message); process.exit(1); });
