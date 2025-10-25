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
    
    // Get audio URL
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
    
    // Send URL directly to Whisper
    const whisperResponse = await fetch('https://openai-whisper-speech-to-text1.p.rapidapi.com/speech-to-text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'openai-whisper-speech-to-text1.p.rapidapi.com
