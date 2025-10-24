const ytdl = require("ytdl-core");

module.exports = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing YouTube URL" });

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });

    if (!format || !format.url) {
      throw new Error("No audio format found");
    }

    return res.status(200).json({ audioUrl: format.url });
  } catch (err) {
    console.error("Download error:", err);
    return res.status(500).json({ error: "Failed to fetch audio", details: err.message });
  }
};
