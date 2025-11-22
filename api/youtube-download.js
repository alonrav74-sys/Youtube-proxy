export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'videoId required' });
    }

    console.log('🎵 Downloading YouTube audio (MP3):', videoId);

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ TUBE MP3 API - POST with videoId in body
    const apiUrl = 'https://tube-mp31.p.rapidapi.com/json';
    
    console.log('📡 Requesting MP3 from TUBE MP3 API...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'tube-mp31.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      },
      body: JSON.stringify({
        videoId: videoId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ RapidAPI error:', errorText);
      throw new Error(`RapidAPI failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 API Response status:', data.status);

    if (data.status !== 'success') {
      throw new Error('Conversion failed: ' + (data.error || 'Unknown error'));
    }

    // Extract download URL from result
    const downloadUrl = data.result?.[0]?.dlurl;
    
    if (!downloadUrl) {
      console.error('❌ No download URL:', JSON.stringify(data));
      throw new Error('No download URL in response');
    }

    console.log('✅ Got MP3 URL');

    // Download MP3
    console.log('⬇️ Downloading MP3...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded:', sizeInMB, 'MB');

    // Compression check
    const needsCompression = audioBuffer.byteLength > 15 * 1024 * 1024;
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
