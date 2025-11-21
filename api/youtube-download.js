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

    console.log('🎵 Downloading YouTube audio:', videoId);

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ YouTube to Mp3 API
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Try POST method with JSON body
    console.log('📡 Sending POST request to YouTube to Mp3 API...');
    
    const response = await fetch('https://youtube-to-mp3-api.p.rapidapi.com/api/youtube-video', {
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'youtube-to-mp3-api.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: [videoUrl]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ RapidAPI error:', errorText);
      throw new Error(`RapidAPI failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Response keys:', Object.keys(data));
    console.log('📦 Response data:', JSON.stringify(data).substring(0, 300));

    // ✅ Extract audio URL from response
    let downloadUrl = null;
    
    // Check if response has audio_medias
    if (data.audio_medias && Array.isArray(data.audio_medias) && data.audio_medias.length > 0) {
      // Get first audio (usually best quality)
      downloadUrl = data.audio_medias[0].url;
      console.log('✅ Found audio URL in audio_medias');
    } else if (data.url) {
      downloadUrl = data.url;
      console.log('✅ Found audio URL in data.url');
    } else if (data.download_url) {
      downloadUrl = data.download_url;
      console.log('✅ Found audio URL in data.download_url');
    }
    
    if (!downloadUrl) {
      console.error('❌ No audio URL found in response:', JSON.stringify(data));
      throw new Error('No audio URL in API response');
    }

    console.log('✅ Got audio download URL');

    // ✅ Download the MP3 file
    console.log('⬇️ Downloading MP3...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded MP3:', sizeInMB, 'MB');

    // ✅ Return MP3 to client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
