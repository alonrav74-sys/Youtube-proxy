// === Safe Genius Lyrics Proxy for Vercel ===
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

export default async function handler(req, res) {
  try {
    const { q } = req.query;
    const rapidKey = process.env.RAPIDAPI_KEY;

    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });
    if (!rapidKey) return res.status(500).json({ error: "Missing RAPIDAPI_KEY in environment" });

    console.log("🎵 Searching lyrics for:", q);

    // 1️⃣ Genius API
    try {
      const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(q)}`;
      const sRes = await fetch(searchUrl, {
        headers: {
          "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
          "x-rapidapi-key": rapidKey
        }
      });

      if (!sRes.ok) {
        console.warn("Genius search failed:", sRes.status);
      } else {
        const sData = await sRes.json();
        const song = sData?.hits?.[0]?.result;
        if (song?.id) {
          const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
          const lRes = await fetch(lyricsUrl, {
            headers: {
              "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
              "x-rapidapi-key": rapidKey
            }
          });
          const lData = await lRes.json();
          const text = lData?.lyrics?.lyrics?.body?.plain;
          if (text) {
            return res.status(200).json({ lyrics: text.trim(), source: "genius" });
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Genius API failed:", err.message);
    }

    // 2️⃣ lyrics.ovh fallback
    try {
      const [artist, title] = q.split(/[-|]/).map(x => x.trim());
      const ovh = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || "artist")}/${encodeURIComponent(title || "title")}`);
      if (ovh.ok) {
        const data = await ovh.json();
        if (data?.lyrics) return res.status(200).json({ lyrics: data.lyrics.trim(), source: "ovh" });
      }
    } catch (err) {
      console.warn("⚠️ lyrics.ovh fallback failed:", err.message);
    }

    return res.status(404).json({ error: "Lyrics not found for this query" });
  } catch (err) {
    console.error("🚨 Fatal server error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
