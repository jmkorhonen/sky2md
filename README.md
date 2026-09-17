# sky2md

Convert a Bluesky thread into Markdown you can copy or download. Think
[SkyWriter](https://skywriter.blue), but the output is Markdown instead of a web page.

Paste the link to any post in a thread; sky2md finds the beginning of the author's
self-reply chain, follows it to the end, and renders it as one document.

## Features

- Author's thread only, or the thread plus everyone's replies (nested blockquotes)
- Title, byline and optional YAML front matter (handy for Obsidian, Hugo, Jekyll, …)
- Posts joined as continuous text, separated by rules, or under numbered headings
- Optional timestamp + permalink under each post
- Removes `1/5`-style thread counters (only when the number matches the post's position)
- Images and video thumbnails: embed, link, alt text only, or omit
- Link cards, quoted posts, GIFs, feeds/lists/starter packs
- Restores full URLs where Bluesky shortened them; optional @mention and #hashtag links
- Optional permanent DID-based links that survive handle changes
- Escapes Markdown special characters in post text, keeps line breaks
- Live preview, copy to clipboard, download as `.md`; the output is editable
- Options are remembered in the browser; `?url=<post link>` converts on load (bookmarkable)

## Design: nothing to maintain

The whole tool is **one file, [`index.html`](index.html)** — no dependencies, no build step,
no server, no API key, no analytics. It talks directly from the browser to Bluesky's public
API (`public.api.bsky.app`), which allows cross-origin requests without authentication.

That means:

- **GitHub Pages:** push this repository, then *Settings → Pages → Deploy from a branch →
  `main` / root*. Done.
- **Anywhere else:** copy `index.html` to any static web host, under any name or path.
- **Offline copy:** save `index.html` to disk and open it; it works from `file://` too
  (internet access is still needed to fetch threads).

If Bluesky ever moves its public API, change the `API` constant at the top of the script.
Set `REPO_URL` there to show a "Source" link in the footer.

## Privacy and etiquette

Nothing is sent anywhere except the requests to Bluesky's public API, plus image loads from
Bluesky's CDN in the preview. Authors who have asked Bluesky to show their posts only to
logged-in users are respected: their threads are not converted, and their quoted posts and
replies are replaced by a note.

Image links in the Markdown point to Bluesky's CDN; they are not downloaded. Converting a
thread doesn't change who owns it — ask before republishing other people's writing.

## Limits

- Bluesky's API returns about ten levels of replies per request, so long threads take
  several requests (done automatically, up to ~1000 posts). In "everyone's replies" mode,
  very deep side conversations may be cut short for the same reason.
- If the author replied to themselves more than once at some point, sky2md follows the
  branch containing the linked post, otherwise the longest branch.
- The preview is a small built-in renderer covering what sky2md emits, not a full
  Markdown implementation. The Markdown itself is standard CommonMark.

## Development

There is nothing to install. The conversion core inside `index.html` is DOM-free and is
tested with Node's built-in test runner (Node 18+):

```bash
node --test
```

Try a real thread from the command line:

```bash
node tools/live.js https://bsky.app/profile/bsky.app/post/3mupeo3so622k '{"frontMatter":true}'
```

## License

MIT — see [LICENSE](LICENSE).
