import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    const file = req.query.file || "test.mp3"; // ברירת מחדל
    const filePath = `./public/audio/${file}`; // תיקייה ב־Vercel

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found" });
    }

    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath));
    formData.append("model", "whisper-1");
    formData.append("response_format", "json");

    const openaiRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const data = await openaiRes.json();
    if (openaiRes.ok) {
      return res.status(200).json({ text: data.text });
    } else {
      return res.status(500).json({ error: "Transcription failed", details: data });
    }
  } catch (err) {
    console.error("🚨 Whisper error:", err);
    return res.status(500).json({ error: "Server crashed", details: err.message });
  }
}
