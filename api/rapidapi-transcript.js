export default async function handler(req, res) {
  const videoId = req.query.videoId;

  if (!videoId) {
    return res
      .status(400)
      .json({ success: false, error: "videoId is required" });
  }

  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res
      .status(500)
      .json({ success: false, error: "Missing RAPIDAPI_KEY" });
  }

  const url = `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${encodeURIComponent(videoId)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": RAPID_KEY,
        "x-rapidapi-host": "youtube-transcript3.p.rapidapi.com",
      },
    });

    if (!response.ok) {
      const txt = await response.text();
      return res
        .status(response.status)
        .json({
          success: false,
          error: `RapidAPI error ${response.status}`,
          details: txt,
        });
    }

    const data = await response.json();

    let transcriptText = "";
    if (Array.isArray(data)) {
      transcriptText = data.map(s => s.text).join(" ");
    } else if (data.segments) {
      transcriptText = data.segments.map(s => s.text).join(" ");
    } else if (data.text) {
      transcriptText = data.text;
    }

    res.status(200).json({
      success: true,
      videoId,
      text: transcriptText || "(No transcript found)",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
}
