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
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Step 1: Get download URL from RapidAPI
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const rapidUrl = `https://yt-search-and-download-mp3.p.rapidapi.com/mp3?url=${encodeURIComponent(videoUrl)}`;
    
    console.log('🔗 Full video URL:', videoUrl);
    console.log('🔗 RapidAPI URL:', rapidUrl);
    console.log('🔑 API Key present:', !!RAPIDAPI_KEY);
    console.log('🔑 API Key length:', RAPIDAPI_KEY.length);
    
    console.log('📡 Calling RapidAPI...');
    const rapidStartTime = Date.now();
    
    const rapidRes = await fetch(rapidUrl, {
      headers: {
        'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    const rapidDuration = Date.now() - rapidStartTime;
    console.log('⏱️ RapidAPI response time:', rapidDuration + 'ms');
    console.log('📬 RapidAPI status:', rapidRes.status);
    console.log('📬 RapidAPI statusText:', rapidRes.statusText);
    console.log('📬 RapidAPI headers:', JSON.stringify([...rapidRes.headers.entries()]));
    
    if (!rapidRes.ok) {
      const errorBody = await rapidRes.text();
      console.error('❌ RapidAPI error body:', errorBody);
      throw new Error(`RapidAPI failed: ${rapidRes.status} - ${errorBody}`);
    }
    
    const rapidData = await rapidRes.json();
    console.log('📦 Response keys:', Object.keys(rapidData).join(', '));
    console.log('📦 Response success:', rapidData.success);
    console.log('📦 Response title:', rapidData.title);
    console.log('📦 Response type:', rapidData.type);
    console.log('📦 Response size:', rapidData.size);
    console.log('📦 Full JSON response:', JSON.stringify(rapidData, null, 2));
    
    const audioUrl = rapidData.download || rapidData.link || rapidData.url;
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('📋 Available keys:', Object.keys(rapidData));
      throw new Error('No audio URL in response');
    }
    
    console.log('✅ Found audio URL');
    console.log('🎵 Audio URL (full):', audioUrl);
    console.log('🎵 Audio URL domain:', new URL(audioUrl).hostname);
    
    // Step 2: Download audio with detailed logging
    let audioBuffer = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n⬇️ ===== DOWNLOAD ATTEMPT ${attempt}/${MAX_RETRIES} =====`);
        console.log('⏰ Start time:', new Date().toISOString());
        
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          console.log('⚠️ TIMEOUT - Aborting request after', FETCH_TIMEOUT + 'ms');
          controller.abort();
        }, FETCH_TIMEOUT);
        
        console.log('📡 Fetching audio from:', audioUrl.substring(0, 100) + '...');
        const downloadStartTime = Date.now();
        
        const audioRes = await fetch(audioUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://loader.to/',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          }
        });
        
        clearTimeout(timeout);
        const fetchDuration = Date.now() - downloadStartTime;
        
        console.log('⏱️ Fetch completed in:', fetchDuration + 'ms');
        console.log('📥 Download status:', audioRes.status);
        console.log('📥 Download statusText:', audioRes.statusText);
        console.log('📥 Content-Type:', audioRes.headers.get('content-type'));
        console.log('📥 Content-Length:', audioRes.headers.get('content-length'));
        console.log('📥 All headers:', JSON.stringify([...audioRes.headers.entries()]));
        
        if (!audioRes.ok) {
          const errorBody = await audioRes.text();
          console.error('❌ Download error body:', errorBody.substring(0, 500));
          throw new Error(`Download failed: ${audioRes.status} - ${audioRes.statusText}`);
        }
        
        console.log('📦 Converting to buffer...');
        const bufferStartTime = Date.now();
        
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        const bufferDuration = Date.now() - bufferStartTime;
        console.log('⏱️ Buffer conversion took:', bufferDuration + 'ms');
        console.log('📊 Buffer size (bytes):', audioBuffer.length);
        console.log('📊 Buffer size (MB):', (audioBuffer.length / 1024 / 1024).toFixed(2));
        console.log('✅ Download successful!');
        break;
        
      } catch (error) {
        console.error(`\n❌ ===== ATTEMPT ${attempt} FAILED =====`);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        if (error.name === 'AbortError') {
          console.error('⚠️ Request was aborted (timeout)');
        } else if (error.message.includes('ENOTFOUND')) {
          console.error('⚠️ DNS lookup failed - domain not found');
        } else if (error.message.includes('ECONNREFUSED')) {
          console.error('⚠️ Connection refused');
        } else if (error.message.includes('ETIMEDOUT')) {
          console.error('⚠️ Connection timeout');
        } else if (error.message.includes('ECONNRESET')) {
          console.error('⚠️ Connection reset');
        }
        
        if (attempt === MAX_RETRIES) {
          console.error('💥 All retry attempts exhausted');
          throw new Error(`Download failed after ${MAX_RETRIES} attempts: ${error.message}`);
        }
        
        console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
        await sleep(RETRY_DELAY);
      }
    }
    
    if (!audioBuffer) {
      throw new Error('Failed to download audio - no buffer created');
    }
    
    console.log('\n📤 ===== SENDING RESPONSE =====');
    console.log('📤 Content-Type: audio/mpeg');
    console.log('📤 Content-Length:', audioBuffer.length);
    
    // Return audio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    res.status(200).send(audioBuffer);
    
    console.log('✅ ===== COMPLETE SUCCESS =====\n');

  } catch (error) {
    console.error('\n💥 ===== FATAL ERROR =====');
    console.error('💥 Error name:', error.name);
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    console.error('💥 Time:', new Date().toISOString());
    
    res.status(500).json({ 
      error: error.message,
      errorType: error.name,
      timestamp: new Date().toISOString()
    });
  }
}
