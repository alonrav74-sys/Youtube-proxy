// /api/yt.js — Smart Universal Fallback (works when others fail)
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

  // 1️⃣ ננסה שוב את piped (אם אחד מהם חזר)
  const pipedSources = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.mint.lgbt',
    'https://pipedapi.lunar.icu'
  ];

  for (const base of pipedSources) {
    try {
      const r = await fetch(`${base}/streams/${id}`, { timeout: 7000 });
      if (r.ok) {
        const data = await r.json();
        if (data?.audioStreams?.length) return res.status(200).json(data);
      }
    } catch (_) {}
  }

  // 2️⃣ פרוקסי ציבורי שעוקף חסימות (AllOrigins)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      'https://pipedapi.kavin.rocks/streams/' + id
    )}`;
    const r = await fetch(proxyUrl);
    if (r.ok) {
      const data = await r.json();
      if (data?.audioStreams?.length) return res.status(200).json(data);
    }
  } catch (_) {}

  // 3️⃣ fallback אחרון - yt.artemislena.eu (תומך חלקית)
  try {
    const r = await fetch(`https://yt.artemislena.eu/api/v1/videos/${id}`);
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
  } catch (_) {}

  return res.status(502).json({ error: 'all sources failed' });
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
