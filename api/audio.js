export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "missing video id" });

  try {
    const sources = [
      "https://pipedapi.kavin.rocks",
      "https://pipedapi.syncpundit.io",
      "https://pipedapi.moomoo.me",
      "https://pipedapi.leptons.xyz"
    ];

    for (const base of sources) {
      try {
        const r = await fetch(`${base}/streams/${id}`);
        if (!r.ok) continue;
        const data = await r.json();
        if (data?.audioStreams?.length) {
          const best = data.audioStreams.sort((a, b) => b.bitrate - a.bitrate)[0];
          return res.status(200).json({
            id,
            title: data.title,
            author: data.uploader,
            audioUrl: best.url
          });
        }
      } catch (e) {}
    }

    return res.status(502).json({ error: "no audio found from mirrors" });
  } catch (err) {
    return res.status(500).json({ error: "server error", details: err.message });
  }
}
