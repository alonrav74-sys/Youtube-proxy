export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { url, videoId } = req.query;
    let audioUrl = url;
    
    if (!audioUrl && videoId) {
      const baseUrl = 'https://youtube-proxy-pied.vercel.app';
      const audioResponse = await fetch(`${baseUrl}/api/rapidapi-audio?videoId=${videoId}`);
      
      if (audioResponse.ok) {
        const audioData = await audioResponse.json();
        audioUrl = audioData.audioUrl || audioData.url;
      }
    }
    
    if (!audioUrl) {
      return res.status(400).json({ error: 'Missing url or videoId' });
    }
    
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    const response = await fetch('https://openai-whisper-speech-to-text1.p.rapidapi.com/speech-to-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'openai-whisper-speech-to-text1.p.rapidapi.com'
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language: 'auto'
      })
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: 'Whisper API failed',
        status: response.status
      });
    }
    
    const data = await response.json();
    const text = data.text || data.transcription || '';
    
    if (!text) {
      return res.status(200).json({ 
        success: false,
        text: '🎤 לא הצלחתי לתמלל את האודיו'
      });
    }
    
    return res.status(200).json({ 
      success: true,
      text: text.trim(),
      videoId: videoId || null
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: error.message,
      text: '⚠️ שגיאת שרת בתמלול'
    });
  }
}
