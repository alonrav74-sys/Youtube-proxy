module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { videoId } = req.query;
  
  if (!videoId) {
    console.error('❌ Missing videoId parameter');
    return res.status(400).json({ 
      error: 'Missing videoId parameter',
      success: false 
    });
  }

  console.log(`🎵 Starting download for videoId: ${videoId}`);

  try {
    // Retry logic for RapidAPI
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 2000; // 2 seconds
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`📡 Attempt ${attempts}/${maxAttempts} for video: ${videoId}`);
      
      try {
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
          console.error(`❌ RapidAPI HTTP error: ${response.status}`);
          throw new Error(`RapidAPI returned status ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 RapidAPI response (attempt ${attempts}):`, JSON.stringify(data, null, 2));
        
        // SUCCESS: Got the audio link
        if (data.status === 'ok' && data.link) {
          console.log(`✅ Success! Audio link: ${data.link}`);
          
          return res.status(200).json({
            success: true,
            videoId: videoId,
            title: data.title || 'YouTube Audio',
            
            // CRITICAL: Return ALL possible field names for compatibility
            url: data.link,
            audio: data.link,
            audioUrl: data.link,
            downloadUrl: data.link,
            link: data.link,
            
            method: 'rapidapi',
            duration: data.duration || null,
            progress: data.progress || null
          });
        }
        
        // PROCESSING: Wait and retry
        if (data.status === 'processing') {
          console.log(`⏳ Video still processing (attempt ${attempts}/${maxAttempts})`);
          
          if (attempts < maxAttempts) {
            console.log(`⏰ Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue; // Try again
          } else {
            // Max attempts reached while still processing
            console.error(`❌ Max attempts reached - video still processing`);
            return res.status(202).json({
              error: 'Video is still being processed by YouTube',
              message: 'נסה שוב בעוד כמה שניות',
              status: 'processing',
              success: false,
              videoId: videoId
            });
          }
        }
        
        // FAIL: Error from RapidAPI
        if (data.status === 'fail') {
          const errorMsg = data.msg || 'Unknown error from RapidAPI';
          console.error(`❌ RapidAPI failed: ${errorMsg}`);
          
          return res.status(400).json({ 
            error: errorMsg,
            message: data.msg || 'Failed to download from YouTube',
            status: 'fail',
            success: false,
            videoId: videoId
          });
        }
        
        // UNKNOWN STATUS
        console.warn(`⚠️ Unknown status from RapidAPI: ${data.status || 'undefined'}`);
        console.warn('Full response:', data);
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        } else {
          throw new Error(`Unknown response status: ${data.status}`);
        }
        
      } catch (fetchError) {
        console.error(`❌ Fetch error on attempt ${attempts}:`, fetchError.message);
        
        if (attempts >= maxAttempts) {
          throw fetchError;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // Should not reach here, but just in case
    throw new Error(`Failed after ${maxAttempts} attempts`);
    
  } catch (error) {
    console.error('❌ Fatal error in rapidapi-audio:', error);
    
    return res.status(500).json({ 
      error: 'Failed to download audio from YouTube',
      message: error.message || 'Unknown server error',
      success: false,
      videoId: videoId,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
