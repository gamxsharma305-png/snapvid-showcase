// SnapVid Showcase — Express backend serving the Vite-built React frontend + downloader API
// Run: npm install && npm run build && npm start   (needs Node.js 18+)
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  return null;
}

const unesc = (s) =>
  s.replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/\\"/g, '"');

async function resolveTikTok(url) {
  const api = 'https://www.tikwm.com/api/?url=' + encodeURIComponent(url);
  const r = await fetch(api, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('TikTok service did not respond. Try again in a moment.');
  const j = await r.json();
  if (j.code !== 0 || !j.data || !j.data.play) {
    throw new Error('Could not fetch this TikTok video. The link may be private, deleted, or invalid.');
  }
  const d = j.data;
  const downloads = [{ label: 'No Watermark (HD)', url: d.play }];
  if (d.wmplay) downloads.push({ label: 'With Watermark', url: d.wmplay });
  if (d.music) downloads.push({ label: 'Audio Only (MP3)', url: d.music });
  return {
    platform: 'tiktok',
    title: d.title || 'TikTok video',
    author: (d.author && (d.author.nickname || d.author.unique_id)) || '',
    thumbnail: d.cover || '',
    downloads,
  };
}

async function resolveInstagram(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/i);
  if (!m) throw new Error('Invalid Instagram URL. Use a public post or reel link.');
  const shortcode = m[1];
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const r = await fetch(embedUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!r.ok) throw new Error('Instagram blocked the request. Try again later.');
  const html = await r.text();
  const vid = html.match(/"video_url":"([^"]+)"/);
  if (!vid) {
    throw new Error('No downloadable video found. The post may be private, a photo, or require login.');
  }
  const thumb = html.match(/"thumbnail_url":"([^"]+)"/);
  const cap = html.match(/"text":"((?:[^"\\]|\\.){0,160})/);
  return {
    platform: 'instagram',
    title: cap ? unesc(cap[1]) : 'Instagram video',
    author: '',
    thumbnail: thumb ? unesc(thumb[1]) : '',
    downloads: [{ label: 'Video (MP4)', url: unesc(vid[1]) }],
  };
}

function proxify(info) {
  const name =
    encodeURIComponent((info.title || 'video').replace(/[^\w\- ]+/g, '').slice(0, 60) || 'video');
  info.downloads = info.downloads.map((d) => ({
    label: d.label,
    url: '/api/download?url=' + encodeURIComponent(d.url) + '&name=' + name,
  }));
  return info;
}

app.get('/api/resolve', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Video URL is required.' });
    }
    const platform = detectPlatform(url.trim());
    if (!platform) {
      return res.status(400).json({ error: 'Only Instagram and TikTok links are supported.' });
    }
    const info =
      platform === 'tiktok' ? await resolveTikTok(url.trim()) : await resolveInstagram(url.trim());
    res.json(proxify(info));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to resolve video.' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const { url, name } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url.' });
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
    });
    if (!r.ok || !r.body) return res.status(502).json({ error: 'Could not fetch the video file.' });
    const safe = ((name || 'video') + '').replace(/[^\w\- ]+/g, '').slice(0, 80) || 'video';
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.mp4"`);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: 'Download failed.' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the Vite-built frontend (npm run build -> dist/)
const DIST = path.join(__dirname, 'dist');
app.use(express.static(DIST));
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, () => console.log(`SnapVid Showcase running on http://localhost:${PORT}`));
