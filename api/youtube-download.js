// /api/youtube-download.js
// YouTube audio download using YouTube MP3 API (youtube-mp36)
// With multiple retries and extended timeout

export const config = {
  maxDuration: 60, // Vercel max timeout
};

// Configuration constants
const MAX_RETRIES = 5; // Number of retry attempts
const RETRY_DELAY = 2000; // 2 seconds between retries
const FETCH_TIMEOUT = 30000; // 30 seconds timeout for each request

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
      console.error('❌ No videoId provided');
      return res.status(400).json({ error: 'No videoId' });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      console.error('❌ RAPIDAPI_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('📥 Downloading audio for videoId:', videoId);
    console.log('🔑 Using RapidAPI Key:', RAPIDAPI_KEY.substring(0, 10) + '...');
    console.log('⚙️ Max retries:', MAX_RETRIES);
    console.log('⚙️ Retry delay:', RETRY_DELAY, 'ms');
    console.log('⚙️ Fetch timeout:', FETCH_TIMEOUT, 'ms');
    
    // YouTube MP3 API endpoint
    const rapidUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;
    console.log('🌐 API URL:', rapidUrl);
    
    // Helper function: fetch with timeout
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
    
    // Helper function: wait/sleep
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Try to get MP3 link with retries
    let rapidData = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n🔄 Attempt ${attempt}/${MAX_RETRIES}`);
        console.log('📡 Sending request to YouTube MP3 API...');
        
        const rapidRes = await fetchWithTimeout(rapidUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        }, FETCH_TIMEOUT);
        
        console.log('📬 Response status:', rapidRes.status);
        
        if (!rapidRes.ok) {
          const errorText = await rapidRes.text();
          console.error(`❌ Attempt ${attempt} failed with status ${rapidRes.status}`);
          console.error('Error body:', errorText);
          lastError = new Error(`API returned ${rapidRes.status}: ${errorText}`);
          
          // If not last attempt, wait and retry
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
            await sleep(RETRY_DELAY);
            continue;
          } else {
            throw lastError;
          }
        }
        
        rapidData = await rapidRes.json();
        
        console.log('📦 Response received');
        console.log('📦 Status field:', rapidData.status);
        console.log('📦 Message field:', rapidData.msg);
        
        // Check status
        if (rapidData.status === 'fail') {
          console.error(`❌ Attempt ${attempt}: API returned fail status`);
          console.error('Message:', rapidData.msg);
          lastError = new Error(`API Error: ${rapidData.msg || 'Conversion failed'}`);
          
          // If not last attempt, wait and retry
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
            await sleep(RETRY_DELAY);
            continue;
          } else {
            throw lastError;
          }
        }
        
        // Handle "processing" status
        if (rapidData.status === 'processing') {
          console.log(`⏳ Attempt ${attempt}: Video is still processing...`);
          
          // If not last attempt, wait longer and retry
          if (attempt < MAX_RETRIES) {
            const processingDelay = RETRY_DELAY * 1.5; // Wait longer for processing
            console.log(`⏳ Waiting ${processingDelay}ms before retry...`);
            await sleep(processingDelay);
            continue;
          } else {
            console.log('⏳ Max retries reached, video still processing');
            return res.status(202).json({ 
              error: 'Video still processing after multiple attempts',
              status: 'processing',
              message: 'The video is taking longer than expected to convert. Please try again later.',
              attempts: attempt
            });
          }
        }
        
        // If we got here with status "ok", break the retry loop
        if (rapidData.status === 'ok') {
          console.log(`✅ Attempt ${attempt}: Success!`);
          break;
        }
        
        // Unknown status
        console.warn(`⚠️ Attempt ${attempt}: Unknown status "${rapidData.status}"`);
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await sleep(RETRY_DELAY);
          continue;
        }
        
      } catch (error) {
        console.error(`❌ Attempt ${attempt} threw error:`, error.message);
        lastError = error;
        
        // If not last attempt, wait and retry
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await sleep(RETRY_DELAY);
          continue;
        } else {
          throw error;
        }
      }
    }
    
    // If we exhausted all retries without success
    if (!rapidData || rapidData.status !== 'ok') {
      console.error('❌ All retry attempts exhausted');
      throw lastError || new Error('Failed to get valid response after all retries');
    }
    
    console.log('📦 Full Response:', JSON.stringify(rapidData, null, 2));
    
    // Extract MP3 link - try multiple possible field names
    const audioUrl = rapidData.link || 
                     rapidData.download || 
                     rapidData.url || 
                     rapidData.download_link || 
                     rapidData.downloadLink ||
                     rapidData.audio_url ||
                     rapidData.audioUrl ||
                     rapidData.mp3 ||
                     rapidData.file ||
                     rapidData.dlink ||
                     (rapidData.data && rapidData.data.link) ||
                     (rapidData.data && rapidData.data.url);
    
    console.log('🔍 Searching for audio URL in response...');
    console.log('🔍 Found audio URL:', audioUrl ? 'YES ✅' : 'NO ❌');
    
    if (audioUrl) {
      console.log('🎵 Audio URL:', audioUrl.substring(0, 100) + '...');
    }
    
    if (!audioUrl) {
      console.error('❌ No audio URL found in response!');
      console.error('Available fields:', Object.keys(rapidData));
      console.error('Full response:', JSON.stringify(rapidData, null, 2));
      throw new Error('No audio URL in response - API may have changed format');
    }
    
    // Download the actual MP3 file with retries
    let audioBuffer = null;
    lastError = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`\n⬇️ Download attempt ${attempt}/${MAX_RETRIES}`);
        console.log('📥 Downloading from:', audioUrl.substring(0, 100) + '...');
        
        const audioRes = await fetchWithTimeout(audioUrl, {
          method: 'GET'
        }, FETCH_TIMEOUT);
        
        console.log('📥 Audio response status:', audioRes.status);
        console.log('📥 Audio content-type:', audioRes.headers.get('content-type'));
        console.log('📥 Audio content-length:', audioRes.headers.get('content-length'));
        
        if (!audioRes.ok) {
          console.error(`❌ Download attempt ${attempt} failed with status ${audioRes.status}`);
          lastError = new Error(`Download failed: ${audioRes.status}`);
          
          // If not last attempt, wait and retry
          if (attempt < MAX_RETRIES) {
            console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
            await sleep(RETRY_DELAY);
            continue;
          } else {
            throw lastError;
          }
        }
        
        console.log('📦 Converting audio response to buffer...');
        audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        
        console.log('✅ Audio downloaded successfully!');
        console.log('📊 Buffer size:', audioBuffer.length, 'bytes');
        console.log('📊 Size in MB:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
        
        // Success, break the retry loop
        break;
        
      } catch (error) {
        console.error(`❌ Download attempt ${attempt} threw error:`, error.message);
        lastError = error;
        
        // If not last attempt, wait and retry
        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await sleep(RETRY_DELAY);
          continue;
        } else {
          throw error;
        }
      }
    }
    
    // If we exhausted all download retries
    if (!audioBuffer) {
      console.error('❌ All download retry attempts exhausted');
      throw lastError || new Error('Failed to download audio after all retries');
    }
    
    // Return audio with proper headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    console.log('✅ Sending audio to client...');
    res.status(200).send(audioBuffer);
    console.log('✅ Done!');

  } catch (error) {
    console.error('💥 Fatal Error occurred!');
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: 'Check server logs for more information',
      tip: 'The video may be too long, unavailable, or the API is temporarily down. Please try again later.'
    });
  }
}
