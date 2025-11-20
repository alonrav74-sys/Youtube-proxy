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

    const API_KEY = process.env.API_NINJAS_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'API_NINJAS_KEY not configured' });
    }

    console.log('📥 Starting download for:', videoId);
    console.log('🔑 Using API Ninjas');
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Get download URL from API Ninjas
    let downloadUrl = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${MAX_RETRIES}`);
        
        const apiUrl = `https://api.api-ninjas.com/v1/youtubemp3?video_id=${videoId}`;
        
        const apiRes = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'X-Api-Key': API_KEY
          }
        });
        
        console.log('📬 API Status:', apiRes.status);
        
        if (!apiRes.ok) {
          const errorText = await apiRes.text();
          console.error('❌ API Error:', errorText);
          
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`API Ninjas error: ${apiRes.status}`);
        }
        
        const data = await apiRes.json();
        console.log('📦 API Response keys:', Object.keys(data).join(', '));
        
        // API Ninjas returns: { download_url: "..." }
        downloadUrl = data.download_url || data.url || data.link;
        
        if (!downloadUrl) {
          console.error('❌ No download URL in response');
          console.error('Response:', JSON.stringify(data, null, 2));
          
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error('No download URL from API Ninjas');
        }
        
        console.log('✅ Got download URL');
        break;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!downloadUrl) {
      throw new Error('Failed to get download URL after all retries');
    }
    
    // Download the audio file
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`⬇️ Download attempt ${attempt}/${MAX_RETRIES}`);
        console.log('🎵 URL:', downloadUrl.substring(0, 100) + '...');
        
        const audioRes = await fetch(downloadUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        console.log('📥 Download status:', audioRes.status);
        
        if (!audioRes.ok) {
          console.error('❌ Download failed:', audioRes.status);
          
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
        console.log('📊 Size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        break;
        
      } catch (error) {
        console.error(`❌ Download attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
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
      details: 'API Ninjas download failed',
      suggestion: 'Check server logs or try again'
    });
  }
}
