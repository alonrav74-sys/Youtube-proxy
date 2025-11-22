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

    // ✅ YouTube Search & Download3 API (NEW - 99.5% uptime!)
    const apiUrl = `https://youtube-search-download3.p.rapidapi.com/download?video=${videoId}`;
    
    console.log('📡 Getting download links from youtube-search-download3...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-search-download3.p.rapidapi.com',
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

    // Extract MP3 download URL
    let downloadUrl = null;
    
    if (data.mp3) {
      downloadUrl = data.mp3;
      console.log('✅ Found MP3 URL');
    } else if (data.audio) {
      downloadUrl = data.audio;
      console.log('✅ Found audio URL');
    } else if (data.formats && Array.isArray(data.formats)) {
      const audioFormat = data.formats.find(f => 
        f.mimeType && f.mimeType.includes('audio')
      );
      if (audioFormat) {
        downloadUrl = audioFormat.url;
        console.log('✅ Found audio in formats array');
      }
    }
    
    if (!downloadUrl) {
      console.error('❌ No download URL found:', JSON.stringify(data).substring(0, 500));
      throw new Error('No download URL in API response');
    }

    console.log('✅ Got download URL');

    // Download the audio file
    console.log('⬇️ Downloading audio...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded:', sizeInMB, 'MB');

    // ✅ Add headers to indicate if compression needed
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    const needsCompression = audioBuffer.byteLength > MAX_SIZE;
    
    // Return audio to client with compression info
    const contentType = downloadUrl.includes('.mp3') ? 'audio/mpeg' : 'audio/mp4';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    if (needsCompression) {
      console.log('⚠️ Audio >15MB - client will compress before sending to Groq');
    }
    
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
