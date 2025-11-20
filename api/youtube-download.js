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

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'RAPIDAPI_KEY not configured' });
    }

    console.log('📥 Starting download for:', videoId);
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Step 1: Get available qualities
    let qualityData = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Quality check attempt ${attempt}/${MAX_RETRIES}`);
        
        // Get video info with qualities
        const infoUrl = `https://youtube-video-fast-downloader.p.rapidapi.com/get-video-info/${videoId}`;
        
        const infoRes = await fetch(infoUrl, {
          headers: {
            'x-rapidapi-host': 'youtube-video-fast-downloader.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        });
        
        console.log('📬 Info status:', infoRes.status);
        
        if (!infoRes.ok) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`API error: ${infoRes.status}`);
        }
        
        qualityData = await infoRes.json();
        console.log('📦 Got quality data');
        break;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt}:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        await sleep(RETRY_DELAY);
      }
    }
    
    // Find audio quality ID
    let audioQualityId = null;
    
    if (qualityData && Array.isArray(qualityData)) {
      // Look for audio format (type: "audio")
      const audioFormat = qualityData.find(q => q.type === 'audio');
      
      if (audioFormat) {
        audioQualityId = audioFormat.id;
        console.log('🎵 Found audio quality ID:', audioQualityId);
      }
    }
    
    if (!audioQualityId) {
      console.error('❌ No audio quality found');
      throw new Error('No audio quality available');
    }
    
    // Step 2: Get download URL
    let downloadUrl = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Download URL attempt ${attempt}/${MAX_RETRIES}`);
        
        const downloadApiUrl = `https://youtube-video-fast-downloader.p.rapidapi.com/download_video/${videoId}?quality=${audioQualityId}`;
        
        const downloadRes = await fetch(downloadApiUrl, {
          headers: {
            'x-rapidapi-host': 'youtube-video-fast-downloader.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        });
        
        console.log('📬 Download info status:', downloadRes.status);
        
        if (!downloadRes.ok) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`Download API error: ${downloadRes.status}`);
        }
        
        const downloadData = await downloadRes.json();
        console.log('📦 Download data keys:', Object.keys(downloadData).join(', '));
        
        // Extract download URL
        downloadUrl = downloadData.file || downloadData.url || downloadData.download_url;
        
        if (downloadUrl) {
          console.log('✅ Got download URL');
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
    
    if (!downloadUrl) {
      throw new Error('No download URL received');
    }
    
    // Step 3: Download the audio file
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
        
        console.log('📥 Audio status:', audioRes.status);
        
        if (!audioRes.ok) {
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`Audio download failed: ${audioRes.status}`);
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
      details: 'YouTube FAST Downloader failed'
    });
  }
}
