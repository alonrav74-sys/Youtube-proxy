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

    // ✅ Try YouTube v3.1 API (Simple yt-dlp wrapper)
    const apiUrl = `https://youtube-v31.p.rapidapi.com/dl?id=${videoId}`;
    
    console.log('📡 Getting download link from YouTube v3.1...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-v31.p.rapidapi.com',
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

    // Extract audio URL from response
    let downloadUrl = null;
    
    // Method 1: Direct link in response
    if (data.link) {
      downloadUrl = data.link;
      console.log('✅ Found link in data.link');
    } 
    // Method 2: Formats array
    else if (data.formats && Array.isArray(data.formats)) {
      // Find audio-only format
      const audioFormat = data.formats.find(f => 
        f.format_note && (f.format_note.toLowerCase().includes('audio') || f.format_note === 'tiny')
      ) || data.formats.find(f => 
        f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
      ) || data.formats[0]; // Fallback to first format
      
      if (audioFormat) {
        downloadUrl = audioFormat.url;
        console.log('✅ Found audio in formats:', audioFormat.format_note || 'unknown');
      }
    }
    // Method 3: Direct URL field
    else if (data.url) {
      downloadUrl = data.url;
      console.log('✅ Found url in data.url');
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

    // Check if compression needed
    const MAX_SIZE = 15 * 1024 * 1024;
    const needsCompression = audioBuffer.byteLength > MAX_SIZE;
    
    // Return audio with headers
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    if (needsCompression) {
      console.log('⚠️ Audio >15MB - client will compress');
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
