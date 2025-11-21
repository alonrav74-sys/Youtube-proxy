export const config = {
  maxDuration: 60,
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const FETCH_TIMEOUT = 30000;

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
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Helper: fetch with timeout
    const fetchWithTimeout = async (url, options, timeoutMs) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timeout);
        return response;
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    };
    
    // Step 1: Get download info
    let downloadData = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Info attempt ${attempt}/${MAX_RETRIES}`);
        
        const apiUrl = `https://ab.cococococ.com/ajax/download.php?format=mp3&url=${encodeURIComponent(videoUrl)}`;
        
        const apiRes = await fetchWithTimeout(apiUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://loader.to/',
            'Accept': 'application/json'
          }
        }, FETCH_TIMEOUT);
        
        console.log('API status:', apiRes.status);
        
        if (!apiRes.ok) {
          throw new Error(`API error: ${apiRes.status}`);
        }
        
        downloadData = await apiRes.json();
        console.log('Response keys:', Object.keys(downloadData).join(', '));
        console.log('Success:', downloadData.success);
        
        if (downloadData.success) {
          break;
        }
        
        if (attempt < MAX_RETRIES) {
          console.log(`Waiting ${RETRY_DELAY}ms...`);
          await sleep(RETRY_DELAY);
        }
        
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!downloadData || !downloadData.success) {
      throw new Error('Failed to get download info');
    }
    
    const downloadUrl = downloadData.download;
    
    if (!downloadUrl) {
      throw new Error('No download URL');
    }
    
    console.log('🔍 Found audio URL: YES');
    console.log('🎵 URL:', downloadUrl.substring(0, 100) + '...');
    
    // Step 2: Download audio with retries
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`⬇️ Download attempt ${attempt}/${MAX_RETRIES}`);
        
        const audioRes = await fetchWithTimeout(downloadUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://loader.to/',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          }
        }, FETCH_TIMEOUT);
        
        console.log('📥 Download status:', audioRes.status);
        console.log('📥 Content-Type:', audioRes.headers.get('content-type'));
        console.log('📥 Content-Length:', audioRes.headers.get('content-length'));
        
        if (!audioRes.ok) {
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        console.log('📦 Converting to buffer...');
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
        console.log('📊 Size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        break;
        
      } catch (error) {
        console.error(`❌ Download attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!audioBuffer) {
      throw new Error('Failed to download audio after all retries');
    }
    
    // Send audio to client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    console.log('✅ Sending to client...');
    res.status(200).send(audioBuffer);
    console.log('✅ Complete!');

  } catch (error) {
    console.error('💥 Final error:', error.message);
    console.error('💥 Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: 'Download failed. Check server logs.'
    });
  }
}
