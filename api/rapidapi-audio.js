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
    console.log(`🎵 Downloading via RapidAPI: ${videoId}`);
    
    // Call YouTube MP3 Download API on RapidAPI
    const response = await fetch(
      `https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': 'a637ca7180msh850c76189325e37p117845jsn7fb712822d79',
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
        }
      }
    );

    const data = await response.json();

    if (data.status === 'ok' && data.link) {
      console.log(`✅ Got audio link: ${data.link}`);
      
      return res.json({
        success: true,
        videoId: videoId,
        title: data.title || 'YouTube Audio',
        audioUrl: data.link,
        method: 'rapidapi'
      });
    } else {
      throw new Error(data.msg || 'Failed to get audio from RapidAPI');
    }

  } catch (error) {
    console.error('RapidAPI error:', error);
    res.status(500).json({ 
      error: 'Failed to download audio',
      message: error.message 
    });
  }
};
