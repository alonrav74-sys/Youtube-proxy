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
    
    // Try the YT Search and Download MP3 API
    const rapidUrl = `https://yt-search-and-download-mp3.p.rapidapi.com/mp3?videoId=${videoId}`;
    
    console.log('🔗 API URL:', rapidUrl);
    
    const rapidRes = await fetch(rapidUrl, {
      headers: {
        'x-rapidapi-host': 'yt-search-and-download-mp3.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    console.log('📬 Status:', rapidRes.status);
    console.log('📬 Status Text:', rapidRes.statusText);
    
    if (!rapidRes.ok) {
      const errorText = await rapidRes.text();
      console.error('❌ Error response:', errorText);
      throw new Error(`RapidAPI failed: ${rapidRes.status} - ${errorText}`);
    }
    
    const rapidData = await rapidRes.json();
    
    // Log EVERYTHING
    console.log('📦 Full Response:', JSON.stringify(rapidData, null, 2));
    console.log('📦 Response keys:', Object.keys(rapidData).join(', '));
    
    // Find audio URL
    const audioUrl = rapidData.download || 
                     rapidData.link || 
                     rapidData.url || 
                     rapidData.download_link || 
                     rapidData.downloadLink ||
                     rapidData.audio_url ||
                     rapidData.audioUrl ||
                     rapidData.mp3 ||
                     rapidData.file ||
                     rapidData.dlink;
    
    console.log('🔍 Found audio URL:', audioUrl ? 'YES' : 'NO');
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('📋 Available fields:', Object.keys(rapidData));
      console.error('📋 Full data:', JSON.stringify(rapidData));
      throw new Error('No audio URL in response');
    }
    
    console.log('🎵 Audio URL:', audioUrl.substring(0, 100) + '...');
    console.log('⬇️ Downloading...');
    
    // Download audio with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 sec timeout
    
    try {
      const audioRes = await fetch(audioUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      clearTimeout(timeout);
      
      console.log('📥 Download status:', audioRes.status);
      
      if (!audioRes.ok) {
        throw new Error(`Download failed: ${audioRes.status}`);
      }
      
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      
      console.log('✅ Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
      
      // Return audio
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.status(200).send(audioBuffer);
      
      console.log('✅ Complete!');
      
    } catch (fetchError) {
      clearTimeout(timeout);
      throw fetchError;
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error('💥 Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: 'Check Vercel logs for details'
    });
  }
}
