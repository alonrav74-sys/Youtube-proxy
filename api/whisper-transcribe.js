export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }
    
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    // Step 1: Get audio URL from our audio API
    const baseUrl = 'https://youtube-proxy-pied.vercel.app';
    const audioResponse = await fetch(`${baseUrl}/api/rapidapi-audio?videoId=${videoId}`);
    
    if (!audioResponse.ok) {
      return res.status(400).json({ error: 'Could not get audio URL' });
    }
    
    const audioData = await audioResponse.json();
    const audioUrl = audioData.audioUrl || audioData.url;
    
    if (!audioUrl) {
      return res.status(400).json({ error: 'No audio URL found' });
    }
    
    // Step 2: Download the audio file
    const audioFileResponse = await fetch(audioUrl);
    
    if (!audioFileResponse.ok) {
      return res.status(400).json({ error: 'Could not download audio file' });
    }
    
    const audioBuffer = await audioFileResponse.arrayBuffer();
    const audioBlob = Buffer.from(audioBuffer);
    
    // Step 3: Send to Whisper API with multipart/form-data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', audioBlob, {
      filename: 'audio.mp3',
      contentType: 'audio/mpeg'
    });
    form.append('language', 'auto');
    
    const whisperResponse = await fetch('https://openai-whisper-speech-to-text1.p.rapidapi.com/speech-to-text', {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'openai-whisper-speech-to-text1.p.rapidapi.com'
      },
      body: form
    });
    
    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      return res.status(whisperResponse.status).json({ 
        error: 'Whisper API failed',
        details: errorText,
        status: whisperResponse.status
      });
    }
    
    const whisperData = await whisperResponse.json();
    const text = whisperData.text || whisperData.transcription || whisperData.transcript || '';
    
    if (!text) {
      return res.status(200).json({ 
        success: false,
        text: '🎤 לא הצלחתי לתמלל את האודיו',
        rawResponse: whisperData
      });
    }
    
    return res.status(200).json({ 
      success: true,
      text: text.trim(),
      videoId: videoId
    });
    
  } catch (error) {
    console.error('Whisper error:', error);
    return res.status(500).json({ 
      error: error.message,
      text: '⚠️ שגיאת שרת בתמלול'
    });
  }
}
