// Offline tests for the conversion core.  Run:  node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseInput, buildMarkdown, richText, stripCounter, escMd, escLineStarts, mdToHtml, convertEmoji, DEFAULTS } = require('./load.js');

const enc = new TextEncoder();
const VIEW = 'app.bsky.feed.defs#threadViewPost';
const alice = { did: 'did:plc:alice', handle: 'alice.test', displayName: 'Alice' };
const bob = { did: 'did:plc:bob', handle: 'bob.test', displayName: 'Bob [B]' };

/** Builds a facet by locating `needle` in `text` (byte offsets, as the API does). */
function facet(text, needle, feature) {
  const at = text.indexOf(needle);
  const byteStart = enc.encode(text.slice(0, at)).length;
  return { index: { byteStart, byteEnd: byteStart + enc.encode(needle).length }, features: [feature] };
}
let n = 0;
function node(author, text, extra = {}) {
  n++;
  return {
    $type: VIEW, replies: extra.replies || [],
    post: {
      uri: `at://${author.did}/app.bsky.feed.post/k${n}`, author,
      record: { text, createdAt: `2026-01-02T03:0${n % 10}:00.000Z`, facets: extra.facets },
      embed: extra.embed, replyCount: (extra.replies || []).length,
    },
  };
}
function thread(...nodes) {           // links nodes into a self-reply chain, keeping any side replies
  nodes.forEach((x, i) => { if (nodes[i + 1]) x.replies = [...x.replies, nodes[i + 1]]; });
  return { author: nodes[0].post.author, chain: nodes, linkedIndex: 0 };
}

test('parseInput accepts URLs, at:// URIs and other frontends', () => {
  assert.deepEqual(parseInput('https://bsky.app/profile/alice.test/post/abc123?x=1'), { actor: 'alice.test', rkey: 'abc123' });
  assert.deepEqual(parseInput(' at://did:plc:alice/app.bsky.feed.post/abc123 '), { actor: 'did:plc:alice', rkey: 'abc123' });
  assert.deepEqual(parseInput('https://deer.social/profile/did:plc:alice/post/abc'), { actor: 'did:plc:alice', rkey: 'abc' });
  assert.equal(parseInput('https://example.com/'), null);
});

test('richText maps byte-offset facets correctly around multibyte text', () => {
  const text = 'Héllo 🌍 see example.com/a... and @bob.test #tag';
  const facets = [
    facet(text, 'example.com/a...', { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/a/very/long_path(1)' }),
    facet(text, '@bob.test', { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:bob' }),
    facet(text, '#tag', { $type: 'app.bsky.richtext.facet#tag', tag: 'tag' }),
  ];
  assert.equal(richText(text, facets, { ...DEFAULTS, linkTags: true }),
    'Héllo 🌍 see <https://example.com/a/very/long_path%281%29> and [@bob.test](https://bsky.app/profile/bob.test) [#tag](https://bsky.app/hashtag/tag)');
  assert.equal(richText(text, facets, { ...DEFAULTS, fullUrls: false, linkMentions: false, didLinks: true }),
    'Héllo 🌍 see [example.com/a...](https://example.com/a/very/long_path%281%29) and @bob.test #tag');
});

test('richText can drop the @ and # signs, linked or not', () => {
  const text = 'Hi @bob.test #Obsidian #1 and C#';
  const facets = [
    facet(text, '@bob.test', { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:bob' }),
    facet(text, '#Obsidian', { $type: 'app.bsky.richtext.facet#tag', tag: 'Obsidian' }),
  ];
  const strip = { ...DEFAULTS, stripAt: true, stripHash: true };
  assert.equal(richText(text, facets, { ...strip, linkMentions: false }), 'Hi bob.test Obsidian #1 and C#');
  assert.equal(richText(text, facets, { ...strip, linkTags: true }),
    'Hi [bob.test](https://bsky.app/profile/bob.test) [Obsidian](https://bsky.app/hashtag/Obsidian) #1 and C#');
  assert.equal(richText(text, facets, DEFAULTS), 'Hi [@bob.test](https://bsky.app/profile/bob.test) #Obsidian #1 and C#');
  const md = buildMarkdown(thread(node(alice, 'x')), { stripAt: true, frontMatter: true });
  assert.ok(!md.includes('@') && md.includes('handle: "alice.test"') && md.includes('(alice.test)'));
});

test('emoji: remove tidies spacing, shortcodes cover sequences, text symbols survive', () => {
  assert.equal(convertEmoji('👋 Hello 👋 world 🎉', 'strip'), 'Hello world');
  assert.equal(convertEmoji('✨Special✨  \n> 🌈 quoted\n\n🎉🎉\n\n# ✨ Title', 'strip'), 'Special  \n> quoted\n\n# Title');
  assert.equal(convertEmoji('👍🏽 ❤️ 🇫🇮 1️⃣ 👨‍👩‍👧 🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'shortcode'), ':thumbsup: :heart: :finland: :one: :family_man_woman_girl: :scotland:');
  assert.equal(convertEmoji('"Party 🎉" and [x 🌈] ok 👍, fine 🙂.', 'strip'), '"Party" and [x] ok, fine.');
  assert.equal(convertEmoji('© 2026 ™ ☺ 5€ #1', 'strip'), '© 2026 ™ ☺ 5€ #1');
  assert.equal(convertEmoji('keep 😀', 'keep'), 'keep 😀');
});

test('emoji option applies to titles, names and text but never inside URLs', () => {
  const party = { did: 'did:plc:party', handle: 'party.test', displayName: 'Party 🎉' };
  const text = '🎉 Launch day see 👍.ws';
  const data = thread(node(party, text, { facets: [facet(text, '👍.ws', { $type: 'app.bsky.richtext.facet#link', uri: 'https://👍.ws/' })] }));
  const md = buildMarkdown(data, { emoji: 'strip', frontMatter: true });
  assert.ok(md.includes('title: "Launch day see.ws"') && md.includes('author: "Party"'));
  assert.ok(md.includes('# Launch day see.ws') && md.includes('By [Party](https://bsky.app/profile/party.test)'));
  assert.ok(md.includes('[.ws](https://%F0%9F%91%8D.ws/)'));
  assert.ok(buildMarkdown(data, { emoji: 'shortcode' }).includes('# :tada: Launch day see :thumbsup:.ws'));
});

test('heading level sets the title and the numbered post headings below it', () => {
  const data = thread(node(alice, 'One'), node(alice, 'Two'));
  const md = buildMarkdown(data, { headingLevel: '3', separator: 'heading', byline: false });
  assert.match(md, /^### One\n\n#### 1\n\nOne\n\n#### 2\n\nTwo\n$/);
  assert.match(buildMarkdown(data, { headingLevel: '2', separator: 'heading', title: 'none', byline: false }), /^## 1\n/);
  assert.match(buildMarkdown(data, {}), /^# One\n/);
});

test('richText ignores malformed facets and non-http links', () => {
  const text = 'click here';
  const bad = [
    { index: { byteStart: 6, byteEnd: 99 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://x.test' }] },
    facet(text, 'click', { $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' }),
  ];
  assert.equal(richText(text, bad, DEFAULTS), 'click here');
});

test('escaping neutralises Markdown but leaves snake_case alone', () => {
  assert.equal(escMd('*bold* _it_ snake_case [x] <b> `c` ~~s~~ &amp;'), '\\*bold\\* \\_it\\_ snake_case \\[x\\] \\<b\\> \\`c\\` \\~\\~s\\~\\~ \\&amp;');
  assert.equal(escLineStarts('# h\n#tag\n- item\n1. one\n---\n2026 was'), '\\# h\n#tag\n\\- item\n1\\. one\n\\---\n2026 was');
});

test('stripCounter only removes counters matching the post position', () => {
  assert.equal(stripCounter('Intro 🧵 1/5', [], 1).text, 'Intro');
  assert.equal(stripCounter('2/ Next point', [], 2).text, 'Next point');
  assert.equal(stripCounter('(3/12) Third', [], 3).text, 'Third');
  assert.equal(stripCounter('Open 24/7', [], 3).text, 'Open 24/7');
  assert.equal(stripCounter('Remember 9/11', [], 2).text, 'Remember 9/11');
  const text = '2/ see example.com';
  const out = stripCounter(text, [facet(text, 'example.com', { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' })], 2);
  assert.equal(richText(out.text, out.facets, DEFAULTS), 'see [example.com](https://example.com)');
});

test('buildMarkdown: default thread output', () => {
  const data = thread(node(alice, 'First post\nsecond line 1/2'), node(alice, 'Second *post* 2/2'));
  assert.equal(buildMarkdown(data, {}), [
    '# First post', '',
    'By [Alice](https://bsky.app/profile/alice.test) (@alice.test) · 2026-01-02 · [Original thread on Bluesky](' + 'https://bsky.app/profile/alice.test/post/' + data.chain[0].post.uri.split('/').pop() + ')', '',
    'First post  ', 'second line', '',
    'Second \\*post\\*', '',
  ].join('\n'));
});

test('buildMarkdown: embeds, quotes, front matter and options', () => {
  const images = { $type: 'app.bsky.embed.images#view', images: [{ fullsize: 'https://cdn.test/a.jpg', alt: 'A [cat]\non a mat' }] };
  const quoted = {
    $type: 'app.bsky.embed.record#view',
    record: { $type: 'app.bsky.embed.record#viewRecord', uri: 'at://did:plc:bob/app.bsky.feed.post/q1', author: bob,
              value: { text: 'Quoted words', createdAt: '2025-12-31T00:00:00Z' }, embeds: [] },
  };
  const card = { $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/x', title: 'A Title', description: 'Desc' } };
  const data = thread(node(alice, 'Look', { embed: images }), node(alice, 'Quote', { embed: quoted }), node(alice, '', { embed: card }));
  const md = buildMarkdown(data, { frontMatter: true, separator: 'rule' });
  assert.match(md, /^---\ntitle: "Look"\nauthor: "Alice"\nhandle: "@alice.test"\ndate: 2026-01-02\nsource: "https:.*"\nposts: 3\n---\n/);
  assert.ok(md.includes('![A \\[cat\\] on a mat](https://cdn.test/a.jpg)'));
  assert.ok(md.includes('> **Bob \\[B\\]** ([@bob.test](https://bsky.app/profile/bob.test)) · [2025-12-31](https://bsky.app/profile/bob.test/post/q1):\n>\n> Quoted words'));
  assert.ok(md.includes('> **[A Title](https://example.com/x)**  \n> Desc'));
  assert.equal(md.split('\n---\n').length, 4);   // front matter close + 2 rules between 3 posts

  const bare = buildMarkdown(data, { images: 'omit', quotes: 'omit', cards: 'omit', title: 'none', byline: false });
  assert.equal(bare, 'Look\n\nQuote\n');
  assert.ok(buildMarkdown(data, { didLinks: true }).includes('https://bsky.app/profile/did:plc:alice/post/'));
});

test('galleries and unknown future media lists render as images', () => {
  const gallery = { $type: 'app.bsky.embed.gallery#view', items: [
    { $type: 'app.bsky.embed.gallery#viewImage', fullsize: 'https://cdn.test/1.jpg', thumbnail: 'https://cdn.test/1t.jpg', alt: 'one' },
    { $type: 'app.bsky.embed.gallery#viewVideo', thumbnail: 'https://cdn.test/v.jpg' },
    { $type: 'app.bsky.embed.gallery#somethingElse' },
  ] };
  const md = buildMarkdown(thread(node(alice, 'Pics', { embed: gallery })), { title: 'none', byline: false });
  const rkey = md.match(/post\/(k\d+)/)[1];
  assert.equal(md, `Pics\n\n![one](https://cdn.test/1.jpg)\n[![Video](https://cdn.test/v.jpg)](https://bsky.app/profile/alice.test/post/${rkey})\n`);
  const future = { $type: 'app.bsky.embed.somethingNew#view', images: [{ fullsize: 'https://cdn.test/n.jpg', alt: '' }] };
  assert.ok(buildMarkdown(thread(node(alice, 'New', { embed: future })), {}).includes('![](https://cdn.test/n.jpg)'));
  const unknown = { $type: 'app.bsky.embed.mystery#view', payload: 42 };
  assert.equal(buildMarkdown(thread(node(alice, 'Hm', { embed: unknown })), { title: 'none', byline: false }), 'Hm\n');
});

test('buildMarkdown: conversation mode nests replies, fromLinked slices', () => {
  const reply = node(bob, 'Nice thread!', { replies: [node(alice, 'Thanks')] });
  const data = thread(node(alice, 'One', { replies: [reply] }), node(alice, 'Two'));
  const md = buildMarkdown(data, { mode: 'conversation', title: 'none', byline: false });
  assert.match(md, /^One\n\n> \*\*Bob \\\[B\\\]\*\* .*:\n>\n> Nice thread!\n>\n> > \*\*Alice\*\* .*:\n> >\n> > Thanks\n\nTwo\n$/);
  assert.ok(!buildMarkdown(data, {}).includes('Nice thread'));
  data.linkedIndex = 1;
  assert.equal(buildMarkdown(data, { fromLinked: true, title: 'none', byline: false }), 'Two\n');
});

test('login-only authors are not reproduced in quotes or replies', () => {
  const shy = { did: 'did:plc:shy', handle: 'shy.test', labels: [{ val: '!no-unauthenticated' }] };
  const data = thread(node(alice, 'One', { replies: [node(shy, 'private words')] }));
  assert.ok(!buildMarkdown(data, { mode: 'conversation' }).includes('private words'));
});

test('preview renderer escapes HTML and refuses non-http URLs', () => {
  const html = mdToHtml('# T\n\n<script>alert(1)</script> [x](javascript:alert(1)) ![a"b](https://ok.test/i.png)\n\n> **q** *e*  \n> line\n\n---\n');
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('<img loading="lazy" alt="a&quot;b" src="https://ok.test/i.png">'));
  assert.ok(html.includes('<blockquote><p><strong>q</strong> <em>e</em><br>\nline</p>\n</blockquote>'));
  assert.ok(html.includes('<h1>T</h1>') && html.includes('<hr>'));
});
