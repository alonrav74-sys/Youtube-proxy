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

  const invidiousInstances = [
    'vid.puffyan.us',
    'invidious.slipfox.xyz',
    'inv.nadeko.net',
    'invidious.privacydev.net'
  ];
  
  for (const instance of invidiousInstances) {
    try {
      const response = await fetch(`https://${instance}/api/v1/videos/${videoId}`);
      const data = await response.json();
      
      if (data.adaptiveFormats) {
        const audioFormats = data.adaptiveFormats.filter(f => 
          f.type?.includes('audio') && f.url
        );
        
        if (audioFormats.length > 0) {
          audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          
          return res.json({
            success: true,
            videoId: videoId,
            title: data.title,
            duration: data.lengthSeconds,
            audioUrl: audioFormats[0].url,
            bitrate: audioFormats[0].bitrate,
            instance: instance
          });
        }
      }
    } catch (err) {
      console.warn(`Instance ${instance} failed:`, err.message);
      continue;
    }
  }
  
  res.status(404).json({ error: 'No working instance found' });
};
