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
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
  return null;
}

const unesc = (s) =>
  s
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>');

function extractShortcode(url) {
  const m = url.match(
    /(?:instagram\.com|instagr\.am)\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i
  );
  return m ? m[1] : null;
}

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

/**
 * Improved Instagram resolver — tries multiple sources:
 * 1. Embed page (video_url, contentUrl, etc.)
 * 2. Main post page Open Graph tags (og:video)
 * 3. Reel path specifically
 */
async function resolveInstagram(url) {
  const shortcode = extractShortcode(url);
  if (!shortcode) {
    throw new Error('Invalid Instagram URL. Use a public post or reel link (instagram.com/reel/... or /p/...).');
  }

  const headers = {
    'User-Agent': UA,
    'Accept-Language': 'en-US,en;q=0.9',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  };

  let videoUrl = null;
  let thumbnail = '';
  let title = 'Instagram video';
  let author = '';

  // ---------- Method 1: Embed page ----------
  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const r = await fetch(embedUrl, { headers });
    if (r.ok) {
      const html = await r.text();

      const patterns = [
        /"video_url"\s*:\s*"([^"]+)"/,
        /"contentUrl"\s*:\s*"([^"]+)"/,
        /"content_url"\s*:\s*"([^"]+)"/,
        /property="og:video"\s+content="([^"]+)"/,
        /property="og:video:secure_url"\s+content="([^"]+)"/,
        /"playback_url"\s*:\s*"([^"]+)"/,
      ];

      for (const re of patterns) {
        const m = html.match(re);
        if (m && m[1] && (m[1].includes('cdninstagram') || m[1].includes('fbcdn') || m[1].startsWith('http'))) {
          videoUrl = unesc(m[1]);
          break;
        }
      }

      const thumbMatch =
        html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/) ||
        html.match(/property="og:image"\s+content="([^"]+)"/);
      if (thumbMatch) thumbnail = unesc(thumbMatch[1]);

      const capMatch = html.match(/"text"\s*:\s*"((?:[^"\\]|\\.){0,200})"/);
      if (capMatch) title = unesc(capMatch[1]).slice(0, 120) || title;

      const authorMatch = html.match(/"username"\s*:\s*"([^"]+)"/);
      if (authorMatch) author = authorMatch[1];
    }
  } catch (e) {
    // continue to next method
  }

  // ---------- Method 2: Main post page (Open Graph) ----------
  if (!videoUrl) {
    try {
      const postUrl = `https://www.instagram.com/p/${shortcode}/`;
      const r = await fetch(postUrl, {
        headers: {
          ...headers,
          Referer: 'https://www.instagram.com/',
        },
        redirect: 'follow',
      });
      if (r.ok) {
        const html = await r.text();

        const ogVideo =
          html.match(/property="og:video"\s+content="([^"]+)"/i) ||
          html.match(/property="og:video:secure_url"\s+content="([^"]+)"/i) ||
          html.match(/name="twitter:player:stream"\s+content="([^"]+)"/i);

        if (ogVideo && ogVideo[1]) {
          videoUrl = unesc(ogVideo[1]);
        }

        if (!videoUrl) {
          const jsonPatterns = [
            /"video_url"\s*:\s*"([^"]+)"/,
            /"contentUrl"\s*:\s*"([^"]+)"/,
            /"playback_url"\s*:\s*"([^"]+)"/,
          ];
          for (const re of jsonPatterns) {
            const m = html.match(re);
            if (m && m[1]) {
              videoUrl = unesc(m[1]);
              break;
            }
          }
        }

        if (!thumbnail) {
          const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/i);
          if (ogImg) thumbnail = unesc(ogImg[1]);
        }

        if (title === 'Instagram video') {
          const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i);
          if (ogTitle) title = unesc(ogTitle[1]).slice(0, 120);
        }
      }
    } catch (e) {
      // continue
    }
  }

  // ---------- Method 3: Try /reel/ path specifically ----------
  if (!videoUrl) {
    try {
      const reelUrl = `https://www.instagram.com/reel/${shortcode}/`;
      const r = await fetch(reelUrl, { headers });
      if (r.ok) {
        const html = await r.text();
        const ogVideo =
          html.match(/property="og:video"\s+content="([^"]+)"/i) ||
          html.match(/property="og:video:secure_url"\s+content="([^"]+)"/i);
        if (ogVideo && ogVideo[1]) {
          videoUrl = unesc(ogVideo[1]);
        }
        if (!thumbnail) {
          const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/i);
          if (ogImg) thumbnail = unesc(ogImg[1]);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!videoUrl) {
    throw new Error(
      'No downloadable video found. Possible reasons:\n' +
        '• The post is a photo (not a video)\n' +
        '• The account is private\n' +
        '• Instagram is blocking the request (try again later)\n' +
        '• The link is invalid or deleted'
    );
  }

  title = title.replace(/\s+/g, ' ').trim() || 'Instagram video';

  return {
    platform: 'instagram',
    title,
    author,
    thumbnail,
    downloads: [{ label: 'Video (MP4)', url: videoUrl }],
  };
}

function proxify(info) {
  const name = encodeURIComponent(
    (info.title || 'video').replace(/[^\w\- ]+/g, '').slice(0, 60) || 'video'
  );
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
      return res.status(400).json({
        error: 'Only Instagram and TikTok links are supported.',
      });
    }
    const info =
      platform === 'tiktok'
        ? await resolveTikTok(url.trim())
        : await resolveInstagram(url.trim());
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
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.instagram.com/',
      },
    });
    if (!r.ok || !r.body) {
      return res.status(502).json({ error: 'Could not fetch the video file.' });
    }
    const safe =
      ((name || 'video') + '').replace(/[^\w\- ]+/g, '').slice(0, 80) || 'video';
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

app.listen(PORT, () =>
  console.log(`SnapVid Showcase running on http://localhost:${PORT}`)
);
