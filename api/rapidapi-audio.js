import fetch from "node-fetch";

export default async function handler(req, res) {
  const { url, id } = req.query;
  if (!id && !url) {
    return res.status(400).json({ error: "Missing ?id or ?url" });
  }

  try {
    // חילוץ מזהה וידאו אם נשלחה כתובת
    const videoId = id || new URL(url).searchParams.get("v");

    const rapidRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "youtube-mp36.p.rapidapi.com"
      }
    });

    const data = await rapidRes.json();
    if (!data.link) {
      throw new Error(data.msg || "No audio link found");
    }

    res.status(200).json({ audioUrl: data.link, title: data.title });
  } catch (err) {
    console.error("RapidAPI audio error:", err);
    res.status(500).json({ error: "Failed to get audio", details: err.message });
  }
}
