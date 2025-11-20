export const config = {
  maxDuration: 60,
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.query;
    if (!videoId) {
      return res.status(400).json({ error: 'No videoId' });
    }

    console.log('📥 Download:', videoId);
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Try Loader.to API (FREE, no API key needed!)
    let downloadData = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${MAX_RETRIES}`);
        
        // Loader.to API
        const apiUrl = `https://ab.cococococ.com/ajax/download.php?format=mp3&url=${encodeURIComponent(videoUrl)}`;
        
        const apiRes = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        console.log('📬 Status:', apiRes.status);
        
        if (!apiRes.ok) {
          throw new Error(`API error: ${apiRes.status}`);
        }
        
        downloadData = await apiRes.json();
        console.log('📦 Response:', downloadData.success ? 'SUCCESS' : 'FAILED');
        
        if (downloadData.success) {
          break;
        }
        
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY);
        }
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt}:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!downloadData || !downloadData.success) {
      throw new Error('Failed to get download link');
    }
    
    const downloadUrl = downloadData.url;
    
    if (!downloadUrl) {
      throw new Error('No download URL');
    }
    
    console.log('⬇️ Downloading audio...');
    
    // Download with retries
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`⬇️ Download attempt ${attempt}/${MAX_RETRIES}`);
        
        const audioRes = await fetch(downloadUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!audioRes.ok) {
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        console.log('✅ Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        break;
        
      } catch (error) {
        console.error(`❌ Download ${attempt}:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!audioBuffer) {
      throw new Error('Failed to download audio');
    }
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    res.status(200).send(audioBuffer);
    
    console.log('✅ Success!');

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      suggestion: 'Try again or check video availability'
    });
  }
}
