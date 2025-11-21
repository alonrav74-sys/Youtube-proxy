export const config = {
  maxDuration: 60,
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const FETCH_TIMEOUT = 30000;

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

    console.log('📥 ===== START DOWNLOAD =====');
    console.log('📥 VideoId:', videoId);
    console.log('📥 Time:', new Date().toISOString());
    console.log('🔑 API Key present:', !!RAPIDAPI_KEY);
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Step 1: Get download URL from RapidAPI (M4A - fastest)
    const rapidUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/get_m4a_download_link/${videoId}`;
    
    console.log('🔗 RapidAPI URL:', rapidUrl);
    console.log('📡 Calling RapidAPI...');
    
    const rapidStartTime = Date.now();
    
    const rapidRes = await fetch(rapidUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    const rapidDuration = Date.now() - rapidStartTime;
    console.log('⏱️ RapidAPI response time:', rapidDuration + 'ms');
    console.log('📬 RapidAPI status:', rapidRes.status);
    console.log('📬 RapidAPI statusText:', rapidRes.statusText);
    console.log('📬 Content-Type:', rapidRes.headers.get('content-type'));
    
    if (!rapidRes.ok) {
      const errorBody = await rapidRes.text();
      console.error('❌ RapidAPI error:', errorBody);
      throw new Error(`RapidAPI failed: ${rapidRes.status} - ${errorBody}`);
    }
    
    const rapidData = await rapidRes.json();
    console.log('📦 Response keys:', Object.keys(rapidData).join(', '));
    console.log('📦 Full response:', JSON.stringify(rapidData, null, 2));
    
    // Extract download URL
    const audioUrl = rapidData.file || rapidData.url || rapidData.link || rapidData.download;
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('📋 Response data:', JSON.stringify(rapidData));
      throw new Error('No audio URL in response');
    }
    
    console.log('✅ Found audio URL');
    console.log('🎵 URL:', audioUrl);
    console.log('🎵 Domain:', new URL(audioUrl).hostname);
    
    // Step 2: Download audio with retries
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n⬇️ ===== DOWNLOAD ATTEMPT ${attempt}/${MAX_RETRIES} =====`);
        console.log('⏰ Time:', new Date().toISOString());
        
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          console.log('⚠️ TIMEOUT after', FETCH_TIMEOUT + 'ms');
          controller.abort();
        }, FETCH_TIMEOUT);
        
        console.log('📡 Fetching audio...');
        const downloadStartTime = Date.now();
        
        const audioRes = await fetch(audioUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
          }
        });
        
        clearTimeout(timeout);
        const fetchDuration = Date.now() - downloadStartTime;
        
        console.log('⏱️ Fetch time:', fetchDuration + 'ms');
        console.log('📥 Status:', audioRes.status);
        console.log('📥 StatusText:', audioRes.statusText);
        console.log('📥 Content-Type:', audioRes.headers.get('content-type'));
        console.log('📥 Content-Length:', audioRes.headers.get('content-length'));
        
        if (!audioRes.ok) {
          const errorText = await audioRes.text();
          console.error('❌ Download error:', errorText.substring(0, 300));
          throw new Error(`Download failed: ${audioRes.status}`);
        }
        
        console.log('📦 Converting to buffer...');
        const bufferStart = Date.now();
        
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        const bufferTime = Date.now() - bufferStart;
        console.log('⏱️ Buffer time:', bufferTime + 'ms');
        console.log('📊 Size (bytes):', audioBuffer.length);
        console.log('📊 Size (MB):', (audioBuffer.length / 1024 / 1024).toFixed(2));
        console.log('✅ Download SUCCESS!');
        break;
        
      } catch (error) {
        console.error(`\n❌ ===== ATTEMPT ${attempt} FAILED =====`);
        console.error('❌ Error type:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        if (error.name === 'AbortError') {
          console.error('⚠️ Request timeout');
        } else if (error.message.includes('ENOTFOUND')) {
          console.error('⚠️ DNS failed');
        } else if (error.message.includes('ECONNREFUSED')) {
          console.error('⚠️ Connection refused');
        } else if (error.message.includes('ETIMEDOUT')) {
          console.error('⚠️ Connection timeout');
        }
        
        if (attempt === MAX_RETRIES) {
          console.error('💥 All attempts failed');
          throw new Error(`Download failed after ${MAX_RETRIES} attempts: ${error.message}`);
        }
        
        console.log(`⏳ Waiting ${RETRY_DELAY}ms...`);
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!audioBuffer) {
      throw new Error('No audio buffer');
    }
    
    console.log('\n📤 ===== SENDING RESPONSE =====');
    console.log('📤 Content-Type: audio/mp4');
    console.log('📤 Size:', audioBuffer.length);
    
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.m4a"`);
    res.status(200).send(audioBuffer);
    
    console.log('✅ ===== COMPLETE SUCCESS =====\n');

  } catch (error) {
    console.error('\n💥 ===== FATAL ERROR =====');
    console.error('💥 Type:', error.name);
    console.error('💥 Message:', error.message);
    console.error('💥 Stack:', error.stack);
    console.error('💥 Time:', new Date().toISOString());
    
    res.status(500).json({ 
      error: error.message,
      type: error.name
    });
  }
}
