# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-07-02 | self | `npm create vite .` cancels itself in non-empty dir (LICENSE/.git present) | Write project files manually or scaffold in temp dir |

## User Preferences
- Do NOT commit until user explicitly approves — they want to iterate first
- Prefers side-by-side layout as default (slider is a toggle), credits under each image, upload dates shown
- Greenfield repo (wciv): before/after image compare SPA, TS+React ok'd by user
- Wants shareable results (permalink or rendered image), CC-BY attribution bonus

## Patterns That Work
- MediaWiki APIs used client-side with `origin=*` for CORS

## Patterns That Don't Work
-

## Domain Notes
- Repo was empty except LICENSE at start
- Commons imageinfo: iiprop=url|extmetadata, iilimit=2 gives current+previous upload
- Wikipedia pageimages: prop=pageimages&piprop=name gives main image file title
- Article lead-image change detection: rvprop=content + rvslots=main + rvsection=0 (lead only, small payloads), regex-extract first File:/image= param, walk back until it differs from current pageimage
- Canvas browser instances die between turns; re-open with a NEW instanceId (old ones stay "owned")
