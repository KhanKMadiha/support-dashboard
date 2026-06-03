# Support ticket analyser

Paste a support ticket, match internal documentation, draft a response, and generate a KB article. Public demo runs in the browser; live mode adds Claude and Notion via a Cloudflare Worker.

**[Live demo](https://khankmadiha.github.io/support-dashboard/)** · **[Case study](https://madihaintech.me/support-dashboard.html)** · **[Source](https://github.com/KhanKMadiha/support-dashboard)**

The long-form case study page source is in [`portfolio-support-dashboard.html`](portfolio-support-dashboard.html) (for portfolio sites; the interactive app is `index.html`).

## How it works

| Step | What happens |
|------|----------------|
| 1 | Paste the ticket |
| 2 | Match against a KB catalogue (domain-keyword ratio, stopword filtering, word-boundary matching) |
| 3 | Draft or edit the support response |
| 4 | **Documentation gap only** — generate a KB draft; publish to Notion in live mode |

**Strong match** — ≥80% of an article’s domain keywords appear in the ticket. Reuse the matched article in your response; Step 4 is skipped.  
**Documentation gap** — below 80%; related articles shown at 30–79% as interim context and product signal; Step 4 captures new knowledge.

## Demo vs live mode

On GitHub Pages the app defaults to **portfolio demo mode**:

| Step | Behaviour |
|------|-----------|
| 1–3 | Real — matching, gap detection, related articles, response drafting (browser only) |
| 4 | Gap tickets only — simulated KB draft; publish UI only (no Claude or Notion calls) |

| URL | Mode |
|-----|------|
| Default on `*.github.io` | Demo |
| `?live=1` | Full stack (configure worker URLs in `js/app.js`) |
| `?demo=1` | Force demo |
| `localhost` | Live by default |

**Do not paste real customer PII** into the public demo.

## Live mode (short)

1. Set `CONFIG.proxyUrl` and `CONFIG.notionPublishUrl` in `js/app.js`.
2. Deploy the Worker in `worker/` with `ANTHROPIC_API_KEY` and `NOTION_API_KEY` (see `worker/wrangler.toml.example`).
3. Replace the sample catalogue in `js/documentation.js` with your organisation’s articles (`keywords`, `resolutionSteps`, `issueTopic`).

## Architecture

Static app on GitHub Pages. In live mode, a Cloudflare Worker proxies Anthropic (KB generation) and Notion (publish). API keys stay off the client.

## Privacy

- Never commit API keys or `.env` files.
- Use a sandbox Notion database for demos.
- Rate-limit the worker if you expose `?live=1` publicly.

## Licence

MIT
