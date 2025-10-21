// /api/yt.js — Vercel Serverless Function
export default async function handler(req, res) {
  // תמיכה גם ב-GET וגם ב-OPTIONS ל-CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  const { id } = req.query;
  if (!id) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'missing id' });
  }

  const sources = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.syncpundit.io',
    'https://pipedapi.moomoo.me'
  ];

  for (const base of sources) {
    try {
      const r = await fetch(`${base}/streams/${id}`);
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.audioStreams?.length) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json(data);
      }
    } catch (e) {
      // ממשיכים למקור הבא
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(502).json({ error: 'all sources failed' });
}
