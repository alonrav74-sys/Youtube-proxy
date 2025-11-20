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

    console.log('Download:', videoId);
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Cobalt API - FREE and WORKS!
    const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: videoUrl,
        isAudioOnly: true,
        aFormat: 'mp3',
        filenamePattern: 'basic'
      })
    });
    
    console.log('Cobalt status:', cobaltRes.status);
    
    if (!cobaltRes.ok) {
      throw new Error(`Cobalt error: ${cobaltRes.status}`);
    }
    
    const cobaltData = await cobaltRes.json();
    console.log('Cobalt response:', cobaltData.status);
    
    if (cobaltData.status === 'error') {
      throw new Error(cobaltData.text || 'Cobalt processing error');
    }
    
    if (cobaltData.status === 'rate-limit') {
      throw new Error('Rate limited. Try again in a few seconds.');
    }
    
    const audioUrl = cobaltData.url;
    
    if (!audioUrl) {
      throw new Error('No audio URL from Cobalt');
    }
    
    console.log('Downloading audio...');
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    console.log('Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);
    
    console.log('Success!');

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      suggestion: 'Try again or check if video is available'
    });
  }
}
