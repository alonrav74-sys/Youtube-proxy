// /api/youtube-download.js
// YouTube audio download using YouTube MP3 Audio Video Downloader API

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
    
    // NEW API: YouTube MP3 Audio Video Downloader
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const rapidUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/mp3`;
    
    // First request - get the download link
    const rapidRes = await fetch(rapidUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      },
      body: JSON.stringify({
        url: videoUrl,
        quality: 'high' // or 'mid' or 'low'
      })
    });
    
    if (!rapidRes.ok) {
      const errorText = await rapidRes.text();
      console.error('❌ RapidAPI error:', rapidRes.status, errorText);
      throw new Error(`RapidAPI failed: ${rapidRes.status}`);
    }
    
    const rapidData = await rapidRes.json();
    
    // Log response for debugging
    console.log('📦 Full Response:', JSON.stringify(rapidData, null, 2));
    
    // Extract download URL
    const audioUrl = rapidData.link || 
                     rapidData.download || 
                     rapidData.url || 
                     rapidData.download_link ||
                     rapidData.file ||
                     (rapidData.data && rapidData.data.link);
    
    console.log('🔍 Found audio URL:', audioUrl ? 'YES' : 'NO');
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('Available fields:', Object.keys(rapidData));
      throw new Error('No audio URL in response');
    }
    
    // Download the actual audio file
    console.log('⬇️ Downloading from:', audioUrl);
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
