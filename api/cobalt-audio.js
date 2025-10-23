module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    console.log(`🎵 Downloading via Cobalt: ${videoId}`);
    
    // Call Cobalt API
    const response = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: youtubeUrl,
        vCodec: 'h264',
        vQuality: '720',
        aFormat: 'mp3',
        isAudioOnly: true
      })
    });

    const data = await response.json();

    if (data.status === 'redirect' || data.status === 'tunnel') {
      // Success - return the audio URL
      return res.json({
        success: true,
        videoId: videoId,
        audioUrl: data.url,
        method: 'cobalt'
      });
    } else {
      throw new Error(data.text || 'Failed to get audio from Cobalt');
    }

  } catch (error) {
    console.error('Cobalt error:', error);
    res.status(500).json({ 
      error: 'Failed to download audio',
      message: error.message 
    });
  }
};
