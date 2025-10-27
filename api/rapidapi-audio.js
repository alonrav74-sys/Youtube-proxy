export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const videoId = req.query.videoId;
  
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId' });
    return;
  }
  
  const key = process.env.RAPIDAPI_KEY;
  
  if (!key) {
    res.status(500).json({ error: 'No API key' });
    return;
  }
  
  try {
    // Using YouTube MP3 Audio Video Downloader API
    // This API returns the MP3 file directly
    const apiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/download-mp3/${videoId}`;
    
    console.log('Fetching from:', apiUrl);
    
    const r = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com'
      }
    });
    
    if (!r.ok) {
      const errorText = await r.text();
      console.error('RapidAPI error:', errorText);
      return res.status(r.status).json({ 
        success: false,
        error: `RapidAPI failed: ${r.status}`,
        details: errorText 
      });
    }
    
    // Stream the audio file directly to the client!
    const contentType = r.headers.get('content-type') || 'audio/mpeg';
    const contentLength = r.headers.get('content-length');
    
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    // Pipe the response
    const buffer = await r.arrayBuffer();
    res.send(Buffer.from(buffer));
    
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ 
      success: false,
      error: e.message 
    });
  }
}
