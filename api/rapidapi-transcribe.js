import fetch from "node-fetch";
import FormData from "form-data";

/**
 * /api/whisper-transcribe
 * מקבל קובץ אודיו לפי URL ושולח אותו למנוע Whisper של OpenAI לתמלול.
 * נדרש משתנה סביבה OPENAI_API_KEY בהגדרות Vercel.
 */

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: "Missing ?url= parameter" });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment" });
    }

    // הורדת קובץ האודיו מהכתובת שנשלחה
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      return res.status(400).json({ error: "Failed to fetch audio from URL" });
    }

    const buffer = Buffer.from(await audioRes.arrayBuffer());
    const formData = new FormData();
    formData.append("file", buffer, { filename: "audio.mp3" });
    formData.append("model", "whisper-1");

    // שליחת האודיו למנוע Whisper של OpenAI
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Whisper error:", data);
      return res.status(response.status).json(data);
    }

    // מחזיר את הטקסט
    return res.status(200).json({ text: data.text || "(ריק)" });

  } catch (err) {
    console.error("Whisper server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
