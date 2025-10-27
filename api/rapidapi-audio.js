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
    const apiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/dl?id=${videoId}`;
    
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
    
    const data = await r.json();
    console.log('RapidAPI response keys:', Object.keys(data).join(', '));
    
    // This API can return different response formats
    let audioUrl = null;
    
    // Try different possible fields
    if (data.link) {
      audioUrl = data.link;
    } else if (data.url) {
      audioUrl = data.url;
    } else if (data.dlink) {
      audioUrl = data.dlink;
    } else if (data.formats && Array.isArray(data.formats)) {
      // Find audio format
      const audioFormat = data.formats.find(f => 
        f.format && (f.format.includes('audio') || f.format.includes('mp3'))
      );
      if (audioFormat && audioFormat.url) {
        audioUrl = audioFormat.url;
      }
    } else if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
      // Try adaptive formats
      const audioFormat = data.adaptiveFormats.find(f => 
        f.mimeType && f.mimeType.includes('audio')
      );
      if (audioFormat && audioFormat.url) {
        audioUrl = audioFormat.url;
      }
    }
    
    if (audioUrl) {
      res.json({ 
        success: true, 
        audioUrl: audioUrl,
        title: data.title || 'Unknown'
      });
    } else {
      console.error('No audio URL found in response:', JSON.stringify(data).substring(0, 500));
      res.status(500).json({ 
        success: false,
        error: 'No audio URL in response', 
        responseKeys: Object.keys(data).join(', '),
        data: data 
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ 
      success: false,
      error: e.message 
    });
  }
}
