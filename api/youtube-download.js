// /api/youtube-download.js
// YouTube audio download using YouTube MP3 API

export const config = {
  maxDuration: 60,
};

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

    console.log('📥 Downloading audio for:', videoId);
    
    // YouTube MP3 API - simple structure
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const rapidUrl = `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`;
    
    // First request - get MP3 link
    const rapidRes = await fetch(rapidUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    if (!rapidRes.ok) {
      const errorText = await rapidRes.text();
      console.error('❌ RapidAPI error:', rapidRes.status, errorText);
      throw new Error(`RapidAPI failed: ${rapidRes.status}`);
    }
    
    const rapidData = await rapidRes.json();
    
    // Log full response
    console.log('📦 Full Response:', JSON.stringify(rapidData, null, 2));
    console.log('📦 Status:', rapidData.status);
    console.log('📦 Message:', rapidData.msg);
    
    // Handle processing status
    if (rapidData.status === 'processing') {
      console.log('⏳ Video is processing, waiting 1 second...');
      
      // Wait 1 second and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const retryRes = await fetch(rapidUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY
        }
      });
      
      if (!retryRes.ok) {
        throw new Error(`Retry failed: ${retryRes.status}`);
      }
      
      const retryData = await retryRes.json();
      console.log('📦 Retry Response:', JSON.stringify(retryData, null, 2));
      
      if (retryData.status === 'processing') {
        return res.status(202).json({ 
          error: 'Video still processing, please try again',
          status: 'processing'
        });
      }
      
      Object.assign(rapidData, retryData);
    }
    
    // Check for errors
    if (rapidData.status === 'fail') {
      console.error('❌ Conversion failed:', rapidData.msg);
      throw new Error(rapidData.msg || 'Conversion failed');
    }
    
    // Extract MP3 link
    const audioUrl = rapidData.link;
    
    console.log('🔍 Found audio URL:', audioUrl ? 'YES' : 'NO');
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('Available fields:', Object.keys(rapidData));
      throw new Error('No audio URL in response');
    }
    
    // Download the actual MP3 file
    console.log('⬇️ Downloading from:', audioUrl.substring(0, 100) + '...');
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
    
    // Return audio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
