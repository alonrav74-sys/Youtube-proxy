export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { videoId } = req.query;
    if (!videoId) {
      return res.status(400).json({ error: 'No videoId' });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    console.log('📥 Download:', videoId);
    
    // YouTube V2 - הendpoint הנכון!
    const apiUrl = `https://youtube-v2.p.rapidapi.com/video/details?video_id=${videoId}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-v2.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    console.log('📬 Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Got video data');
    
    // Find download links
    let audioUrl = null;
    
    // Check for direct download links
    if (data.download_links) {
      // Find audio link
      const audioLink = data.download_links.find(link => 
        link.format && (link.format.includes('audio') || link.format.includes('m4a'))
      );
      audioUrl = audioLink?.url;
    }
    
    // Fallback: check streaming data
    if (!audioUrl && data.streamingData?.adaptiveFormats) {
      const audioFormat = data.streamingData.adaptiveFormats.find(f => 
        f.mimeType && f.mimeType.includes('audio') && f.url
      );
      audioUrl = audioFormat?.url;
    }
    
    if (!audioUrl) {
      console.error('❌ No audio URL found');
      throw new Error('No audio URL available');
    }
    
    console.log('🎵 Found audio URL');
    console.log('⬇️ Downloading...');
    
    // Download audio
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    console.log('✅ Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    
    // Determine content type
    const contentType = audioUrl.includes('.m4a') || audioUrl.includes('mp4') 
      ? 'audio/mp4' 
      : 'audio/webm';
    
    // Send audio
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);
    
    console.log('✅ Complete!');

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'YouTube V2 download failed'
    });
  }
}
