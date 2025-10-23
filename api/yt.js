// /api/yt.js — Final Version with Reliable Fallback
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

  // ====== שלב 1: Piped instances ======
  const piped = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.mint.lgbt',
    'https://pipedapi.lunar.icu',
    'https://yt.artemislena.eu'
  ];

  for (const base of piped) {
    try {
      const r = await fetchWithTimeout(`${base}/streams/${id}`, 8000);
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.audioStreams?.length) return res.status(200).json(data);
    } catch (_) {}
  }

  // ====== שלב 2: Invidious fallback ======
  const invidious = [
    'https://yewtu.be',
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de'
  ];

  for (const base of invidious) {
    try {
      const r = await fetchWithTimeout(`${base}/api/v1/videos/${id}`, 9000);
      if (!r.ok) continue;
      const v = await r.json();
      const audio = (v?.adaptiveFormats || [])
        .filter(f => (f?.type || '').includes('audio'))
        .map(f => ({
          url: f.url,
          mimeType: f.type,
          bitrate: Number(f.bitrate || f.averageBitrate),
          quality: f.audioQuality || 'audio'
        }));
      if (audio.length) return res.status(200).json({ audioStreams: audio });
    } catch (_) {}
  }

  // ====== שלב 3: fallback ציבורי (עובד בכל מקום) ======
  try {
    const proxyUrl = `https://yt-proxy.corsproxy.io/?id=${id}`;
    const r = await fetch(proxyUrl);
    if (r.ok) {
      const data = await r.json();
      if (data?.audioStreams?.length)
        return res.status(200).json(data);
    }
  } catch (err) {
    console.error('Final fallback failed', err);
  }

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
async function fetchWithTimeout(url, ms, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
