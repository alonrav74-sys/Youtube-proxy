export default async function handler(req, res) {
  const { audioUrl } = req.query;

  if (!audioUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing audioUrl parameter",
    });
  }

  const RAPID_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPID_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing RAPIDAPI_KEY in environment variables",
    });
  }

  const url = "https://openai-whisper1.p.rapidapi.com/asr";
  const options = {
    method: "POST",
    headers: {
      "x-rapidapi-key": RAPID_KEY,
      "x-rapidapi-host": "openai-whisper1.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,     // כתובת הקובץ מהיוטיוב
      output: "srt",           // פלט עם timestamps
      language: "auto"         // זיהוי אוטומטי של עברית/אנגלית
    }),
  };

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: "RapidAPI Whisper error",
        details: errText,
      });
    }

    const text = await response.text(); // הפלט בפורמט SRT (עם זמן)
    res.status(200).json({
      success: true,
      transcript: text,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message,
    });
  }
}
