export default async function handler(req, res) {
  const { artist, title } = req.query;

  if (!artist || !title) {
    return res.status(400).json({
      success: false,
      error: "artist and title are required",
    });
  }

  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing RAPIDAPI_KEY in environment variables",
    });
  }

  const headers = {
    "x-rapidapi-key": RAPID_KEY,
    "x-rapidapi-host": "genius-song-lyrics1.p.rapidapi.com",
  };

  try {
    // 🔍 חיפוש שיר לפי אמן + שם
    const searchUrl = `https://genius-song-lyrics1.p.rapidapi.com/search/?q=${encodeURIComponent(
      `${artist} ${title}`
    )}`;
    const searchRes = await fetch(searchUrl, { headers });
    if (!searchRes.ok) throw new Error("Search request failed");
    const searchData = await searchRes.json();

    const song = searchData?.hits?.[0]?.result;
    if (!song || !song.id) {
      return res.status(404).json({
        success: false,
        artist,
        title,
        lyrics: "🎤 לא נמצאו מילים לשיר זה (לא נמצא ב-Genius)",
      });
    }

    // 📝 בקשת המילים לפי ID
    const lyricsUrl = `https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${song.id}`;
    const lyricsRes = await fetch(lyricsUrl, { headers });
    if (!lyricsRes.ok) throw new Error("Lyrics request failed");
    const lyricsData = await lyricsRes.json();

    // 🧩 שליפה חכמה של טקסט — גם מ־HTML
    let lyrics =
      lyricsData?.lyrics?.lyrics?.body?.plain ||
      lyricsData?.lyrics?.body?.plain ||
      lyricsData?.lyrics?.lyrics?.body?.html ||
      lyricsData?.lyrics?.body?.html ||
      null;

    if (!lyrics) {
      return res.status(404).json({
        success: false,
        artist,
        title,
        lyrics: "🎤 לא נמצאו מילים לשיר זה (כנראה שאין טקסט זמין)",
      });
    }

    // 🧼 ניקוי תגיות HTML אם יש
    lyrics = lyrics
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?[^>]+(>|$)/g, "")
      .trim();

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
