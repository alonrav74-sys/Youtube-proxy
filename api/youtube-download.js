export const config = {
  maxDuration: 300,
};

// Helper: wait function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(req, res) {
  console.log('🚀 === YOUTUBE DOWNLOAD (RETRY LOGIC) ===');
  
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

    console.log('🎵 VideoId:', videoId);

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ youtube-video-info1 with retry
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apiUrl = `https://youtube-video-info1.p.rapidapi.com/youtube-info/?url=${encodeURIComponent(videoUrl)}`;
    
    const maxRetries = 3;
    let downloadUrl = null;
    
    // Try up to 3 times
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📡 Attempt ${attempt}/${maxRetries}...`);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'youtube-video-info1.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        });
        
        console.log('📬 Status:', response.status);
        
        // If 429 - wait and retry
        if (response.status === 429) {
          const waitTime = attempt * 5000; // 5s, 10s, 15s
          console.log(`⏳ Rate limit! Waiting ${waitTime/1000}s...`);
          
          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue;
          } else {
            throw new Error('Rate limit after 3 tries');
          }
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.log('❌ Error:', errorText);
          throw new Error(`API failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Got data');
        
        downloadUrl = data.download_url || data.url || data.audio_url || data.link;
        
        if (downloadUrl) {
          console.log('✅ Found URL!');
          break;
        } else {
          throw new Error('No download URL');
        }
        
      } catch (error) {
        console.log(`❌ Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log('⏳ Waiting 3s...');
          await sleep(3000);
        } else {
          throw error;
        }
      }
    }
    
    if (!downloadUrl) {
      throw new Error('Failed after all retries');
    }

    // Download
    console.log('⬇️ Downloading...');
    const audioResponse = await fetch(downloadUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInMB = (audioBuffer.byteLength / 1024 / 1024).toFixed(2);
    console.log('✅ Downloaded:', sizeInMB, 'MB');

    const needsCompression = audioBuffer.byteLength > 15 * 1024 * 1024;
    
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    console.log('🎉 Success!');
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 Error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
