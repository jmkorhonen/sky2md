// Manual check against the live API:  node tools/live.js <post-url> ['{"mode":"conversation"}']
const { loadThread, buildMarkdown } = require('../test/load.js');
const [url, opts] = process.argv.slice(2);
loadThread(url, m => console.error(m)).then(data => {
  console.error(`${data.chain.length} posts, linked index ${data.linkedIndex}`);
  process.stdout.write(buildMarkdown(data, opts ? JSON.parse(opts) : {}));
}).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
