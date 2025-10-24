import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import path from "path";
import os from "os";

/**
 * /api/whisper-transcribe
 * תומך גם בכתובת URL (url=) וגם בקובץ אודיו מקומי שהועלה זמנית.
 * נדרש משתנה סביבה OPENAI_API_KEY ב-Vercel.
 */

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey)
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment" });

    let audioBuffer = null;

    // אם נשלחה בקשה עם פרמטר ?url= נטען את הקובץ מהאינטרנט
    if (req.query.url) {
      const audioRes = await fetch(req.query.url);
      if (!audioRes.ok) {
        return res.status(400).json({ error: "Failed to fetch audio from URL" });
      }
      audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    }

    // במידה ונשלח קובץ multipart/form-data (כמו בהעלאה מלקוח)
    else if (req.method === "POST") {
      const chunks = [];
      await new Promise((resolve) => {
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", resolve);
      });
      audioBuffer = Buffer.concat(chunks);
    } else {
      return res.status(400).json({ error: "Missing audio input (url or file)" });
    }

    // שומרים את הקובץ באופן זמני לניתוח
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(tempPath, audioBuffer);

    const formData = new FormData();
    formData.append("file", fs.createReadStream(tempPath));
    formData.append("model", "whisper-1");

    // קריאה ל-OpenAI
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    const data = await response.json();
    fs.unlinkSync(tempPath); // מחיקת קובץ זמני

    if (!response.ok) {
      console.error("Whisper error:", data);
      return res.status(response.status).json(data);
    }

    res.status(200).json({
      text: data.text || "",
      duration: data.duration || null,
      language: data.language || null,
    });
  } catch (err) {
    console.error("Whisper server error:", err);
    res.status(500).json({ error: err.message });
  }
}
