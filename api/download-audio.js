import ytdl from "ytdl-core";

export default async function handler(req, res) {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ error: "Missing YouTube URL" });
  }

  try {
    const info = await ytdl.getInfo(videoUrl);
    const audioFormat = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });

    if (!audioFormat || !audioFormat.url) {
      throw new Error("No valid audio format found");
    }

    res.status(200).json({ audioUrl: audioFormat.url });
  } catch (error) {
    console.error("Audio download error:", error);
    res.status(500).json({
      error: "Failed to download audio",
      details: error.message,
    });
  }
}
