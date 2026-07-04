# wciv — wikimedia commons improvement viewer

A tiny SPA for comparing Wikimedia images side by side:

- **Page image mode** — paste a Wikipedia article URL: the tool walks the
  article's revision history to find the most recent time the lead image was
  swapped for a different file, and shows that before/after. Pasting a Commons
  file URL compares the file's two latest uploaded versions instead.
- **Two files mode** — paste two Wikimedia Commons file URLs or names and
  compare them directly.

Features:

- Side-by-side view (default) with a draggable slider view toggle
- Upload dates and per-image credits (creator + license, linked) under each image
- Shareable permalinks — all state lives in the URL hash
- One-click PNG export of the comparison with attribution baked in

## Development

```sh
npm install
npm run dev     # dev server on http://localhost:5173
npm run build   # type-check + production build to dist/
```

Built with Vite + React + TypeScript. All data comes client-side from the
MediaWiki API (`prop=pageimages` and `prop=imageinfo` with `extmetadata`),
so there's no backend — the built `dist/` folder is a static site.

## Deployment

Pushes to `main` auto-deploy to GitHub Pages
(<https://tomzorz.github.io/wciv/>) via `.github/workflows/deploy.yml`.
One-time setup: in the repo's **Settings → Pages**, set *Source* to
**GitHub Actions**. If the site ever moves to a custom domain, update
`base` in `vite.config.ts` and the canonical/OG URLs in `index.html`.
