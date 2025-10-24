// === Smart Genius Lyrics Proxy for Vercel ===
// משתמש ב-fetch בטוח ועובד על Node 20+
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

export default async function handler(req, res) {
  try {
    const { q } = req.query;
    const rapidKey = process.env.RAPIDAPI_KEY;

    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });
    if (!rapidKey) return res.status(500).json({ error: "Missing RAPIDAPI_KEY in environment" });

    // 🧹 ניקוי שאילתה
    const cleanQ = q.replace(/[\[\]\(\)\|,]/g, "").trim();
    const searchTerm = `${cleanQ} lyrics`;
    console.log("🎵 Searching Genius for:", searchTerm);

    // 1️⃣ ניסיון ראשון — Genius API
    try {
      const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(searchTerm)}`;
      const sRes = await fetch(searchUrl, {
        headers: {
          "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
          "x-rapidapi-key": rapidKey
        }
      });

      if (!sRes.ok) {
        console.warn("⚠️ Genius search failed:", sRes.status);
      } else {
        const sData = await sRes.json();
        const song = sData?.hits?.[0]?.result;
        if (song?.id) {
          const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
          const lRes = await
