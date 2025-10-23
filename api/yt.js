// /api/yt.js — Vercel Serverless Function
// מחזיר JSON עם audioStreams עבור וידאו YouTube (לשימוש פרונט)
export default async function handler(req, res) {
  // ----- CORS -----
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const rawId = (req.query.id || req.query.url || '').toString().trim();
  const id = extractId(rawId);

  setCORS(res);

  if (!id) {
    return res.status(400).json({ error: 'missing or bad id' });
  }

  // ----- מקורות Piped -----
  const piped = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.moomoo.me',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.mint.lgbt',
    'https://pipedapi.lunar.icu'
  ];

  for (const base of piped) {
    try {
      const r = await fetchWithTimeout(`${base}/streams/${id}`, 9000);
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.audioStreams?.length) {
        return res.status(200).json(data);
      }
    } catch (_) { /* ממשיכים למקור הבא */ }
  }

  // ----- נפילת חירום: Invidious -----
  const invidious = [
    'https://yewtu.be',
    'https://iv.ggtyler.dev',
    'https://invidious.slipfox.xyz',
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de'
  ];

  for (const base of invidious) {
    try {
      const r = await fetchWithTimeout(`${base}/api/v1/videos/${id}`, 9000, {
        headers: { 'accept': 'application/json' }
      });
      if (!r.ok) continue;
      const v = await r.json();

      // Invidious מחזיר formatStreams (muxed) ו-adaptiveFormats (כולל אודיו נטו)
      const a1 = Array.isArray(v?.adaptiveFormats) ? v.adaptiveFormats : [];
      const a2 = Array.isArray(v?.formatStreams) ? v.formatStreams : [];

      const onlyAudio = [
        ...a1.filter(f => (f?.type || '').toLowerCase().includes('audio')),
        ...a2.filter(f => (f?.type || '').toLowerCase().includes('audio'))
      ];

      const audioStreams = onlyAudio
        .map(f => ({
          url: f.url,
          mimeType: f.type || 'audio/webm',
          bitrate: numberFrom(f.bitrate) ?? numberFrom(f.averageBitrate),
          quality: f.audioQuality || f.qualityLabel || 'audio',
          itag: f.itag,
          contentLength: numberFrom(f.clen) ?? numberFrom(f.contentLength)
        }))
        .filter(s => typeof s.url === 'string' && s.url.startsWith('http'));

      if (audioStreams.length) {
        return res.status(200).json({ audioStreams });
      }
    } catch (_) { /* ממשיכים למקור הבא */ }
  }

  return res.status(502).json({ error: 'all sources failed' });
}

/* ===== Helpers ===== */

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}

function numberFrom(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
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

// קבלת מזהה אם הגיע כ-URL מלא או כ-ID גולמי
function extractId(input) {
  if (!input) return '';
  // אם זה כבר ID באורך 11, נחזיר
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const u = new URL(input);
    // watch?v=XXXXX
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    // youtu.be/XXXXX
    const pathId = u.pathname.split('/').filter(Boolean).pop();
    if (pathId && /^[a-zA-Z0-9_-]{11}$/.test(pathId)) return pathId;
  } catch {
    /* לא URL חוקי */
  }
  return '';
}
