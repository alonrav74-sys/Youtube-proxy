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

    // ✅ YouTube to Mp3 API - correct endpoint!
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apiUrl = `https://youtube-to-mp3-api.p.rapidapi.com/?url=${encodeURIComponent(videoUrl)}`;
    
    console.log('📡 Getting audio links from YouTube to Mp3 API...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-to-mp3-api.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ RapidAPI error:', errorText);
      throw new Error(`RapidAPI failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Response keys:', Object.keys(data));

    // ✅ Extract audio URL from audio_medias array
    let downloadUrl = null;
    
    if (data.audio_medias && Array.isArray(data.audio_medias)) {
      // Get MEDIUM or LOW quality (smaller file)
      const audioMedium = data.audio_medias.find(a => a.quality === 'AUDIO_QUALITY_MEDIUM');
      const audioLow = data.audio_medias.find(a => a.quality === 'AUDIO_QUALITY_LOW');
      
      const selectedAudio = audioMedium || audioLow || data.audio_medias[0];
      
      if (selectedAudio) {
        downloadUrl = selectedAudio.url;
        console.log('✅ Selected audio quality:', selectedAudio.quality);
      }
    }
    
    if (!downloadUrl) {
      console.error('❌ No audio URL found:', JSON.stringify(data).substring(0, 500));
      
      if (data.error) {
        throw new Error(`API error: ${data.error}`);
      }
      
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
