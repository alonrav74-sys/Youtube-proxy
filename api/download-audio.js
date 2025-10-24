import ytdl from "@distube/ytdl-core";

export default async function handler(req, res) {
  // ✅ Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId parameter" });
  }

  try {
    console.log(`🎵 Downloading audio: ${videoId}`);

    if (!ytdl.validateID(videoId)) {
      return res.status(400).json({ error: "Invalid video ID" });
    }

    const info = await ytdl.getInfo(videoId);
    const audioFormats = ytdl.filterFormats(info.formats, "audioonly");

    if (!audioFormats || audioFormats.length === 0) {
      return res.status(404).json({ error: "No audio formats found" });
    }

    const bestAudio = audioFormats.reduce((best, format) =>
      format.audioBitrate > best.audioBitrate ? format : best
    );

    console.log(
      `✅ Found format: ${bestAudio.mimeType}, bitrate: ${bestAudio.audioBitrate}`
    );

    // ✅ Use proper MIME type based on format
    res.setHeader("Content-Type", bestAudio.mimeType || "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${videoId}.mp3"`
    );

    const audioStream = ytdl(videoId, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    audioStream.pipe(res);

    audioStream.on("error", (err) => {
      console.error("Stream error:", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Stream error", message: err.message });
    });
  } catch (error) {
    console.error("Download error:", error);
    res
      .status(500)
      .json({ error: "Failed to download audio", message: error.message });
  }
}
