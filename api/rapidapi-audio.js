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
    console.log(`🎵 Downloading via RapidAPI: ${videoId}`);
    
    // Retry logic for RapidAPI (sometimes returns "processing")
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts}/${maxAttempts}`);
      
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

      if (!response.ok) {
        throw new Error(`RapidAPI HTTP error: ${response.status}`);
      }

      const data = await response.json();
      console.log('RapidAPI response:', JSON.stringify(data, null, 2));
      
      // SUCCESS: Got the audio link
      if (data.status === 'ok' && data.link) {
        console.log(`✅ Got audio link: ${data.link}`);
        
        return res.json({
          success: true,
          videoId: videoId,
          title: data.title || 'YouTube Audio',
          url: data.link,           // CRITICAL: Add 'url' field
          audio: data.link,          // CRITICAL: Add 'audio' field
          audioUrl: data.link,       // Keep for compatibility
          downloadUrl: data.link,    // Add for compatibility
          method: 'rapidapi',
          duration: data.duration || null
        });
      }
      
      // PROCESSING: Wait and retry
      if (data.status === 'processing') {
        console.log(`⏳ Video still processing, waiting 2s...`);
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      // FAIL: Video not found or other error
      if (data.status === 'fail') {
        const errorMsg = data.msg || 'Unknown error from RapidAPI';
        console.error(`❌ RapidAPI failed: ${errorMsg}`);
        return res.status(400).json({ 
          error: errorMsg,
          videoId: videoId,
          success: false
        });
      }
      
      // UNKNOWN STATUS
      console.warn(`⚠️ Unknown status: ${data.status}`);
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
    }
    
    // Max attempts reached
    throw new Error(`Failed after ${maxAttempts} attempts - video still processing`);
    
  } catch (error) {
    console.error('RapidAPI error:', error);
    return res.status(500).json({ 
      error: 'Failed to download audio from YouTube',
      message: error.message,
      videoId: videoId,
      success: false
    });
  }
};
