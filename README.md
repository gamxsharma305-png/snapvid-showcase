# SnapVid Showcase — Instagram & TikTok Video Downloader

Professional Instagram & TikTok public video downloader with a beautiful **ThreeUI** editorial showcase landing page.

## Features

- Download public Instagram Reels / Posts and TikTok videos in HD
- No login required, no watermark
- Clean paper/ink editorial UI matching the ThreeUI theme
- Responsive design
- Express backend with proxy download support

## What's inside

- `src/Scene.jsx` — ThreeUI `<BestsellersBookShowcase />` landing component
- `public/landing-pages/bestsellers-book-showcase.html` — Canonical ThreeUI page (do not edit)
- `src/App.jsx` + `src/downloader.css` — SnapVid downloader tool section
- `server.js` — Express backend serving the frontend + `/api/resolve` and `/api/download`

## Run locally (Node 18+)

```bash
npm install
npm run build     # builds the React frontend into dist/
npm start         # serves everything on http://localhost:3000
```

For frontend development with hot reload:

1. Terminal 1: `node server.js`
2. Terminal 2: `npm run dev` (Vite proxies `/api` to port 3000)

## Deploy (Render.com / free tier)

1. Push this folder to a GitHub repo
2. Render → New → Web Service → connect the repo
3. **Build command:** `npm install && npm run build`
4. **Start command:** `npm start`

## Notes

- The showcase iframe loads from `/landing-pages/...` — Vite copies `public/` into `dist/` automatically; Express serves `dist/`.
- TikTok resolving uses a free third-party API; Instagram uses the public embed page (can be rate-limited).
- Only download videos you own or have permission to save.
