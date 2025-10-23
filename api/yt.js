// /api/yt.js — FINAL GLOBAL VERSION (Stable Anywhere)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const rawId = (req.query.id || req.query.url || '').toString().trim();
  const id = extractId(rawId);
  setCORS(res);

  if (!id) return res.status(400).json({ error: 'missing or bad id' });

  // 🚀 מקור אמין ראשון: Proxy בינלאומי שעוקף הכל
  try {
    const r = await fetch(
      `https://corsproxy.io/?https://pipedapi.kavin.rocks/streams/${id}`
    );
    if (r.ok) {
      const data = await r.json();
      if (data?.audioStreams?.length) {
        return res.status(200).json(data);
      }
    }
  } catch (e) {
    console.log('corsproxy.io failed');
  }

  // 🌎 מקור נוסף - yt.artemislena.eu (דרך proxy)
  try {
    const url = `https://corsproxy.io/?https://yt.artemislena.eu/api/v1/videos/${id}`;
    const r = await fetch(url);
    if (r.ok) {
      const v = await r.json();
      const audio = (v?.adaptiveFormats || [])
        .filter(f => (f?.type || '').includes('audio'))
        .map(f => ({
          url: f.url,
          mimeType: f.type,
          bitrate: f.bitrate || f.averageBitrate,
          quality: f.audioQuality || 'audio'
        }));
      if (audio.length) return res.status(200).json({ audioStreams: audio });
    }
  } catch (e) {
    console.log('yt.artemislena.eu failed');
  }

  // 🔁 ניסיון אחרון - API רשמי של יוטיוב (אם יש לך מפתח)
  const YT_KEY = process.env.YT_KEY;
  if (YT_KEY) {
    try {
      const api = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${id}&key=${YT_KEY}`;
      const r = await fetch(api);
      if (r.ok) {
        const j = await r.json();
        return res.status(200).json({ message: 'YouTube API key works', data: j });
      }
    } catch (e) {
      console.log('Google API failed');
    }
  }

  return res.status(502).json({ error: 'all sources failed (final)' });
}

/* ===== Helpers ===== */
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}
function extractId(input) {
  if (!input) return '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const pathId = u.pathname.split('/').filter(Boolean).pop();
    if (pathId && /^[a-zA-Z0-9_-]{11}$/.test(pathId)) return pathId;
  } catch {}
  return '';
}
