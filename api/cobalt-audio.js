// /api/cobalt-audio.js
// Fast YouTube audio download using Cobalt API

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    const { videoId } = req.query;
    
    console.log('='.repeat(60));
    console.log('🎵 Cobalt Audio Download Started');
    console.log('='.repeat(60));
    console.log('📥 Video ID:', videoId || 'Missing');
    
    if (!videoId) {
      return res.status(400).json({ 
        success: false, 
        error: 'No videoId provided' 
      });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log('\n🔗 STEP 1: Requesting audio from Cobalt');
    console.log('-'.repeat(60));
    console.log('   YouTube URL:', youtubeUrl);
    console.log('   Cobalt API: https://api.cobalt.tools/');
    
    const cobaltStart = Date.now();
    
    // Request audio from Cobalt
    const cobaltRes = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: youtubeUrl,
        audioFormat: 'mp3',
        audioBitrate: '128',
        filenameStyle: 'basic',
        downloadMode: 'audio',
      }),
    });
    
    const cobaltTime = Date.now() - cobaltStart;
    console.log('   Response status:', cobaltRes.status);
    console.log('   Response time:', cobaltTime, 'ms');
    
    if (!cobaltRes.ok) {
      const errorText = await cobaltRes.text();
      console.error('❌ Cobalt error:', errorText.substring(0, 500));
      throw new Error(`Cobalt failed: ${cobaltRes.status}`);
    }
    
    const cobaltData = await cobaltRes.json();
    console.log('   Response status:', cobaltData.status);
    
    if (cobaltData.status !== 'success' && cobaltData.status !== 'stream') {
      console.error('❌ Cobalt returned error:', cobaltData);
      throw new Error(cobaltData.error || 'Cobalt processing failed');
    }
    
    // Get audio URL
    const audioUrl = cobaltData.url;
    
    if (!audioUrl) {
      console.error('❌ No audio URL in response:', cobaltData);
      throw new Error('No audio URL from Cobalt');
    }
    
    console.log('✅ Got audio URL from Cobalt!');
    console.log('   URL:', audioUrl.substring(0, 80) + '...');
    
    console.log('\n⬇️  STEP 2: Downloading Audio');
    console.log('-'.repeat(60));
    
    const downloadStart = Date.now();
    
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = await audioRes.arrayBuffer();
    const downloadTime = Date.now() - downloadStart;
    
    console.log('✅ Download complete!');
    console.log('   Size:', audioBuffer.byteLength, 'bytes');
    console.log('   Time:', downloadTime, 'ms');
    
    console.log('\n📊 Total Time:', (Date.now() - cobaltStart), 'ms (⚡ FAST!)');
    console.log('='.repeat(60));
    
    // Return audio directly
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.status(200).send(Buffer.from(audioBuffer));
    
  } catch (error) {
    console.error('\n💥 FATAL ERROR');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('='.repeat(60));
    
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}
