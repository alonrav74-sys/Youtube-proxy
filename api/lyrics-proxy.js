import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { videoId, q } = req.query;
    const rapidKey = process.env.RAPIDAPI_KEY; // הכנס ב־Vercel Environment
    let lyricsText = "";

    // 1️⃣ ניסיון ראשון — Genius
    if (rapidKey && q) {
      try {
        const searchRes = await fetch(`https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(q)}`, {
          method: "GET",
          headers: {
            "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
            "x-rapidapi-key": rapidKey
          }
        });
        const searchData = await searchRes.json();
        const song = searchData?.hits?.[0]?.result;
        if (song?.id) {
          const lyricsRes = await fetch(`https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`, {
            method: "GET",
            headers: {
              "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
              "x-rapidapi-key": rapidKey
            }
          });
          const lyricsData = await lyricsRes.json();
          lyricsText = lyricsData?.lyrics?.lyrics?.body?.plain || "";
        }
      } catch (err) {
        console.warn("Genius failed:", err);
      }
    }

    // 2️⃣ ניסיון שני — Spotify (אם יש לך הרשמה בעתיד)
    if (!lyricsText && rapidKey && q) {
      try {
        const sp = await fetch(`https://spotify-lyrics-api8.p.rapidapi.com/?term=${encodeURIComponent(q)}`, {
          headers: {
            "x-rapidapi-host": "spotify-lyrics-api8.p.rapidapi.com",
            "x-rapidapi-key": rapidKey
          }
        });
        const spData = await sp.json();
        lyricsText = spData?.lyrics || spData?.data?.lyrics || "";
      } catch (err) {
        console.warn("Spotify fallback failed:", err);
      }
    }

    // 3️⃣ ניסיון שלישי — lyrics.ovh (ציבורי)
    if (!lyricsText && q) {
      const [title, artist] = q.split(/[-|]/).map(t => t.trim());
      try {
        const ovh = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist || 'artist')}/${encodeURIComponent(title || 'title')}`);
        const ovhData = await ovh.json();
        lyricsText = ovhData?.lyrics || "";
      } catch (err) {
        console.warn("lyrics.ovh failed:", err);
      }
    }

    if (!lyricsText) {
      return res.status(404).json({ error: "Lyrics not found" });
    }

    res.status(200).json({ lyrics: lyricsText.trim() });
  } catch (err) {
    console.error("Lyrics API error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
