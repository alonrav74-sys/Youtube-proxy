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
    
    // YouTube V2 API
    const apiUrl = `https://youtube-v2.p.rapidapi.com/video/info?video_id=${videoId}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'x-rapidapi-host': 'youtube-v2.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    console.log('📬 Status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Got data');
    
    // Get audio format
    const formats = data.streamingData?.adaptiveFormats || [];
    console.log('📦 Found', formats.length, 'formats');
    
    const audioFormat = formats.find(f => 
      f.mimeType && f.mimeType.includes('audio') && f.url
    );
    
    if (!audioFormat) {
      console.error('❌ No audio format');
      throw new Error('No audio format available');
    }
    
    console.log('🎵 Audio format:', audioFormat.mimeType);
    console.log('⬇️ Downloading...');
    
    // Download audio
    const audioRes = await fetch(audioFormat.url);
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    console.log('✅ Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    
    // Send audio
    res.setHeader('Content-Type', 'audio/webm');
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
