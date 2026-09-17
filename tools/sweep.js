// Robustness sweep against live data:  node tools/sweep.js [handle …]
// Converts recent threads from each account under several option sets and reports
// crashes or suspicious output. Not part of `node --test` (needs network).
const { loadThread, buildMarkdown, mdToHtml } = require('../test/load.js');

const actors = process.argv.slice(2);
if (!actors.length) actors.push('bsky.app', 'pfrazee.com', 'nasa.gov', 'theonion.com', 'jay.bsky.team');

const OPTION_SETS = [
  {},
  { mode: 'conversation', separator: 'heading', postMeta: true, frontMatter: true, linkTags: true, didLinks: true },
  { images: 'link', cards: 'link', quotes: 'link', fullUrls: false, escape: false, hardBreaks: false, stripCounters: false },
  { images: 'alt', title: 'author', separator: 'rule', fromLinked: true, altText: false },
  { images: 'omit', cards: 'omit', quotes: 'omit', title: 'none', byline: false, linkMentions: false },
];
const SUSPICIOUS = /undefined|\[object |NaN|\bnull\b|\]\(\)|\(https?:\/\/[^)\s]*\s/;

async function feed(actor) {
  const url = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?' + new URLSearchParams({ actor, limit: 40, filter: 'posts_and_author_threads' });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`feed ${actor}: ${res.status}`);
  return (await res.json()).feed.filter(f => !f.reason).map(f => f.post);
}

(async () => {
  const seen = new Map();   // embed type → count, to show coverage
  let threads = 0, problems = 0;
  for (const actor of actors) {
    let posts;
    try { posts = await feed(actor); } catch (e) { console.log(`! ${e.message}`); continue; }
    // One post per distinct embed type (plus no embed), to keep request volume polite.
    const picked = new Map();
    for (const p of posts) {
      const media = p.embed && p.embed.media ? '+' + p.embed.media.$type.split('.').pop() : '';
      const key = (p.embed ? p.embed.$type.split('.').pop() : 'text') + media;
      if (!picked.has(key)) picked.set(key, p);
    }
    for (const [key, p] of picked) {
      seen.set(key, (seen.get(key) || 0) + 1);
      let data;
      try { data = await loadThread(p.uri); }
      catch (e) { console.log(`- ${p.uri}: ${e.message.slice(0, 80)}`); continue; }
      threads++;
      for (const opts of OPTION_SETS) {
        try {
          const md = buildMarkdown(data, opts);
          mdToHtml(md);
          const hit = SUSPICIOUS.exec(md);
          if (hit) { problems++; console.log(`? ${p.uri} ${JSON.stringify(opts).slice(0, 50)}… → ${JSON.stringify(md.slice(Math.max(0, hit.index - 60), hit.index + 40))}`); }
        } catch (e) {
          problems++;
          console.log(`✖ ${p.uri} ${JSON.stringify(opts)}\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`);
        }
      }
    }
  }
  console.log(`\n${threads} threads × ${OPTION_SETS.length} option sets, ${problems} problem(s). Embed coverage:`, Object.fromEntries(seen));
})();
