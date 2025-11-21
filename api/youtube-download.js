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

    console.log('🎵 Downloading YouTube audio (128kbps MP3):', videoId);

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ YouTube MP3 2025 API - Use video ID with quality
    const apiUrl = `https://cdn-ytb.zm.io.vn/sse-client/download?id=${videoId}&quality=128kbps`;
    
    console.log('📡 Getting download link from YouTube MP3 2025...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'cdn-ytb.zm.io.vn',
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

    // ✅ Extract MP3 download link
    const downloadUrl = data.linkDownload;
    
    if (!downloadUrl) {
      console.error('❌ No linkDownload in response:', JSON.stringify(data));
      
      // Check for error in response
      if (data.error) {
        throw new Error(`API error: ${data.error}`);
      }
      
      throw new Error('No download link in API response');
    }

    console.log('✅ Got MP3 download link');

    // ✅ Download the MP3 file
    console.log('⬇️ Downloading MP3...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded MP3:', sizeInMB, 'MB (128kbps)');

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
