// === Ultra Safe Genius Lyrics Proxy for Vercel ===
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

export default async function handler(req, res) {
  try {
    const { q } = req.query;
    const rapidKey = process.env.RAPIDAPI_KEY;

    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });
    if (!rapidKey) return res.status(500).json({ error: "Missing RAPIDAPI_KEY in environment" });

    const cleanQ = q.replace(/[\[\]\(\)\|,]/g, "").trim();
    const searchTerm = `${cleanQ} lyrics`;
    console.log("🎵 Searching Genius for:", searchTerm);

    // 🔹 ניסיון ראשון — Genius API
    try {
      const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(searchTerm)}`;
      const sRes = await fetch(searchUrl, {
        headers: {
          "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
          "x-rapidapi-key": rapidKey
        }
      }).catch(e => ({ ok: false, status: 500, message: e.message }));

      if (sRes && sRes.ok) {
        const sData = await sRes.json().catch(() => ({}));
        const song = sData?.hits?.[0]?.result;
        if (song?.id) {
          const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
          const lRes = await fetch(lyricsUrl, {
            headers: {
              "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
              "x-rapidapi-key": rapidKey
            }
          }).catch(e => ({ ok: false, status: 500, message: e.message }));

          if (lRes && lRes.ok) {
            const lData = await lRes.json().catch(() => ({}));
            const text = lData?.lyrics?.lyrics?.body?.plain;
            if (text) {
              return res.status(200).json({
                title: song.full_title || searchTerm,
                lyrics: text.trim(),
                source: "genius"
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Genius API call failed:", err.message);
    }

    // 🔹 ניסיון שני — lyrics.ovh fallback
    try {
      const [artist, title] = cleanQ.split(/[-|]/).map(x => x.trim());
      const ovh = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || "artist")}/${encodeURIComponent(title || "title")}`);
      if (ovh.ok) {
        const data = await ovh.json();
        if (data?.lyrics) {
          console.log("✅ Lyrics found via lyrics.ovh");
          return res.status(200).json({ lyrics: data.lyrics.trim(), source: "ovh" });
        }
      }
    } catch (err) {
      console.warn("⚠️ lyrics.ovh fallback failed:", err.message);
    }

    console.log("❌ No lyrics found for query:", q);
    return res.status(404).json({ error: `Lyrics not found for: ${q}` });
  } catch (err) {
    console.error("🚨 Server crashed:", err.message);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
