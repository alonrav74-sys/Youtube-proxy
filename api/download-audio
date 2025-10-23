const ytdl = require('ytdl-core');

module.exports = async (req, res) => {
  // Enable CORS
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
    console.log(`🎵 Downloading audio: ${videoId}`);
    
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
    
    console.log(`✅ Found format: ${bestAudio.mimeType}, bitrate: ${bestAudio.audioBitrate}`);
    
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.webm"`);
    
    const audioStream = ytdl(videoId, {
      quality: 'highestaudio',
      filter: 'audioonly',
      format: bestAudio
    });
    
    audioStream.pipe(res);
    
    audioStream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ 
      error: 'Failed to download audio',
      message: error.message 
    });
  }
};
