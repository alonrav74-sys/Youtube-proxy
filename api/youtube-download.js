// /api/youtube-download.js
// Simple YouTube audio download

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.query;
    if (!videoId) {
      return res.status(400).json({ error: 'No videoId' });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('📥 Downloading audio for:', videoId);
    
    // Try the YT Search and Download MP3 API
    const params = new URLSearchParams({
      videoId: videoId,
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      v: videoId
    });
    
    const rapidUrl = `https://yt-search-and-download-mp3.p.rapidapi.com/mp3?${params}`;
    
    const rapidRes = await fetch(rapidUrl, {
      headers: {
        'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    if (!rapidRes.ok) {
      throw new Error(`RapidAPI failed: ${rapidRes.status}`);
    }
    
    const rapidData = await rapidRes.json();
    
    // Find audio URL
    const audioUrl = rapidData.link || 
                     rapidData.url || 
                     rapidData.download_link || 
                     rapidData.downloadLink ||
                     rapidData.audio_url ||
                     rapidData.mp3;
    
    if (!audioUrl) {
      throw new Error('No audio URL in response');
    }
    
    // Download audio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    // Return audio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
