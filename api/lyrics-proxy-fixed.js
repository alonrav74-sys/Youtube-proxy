import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { q } = req.query;
    const rapidKey = process.env.RAPIDAPI_KEY;
    if (!rapidKey) {
      return res.status(500).json({ error: "Missing RAPIDAPI_KEY in server environment." });
    }
    if (!q) {
      return res.status(400).json({ error: "Missing query parameter 'q'" });
    }

    console.log("🎵 Searching lyrics for:", q);

    // 1️⃣ ניסיון ראשון — Genius API
    try {
      const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(q)}`;
      const sRes = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
          "x-rapidapi-key": rapidKey
        }
      });
      const sData = await sRes.json();
      const song = sData?.hits?.[0]?.result;
      if (song?.id) {
        const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
        const lRes = await fetch(lyricsUrl, {
          method: "GET",
          headers: {
            "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
            "x-rapidapi-key": rapidKey
          }
        });
        const lData = await lRes.json();
        const text = lData?.lyrics?.lyrics?.body?.plain;
        if (text) {
          console.log("✅ Lyrics fetched from Genius");
          return res.status(200).json({ lyrics: text.trim(), source: "genius" });
        }
      }
    } catch (err) {
      console.warn("⚠️ Genius API failed:", err);
    }

    // 2️⃣ ניסיון נוסף — lyrics.ovh fallback
    try {
      const [artist, title] = q.split(/[-|]/).map(x => x.trim());
      const ovh = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || "artist")}/${encodeURIComponent(title || "title")}`);
      const ovhData = await ovh.json();
      if (ovhData?.lyrics) {
        console.log("✅ Lyrics fetched from lyrics.ovh");
        return res.status(200).json({ lyrics: ovhData.lyrics.trim(), source: "ovh" });
      }
    } catch (err) {
      console.warn("⚠️ lyrics.ovh fallback failed:", err);
    }

    // 3️⃣ אם כלום לא עבד
    console.log("❌ No lyrics found for:", q);
    return res.status(404).json({ error: "Lyrics not found for this query" });

  } catch (err) {
    console.error("🚨 Server error:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
