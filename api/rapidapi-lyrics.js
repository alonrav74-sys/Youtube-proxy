export default async function handler(req, res) {
  const { artist, title } = req.query;

  // ✅ בדיקה אם הועברו נתונים
  if (!artist || !title) {
    return res.status(400).json({
      success: false,
      error: "artist and title are required",
    });
  }

  // ✅ קריאת מפתח RapidAPI
  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing RAPIDAPI_KEY in environment variables",
    });
  }

  // ✅ פונקציה לשליפת מילים מ-Genius
  async function fetchFromGenius() {
    const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(
      `${artist} ${title}`
    )}`;
    const headers = {
      "x-rapidapi-key": RAPID_KEY,
      "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
    };

    try {
      const searchRes = await fetch(searchUrl, { headers });
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();

      const song = searchData?.hits?.[0]?.result;
      if (!song) return null;

      const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
      const lyricsRes = await fetch(lyricsUrl, { headers });
      if (!lyricsRes.ok) return null;
      const lyricsData = await lyricsRes.json();

      const plainLyrics =
        lyricsData?.lyrics?.lyrics?.body?.plain ||
        lyricsData?.lyrics?.body?.plain ||
        null;

      return plainLyrics;
    } catch {
      return null;
    }
  }

  // ✅ פונקציית fallback לשליפת מילים מ-Musixmatch
  async function fetchFromMusixmatch() {
    const url = `https://musixmatch-lyrics.p.rapidapi.com/lyrics/get?q_track=${encodeURIComponent(
      title
    )}&q_artist=${encodeURIComponent(artist)}`;
    const headers = {
      "x-rapidapi-key": RAPID_KEY,
      "x-rapidapi-host": "musixmatch-lyrics.p.rapidapi.com",
    };

    try {
      const resLyrics = await fetch(url, { headers });
      if (!resLyrics.ok) return null;
      const data = await resLyrics.json();

      const text =
        data?.lyrics_body ||
        data?.message?.body?.lyrics?.lyrics_body ||
        null;

      return text;
    } catch {
      return null;
    }
  }

  try {
    // 🔍 שלב 1 — ניסיון מ-Genius
    let lyrics = await fetchFromGenius();

    // 🔁 אם לא נמצאו מילים — לנסות מ-Musixmatch
    if (!lyrics) lyrics = await fetchFromMusixmatch();

    // 📝 הודעת fallback אם עדיין אין תוצאה
    if (!lyrics || lyrics.trim().length === 0) {
      lyrics = "🎤 לא נמצאו מילים לשיר זה (בדוק את שם האמן והשיר)";
    }

    // ✅ החזרת תוצאה לאפליקציה
    res.status(200).json({
      success: true,
      artist,
      title,
      lyrics,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
}
