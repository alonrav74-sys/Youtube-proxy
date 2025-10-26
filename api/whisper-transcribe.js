// api/whisper-transcribe.js
// Fixed version - uses GET /transcribe?url=... (the working endpoint!)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId', success: false });
    }
    
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured', success: false });
    }
    
    console.log('🎤 Whisper transcription for:', videoId);
    
    // Build YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // ✅ THE WORKING ENDPOINT: GET /transcribe?url=...
    const apiUrl = `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${encodeURIComponent(youtubeUrl)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'speech-to-text-ai.p.rapidapi.com'
      }
    });
    
    console.log('📡 Whisper response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Whisper API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Whisper API failed',
        details: errorText,
        success: false
      });
    }
    
    const data = await response.json();
    console.log('✅ Whisper success!');
    
    // Convert chunks to segments with start/end times
    const segments = [];
    if (data.chunks && Array.isArray(data.chunks)) {
      for (const chunk of data.chunks) {
        segments.push({
          text: chunk.text || '',
          start: chunk.offset || 0,
          end: (chunk.offset || 0) + (chunk.duration || 0)
        });
      }
    }
    
    // Get full text
    const text = data.text || segments.map(s => s.text).join(' ');
    
    return res.status(200).json({
      success: true,
      text: text,
      segments: segments,
      language: data.lang || 'unknown',
      duration: data.duration || 0
    });
    
  } catch (error) {
    console.error('💥 Server error:', error);
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: error.message,
      success: false
    });
  }
}
