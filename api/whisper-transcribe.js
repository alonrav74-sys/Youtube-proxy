import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
import path from "path";
import os from "os";

/**
 * Whisper Transcription API (Pro Edition)
 * תומך גם בכתובת URL וגם בקובץ מקומי זמני
 * מחזיר תמלול רגיל + זיהוי שפה + timestamps (בפורמט SRT)
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
    let isUrl = false;

    // 🟢 אם נשלח URL
    if (req.query.url) {
      const audioRes = await fetch(req.query.url);
      if (!audioRes.ok)
        return res.status(400).json({ error: "Failed to fetch audio from URL" });

      audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      isUrl = true;
    }

    // 🟢 אם נשלח קובץ (upload)
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

    // יצירת קובץ זמני
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(tempPath, audioBuffer);

    // פונקציה פנימית לשליחת בקשה ל-Whisper
    async function whisperRequest(format = "json") {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(tempPath));
      formData.append("model", "whisper-1");
      formData.append("response_format", format);
      formData.append("timestamp_granularity", "segment"); // מאפשר timestamps

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: formData,
      });

      const data = format === "json" ? await response.json() : await response.text();
      if (!response.ok) {
        console.error("Whisper error:", data);
        throw new Error(data.error?.message || "Whisper failed");
      }
      return data;
    }

    // 🧠 בקשה רגילה (JSON)
    const jsonData = await whisperRequest("json");

    // 🕒 בקשה נוספת ל־timestamps (SRT)
    let srtData = "";
    try {
      srtData = await whisperRequest("srt");
    } catch (e) {
      console.warn("SRT transcription failed:", e.message);
    }

    fs.unlinkSync(tempPath); // מחיקת הקובץ הזמני

    // שליחת תוצאה מלאה
    return res.status(200).json({
      text: jsonData.text || "",
      language: jsonData.language || "unknown",
      srt: srtData || null,
      duration: jsonData.duration || null,
      sourceType: isUrl ? "url" : "upload",
    });

  } catch (err) {
    console.error("Whisper server error:", err);
    return res.status(500).json({ error: err.message });
  }
}
