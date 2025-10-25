// api/whisper-transcribe.js
// Vercel Serverless Function for Whisper AI transcription

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { url, videoId } = req.query;
    
    // If videoId provided, first get the audio URL
    let audioUrl = url;
    
    if (!audioUrl && videoId) {
      console.log(`Getting audio URL for video: ${videoId}`);
      
      // Call our own rapidapi-audio endpoint
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'https://youtube-proxy-pied.vercel.app';
      
      const audioResponse = await fetch(`${baseUrl}/api/rapidapi-audio?videoId=${videoId}`);
      
      if (!audioResponse.ok) {
        return res.status(400).json({ 
          error: 'Could not get audio URL',
          details: await audioResponse.text()
        });
      }
      
      const audioData = await audioResponse.json();
      audioUrl = audioData.url;
    }
    
    if (!audioUrl) {
      return res.status(400).json({ 
        error: 'Missing url or videoId parameter',
        example: '/api/whisper-transcribe?url=AUDIO_URL or ?videoId=VIDEO_ID'
      });
    }
    
    console.log(`Transcribing audio from: ${audioUrl}`);
    
    // RapidAPI Whisper configuration
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_KEY_HERE';
    const RAPIDAPI_HOST = 'whisper-asr.p.rapidapi.com';
    
    // Call Whisper API
    const response = await fetch(`https://${RAPIDAPI_HOST}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      },
      body: JSON.stringify({
        url: audioUrl,
        language: 'auto', // Auto-detect language
        model: 'base' // Options: tiny, base, small, medium, large
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        error: 'Whisper API request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('Whisper response:', data);
    
    // Extract text and segments
    let transcriptText = '';
    let segments = [];
    
    if (data.text) {
      transcriptText = data.text;
    }
    
    if (data.segments) {
      segments = data.segments;
    }
    
    // If no text, try to build from segments
    if (!transcriptText && segments.length > 0) {
      transcriptText = segments.map(s => s.text || '').join(' ').trim();
    }
    
    if (!transcriptText) {
      return res.status(200).json({ 
        error: 'No transcription available',
        text: '🎤 לא הצלחתי לתמלל את האודיו',
        rawResponse: data
      });
    }
    
    // Return the transcription with timestamps
    return res.status(200).json({ 
      success: true,
      text: transcriptText.trim(),
      segments: segments,
      language: data.language || 'unknown',
      duration: data.duration || null,
      videoId: videoId || null
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      text: '⚠️ שגיאת שרת בתמלול'
    });
  }
}
```

---

## 🚀 מה לעשות עכשיו:

### 1. צור קובץ חדש ב-GitHub
1. לך ל: https://github.com/alonrav74-sys/Youtube-proxy/tree/main/api
2. לחץ **"Add file" → "Create new file"**
3. שם הקובץ: `whisper-transcribe.js`

### 2. הדבק את הקוד
העתק את כל הקוד למעלה והדבק

### 3. Commit
לחץ **"Commit new file"**

### 4. Redeploy ב-Vercel
Deployments → ... → Redeploy

### 5. בדוק שעובד
```
https://youtube-proxy-pied.vercel.app/api/whisper-transcribe?videoId=dQw4w9WgXcQ
