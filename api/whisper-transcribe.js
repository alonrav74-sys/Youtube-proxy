import fetch from "node-fetch";
import FormData from "form-data";

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Missing audio URL" });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: "Missing OpenAI API key" });
    }

    // שליפת האודיו מה-URL שירד קודם
    const audioResp = await fetch(url);
    if (!audioResp.ok) {
      throw new Error("Failed to download audio from provided URL");
    }
    const audioBuffer = await audioResp.arrayBuffer();

    // הכנת הבקשה ל-OpenAI Whisper
    const formData = new FormData();
    formData.append("file", Buffer.from(audioBuffer), "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "json");

    const openaiResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`
      },
      body: formData
    });

    const result = await openaiResp.json();
    if (!openaiResp.ok) {
      throw new Error(result.error?.message || "Whisper request failed");
    }

    res.status(200).json(result);
  } catch (err) {
    console.error("Whisper error:", err);
    res.status(500).json({ error: err.message || "Transcription failed" });
  }
}
