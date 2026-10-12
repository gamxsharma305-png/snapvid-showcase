import { useState } from "react";
import { Scene } from "./Scene.jsx";

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  return null;
}

function Downloader() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  const platform = detectPlatform(url);

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setUrl(t.trim());
    } catch {
      /* clipboard unavailable */
    }
  }

  async function fetchVideo() {
    if (!url.trim()) {
      setError("Please paste a video link first.");
      return;
    }
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const r = await fetch("/api/resolve?url=" + encodeURIComponent(url.trim()));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to fetch video.");
      setInfo(j);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="sv-tool" id="downloader">
      <div className="sv-inner">
        <p className="sv-kicker">SnapVid Tool</p>
        <h2 className="sv-h2">Download Instagram &amp; TikTok Videos</h2>
        <p className="sv-sub">
          Paste a public video link below — get an HD download in seconds.
          No login. No watermark.
        </p>

        <div className="sv-box">
          <div className="sv-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchVideo()}
              placeholder="Paste video link here…  (instagram.com/reel/…  or  tiktok.com/…)"
              spellCheck={false}
              aria-label="Video URL"
            />
            <button
              className="sv-paste"
              onClick={paste}
              title="Paste from clipboard"
              type="button"
              aria-label="Paste from clipboard"
            >
              📋
            </button>
          </div>
          <div className="sv-hint">
            {platform === "tiktok" && (
              <>
                Detected: <b className="tk">TikTok</b> ✅
              </>
            )}
            {platform === "instagram" && (
              <>
                Detected: <b className="ig">Instagram</b> ✅
              </>
            )}
            {!platform && (
              <>Supported: Instagram Reels / Posts &nbsp;•&nbsp; TikTok Videos</>
            )}
          </div>
          <button
            className="sv-fetch"
            onClick={fetchVideo}
            disabled={loading}
            type="button"
          >
            {loading ? "Fetching…" : "⬇ Fetch Video"}
          </button>
        </div>

        {error && <div className="sv-err">⚠️ {error}</div>}

        {info && (
          <div className="sv-card">
            {info.thumbnail && (
              <img
                className="sv-thumb"
                src={info.thumbnail}
                alt="Video thumbnail"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="sv-meta">
              <span className={`sv-badge ${info.platform}`}>
                {info.platform === "tiktok" ? "TikTok" : "Instagram"}
              </span>
              <div className="sv-title">{info.title}</div>
              {info.author && <div className="sv-author">@{info.author}</div>}
              <div className="sv-btns">
                {info.downloads.map((d, i) => (
                  <a
                    key={i}
                    className={`sv-dl${i === 0 ? "" : " alt"}`}
                    href={d.url}
                    download
                  >
                    {d.label} ⬇
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="sv-steps">
          <div className="sv-step">
            <span>1</span>
            <p>
              <b>Copy link</b> — Share → Copy link on any public video.
            </p>
          </div>
          <div className="sv-step">
            <span>2</span>
            <p>
              <b>Paste here</b> and hit Fetch Video.
            </p>
          </div>
          <div className="sv-step">
            <span>3</span>
            <p>
              <b>Download</b> — saved straight to your device.
            </p>
          </div>
        </div>
        <p className="sv-note">
          For personal use only — download only videos you own or have
          permission to save.
        </p>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <>
      <Scene />
      <Downloader />
      <footer className="sv-footer">⚡ SnapVid · Showcase by ThreeUI</footer>
    </>
  );
}
