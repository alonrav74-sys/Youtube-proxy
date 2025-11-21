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

    console.log('🎵 Downloading YouTube audio as MP3:', videoId);

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ Use Video & Audio Downloader API
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apiUrl = `https://video-audio-downloader1.p.rapidapi.com/api/video/info?url=${encodeURIComponent(videoUrl)}`;
    
    console.log('📡 Step 1: Getting video info...');
    
    const infoResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'video-audio-downloader1.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });

    if (!infoResponse.ok) {
      const errorText = await infoResponse.text();
      console.error('❌ RapidAPI error:', errorText);
      throw new Error(`RapidAPI failed: ${infoResponse.status}`);
    }

    const data = await infoResponse.json();
    console.log('📦 Response keys:', Object.keys(data));

    // ✅ Find MP3 download link
    let downloadUrl = null;
    
    // Check for formats array
    if (data.formats && Array.isArray(data.formats)) {
      // Look for audio-only MP3 or best audio format
      const audioFormat = data.formats.find(f => 
        (f.format && f.format.toLowerCase().includes('audio')) ||
        (f.type && f.type.toLowerCase().includes('audio')) ||
        (f.ext && f.ext.toLowerCase() === 'mp3')
      );
      
      if (audioFormat) {
        downloadUrl = audioFormat.url || audioFormat.download_url;
      }
    }
    
    // Fallback: check direct fields
    if (!downloadUrl) {
      downloadUrl = data.audio_url || data.mp3_url || data.download_url || data.url;
    }
    
    if (!downloadUrl) {
      console.error('❌ No download URL found:', JSON.stringify(data).substring(0, 500));
      throw new Error('No download URL in API response');
    }

    console.log('✅ Got download URL');

    // ✅ Download the audio file
    console.log('⬇️ Step 2: Downloading audio...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded:', sizeInMB, 'MB');

    // ✅ Return audio to client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
