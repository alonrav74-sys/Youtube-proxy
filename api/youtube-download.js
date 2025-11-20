// /api/youtube-download.js
// YouTube download using Social Media Video Downloader API (SMVD)

export const config = {
  maxDuration: 60,
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const FETCH_TIMEOUT = 45000;

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
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
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('📥 Starting download for:', videoId);
    
    // Helper functions
    const fetchWithTimeout = async (url, options, timeoutMs) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return response;
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw new Error('Timeout');
        throw error;
      }
    };
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Step 1: Get video details with download links
    let videoData = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n🔄 Attempt ${attempt}/${MAX_RETRIES}`);
        
        // Using the /youtube/v3/video/details endpoint
        const apiUrl = `https://social-media-video-downloader.p.rapidapi.com/youtube/v3/video/details?videoId=${videoId}`;
        
        console.log('📡 Calling SMVD API...');
        
        const response = await fetchWithTimeout(apiUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'social-media-video-downloader.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        }, FETCH_TIMEOUT);
        
        console.log('📬 Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ API error:', response.status, errorText);
          
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms...`);
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`API error: ${response.status}`);
        }
        
        videoData = await response.json();
        console.log('📦 Response received');
        console.log('📦 Keys:', Object.keys(videoData).join(', '));
        
        break;
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt}:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        console.log(`⏳ Waiting ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
    
    // Step 2: Extract audio download URL
    console.log('🔍 Searching for audio URL...');
    
    let audioUrl = null;
    
    // Check for formats array
    if (videoData.formats && Array.isArray(videoData.formats)) {
      console.log('📦 Found formats array with', videoData.formats.length, 'items');
      
      // Find audio-only format (typically itag 140 for m4a or 251 for webm)
      const audioFormats = videoData.formats.filter(f => 
        f.mimeType && f.mimeType.includes('audio') && !f.hasVideo
      );
      
      console.log('🎵 Found', audioFormats.length, 'audio formats');
      
      if (audioFormats.length > 0) {
        // Prefer m4a (itag 140) or highest quality
        const preferredFormat = audioFormats.find(f => f.itag === 140) || audioFormats[0];
        audioUrl = preferredFormat.url;
        console.log('✅ Selected format:', preferredFormat.itag, preferredFormat.mimeType);
      }
    }
    
    // Fallback: check other possible fields
    if (!audioUrl) {
      audioUrl = videoData.downloadUrl || 
                 videoData.download_url ||
                 videoData.url ||
                 videoData.link ||
                 videoData.audioUrl ||
                 (videoData.data && videoData.data.url);
    }
    
    console.log('🔍 Audio URL found:', audioUrl ? 'YES ✅' : 'NO ❌');
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('Available fields:', Object.keys(videoData));
      console.error('Sample data:', JSON.stringify(videoData).substring(0, 500));
      throw new Error('No audio URL in response');
    }
    
    console.log('🎵 Audio URL:', audioUrl.substring(0, 100) + '...');
    
    // Step 3: Download audio
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n⬇️ Download attempt ${attempt}/${MAX_RETRIES}`);
        
        const audioRes = await fetchWithTimeout(audioUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }, FETCH_TIMEOUT);
        
        console.log('📥 Download status:', audioRes.status);
        console.log('📥 Content-Type:', audioRes.headers.get('content-type'));
        console.log('📥 Content-Length:', audioRes.headers.get('content-length'));
        
        if (!audioRes.ok) {
          console.error('❌ Download failed:', audioRes.status);
          
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms...`);
            await sleep(RETRY_DELAY);
            continue;
          }
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        console.log('📦 Converting to buffer...');
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
        console.log('📊 Size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        
        break;
        
      } catch (error) {
        console.error(`❌ Download attempt ${attempt}:`, error.message);
        if (attempt === MAX_RETRIES) throw error;
        console.log(`⏳ Waiting ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!audioBuffer) {
      throw new Error('Failed to download audio after all retries');
    }
    
    // Step 4: Return audio
    const contentType = audioUrl.includes('.m4a') || audioUrl.includes('audio/mp4') 
      ? 'audio/mp4' 
      : 'audio/mpeg';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.${contentType === 'audio/mp4' ? 'm4a' : 'mp3'}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    console.log('✅ Sending to client...');
    res.status(200).send(audioBuffer);
    console.log('✅ Complete!');

  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error('💥 Stack:', error.stack);
    
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to download audio. Check server logs.',
      tip: 'Make sure you are subscribed to the Social Media Video Downloader API on RapidAPI'
    });
  }
}
```

---

## ✅ **מה לעשות עכשיו:**

1. **הרשם ל-API** אם עדיין לא:
   - לך ל: https://rapidapi.com/movieapinew/api/social-media-video-downloader
   - לחץ **Subscribe to Test**
   - בחר **BASIC** ($0/חודש - 100 requests) או **PRO**

2. **העתק את ה-API Key**:
   - אחרי ההרשמה, העתק את `X-RapidAPI-Key`

3. **עדכן את `.env`**:
```
   RAPIDAPI_KEY=your_new_key_here
