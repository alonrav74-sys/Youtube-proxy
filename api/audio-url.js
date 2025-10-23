const ytdl = require('@distube/ytdl-core');

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

  try {
    console.log(`🔗 Extracting URL: ${videoId}`);
    
    if (!ytdl.validateID(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    
    const info = await ytdl.getInfo(videoId);
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (!audioFormats || audioFormats.length === 0) {
      return res.status(404).json({ error: 'No audio formats found' });
    }
    
    const bestAudio = audioFormats.reduce((best, format) => {
      return (format.audioBitrate > best.audioBitrate) ? format : best;
    }, audioFormats[0]);
    
    res.json({
      success: true,
      videoId: videoId,
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      audioUrl: bestAudio.url,
      bitrate: bestAudio.audioBitrate,
      mimeType: bestAudio.mimeType,
      expiresAt: Date.now() + (5 * 60 * 1000)
    });
    
  } catch (error) {
    console.error('URL extraction error:', error);
    res.status(500).json({ 
      error: 'Failed to extract audio URL',
      message: error.message 
    });
  }
};
