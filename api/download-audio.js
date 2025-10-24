import ytdl from "ytdl-core";

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: "Missing YouTube URL" });
    }

    // בדיקה אם זה לינק תקין
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    // הורדת אודיו בלבד
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });

    if (!format || !format.url) {
      throw new Error("No audio format found");
    }

    // החזרה ישירה ללינק
    return res.status(200).json({ audioUrl: format.url });
  } catch (err) {
    console.error("Download error:", err);
    return res.status(500).json({ error: "Failed to fetch audio", details: err.message });
  }
}
