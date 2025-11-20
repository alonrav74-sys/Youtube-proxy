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

    console.log('Download:', videoId);
    
    // YouTube Media Downloader API
    const apiUrl = `https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=${videoId}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-media-downloader.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    console.log('API Status:', response.status);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Response keys:', Object.keys(data).join(', '));
    
    // Find audio URL
    let audioUrl = null;
    
    // Check for audio formats
    if (data.audios && Array.isArray(data.audios) && data.audios.length > 0) {
      audioUrl = data.audios[0].url;
      console.log('Found audio URL');
    } else if (data.formats && Array.isArray(data.formats)) {
      const audioFormat = data.formats.find(f => 
        f.mimeType && f.mimeType.includes('audio')
      );
      audioUrl = audioFormat?.url;
      console.log('Found format URL');
    }
    
    if (!audioUrl) {
      console.error('No audio URL found');
      throw new Error('No audio URL available');
    }
    
    console.log('Downloading audio...');
    const audioRes = await fetch(audioUrl);
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log('Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);
    
    console.log('Success!');

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to download audio'
    });
  }
}
