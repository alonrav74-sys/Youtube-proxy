// api/rapidapi-audio.js
// Vercel Serverless Function for downloading YouTube audio via RapidAPI

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ 
        error: 'Missing videoId parameter',
        example: '/api/rapidapi-audio?videoId=dQw4w9WgXcQ'
      });
    }
    
    // RapidAPI configuration
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_KEY_HERE';
    const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';
    
    console.log(`Fetching audio for video: ${videoId}`);
    
    // Call RapidAPI
    const response = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('RapidAPI response:', data);
    
    // Extract audio URL from different possible response formats
    const audioUrl = data.link || data.url || data.dlink || data.download;
    
    if (!audioUrl) {
      console.error('No audio URL in response:', data);
      return res.status(500).json({ 
        error: 'No audio URL found in response',
        response: data
      });
    }
    
    // Return the audio URL
    return res.status(200).json({ 
      success: true,
      url: audioUrl,
      videoId: videoId,
      title: data.title || 'Unknown'
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
