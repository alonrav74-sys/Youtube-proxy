// api/yt.js
// Vercel Serverless Function for searching YouTube videos via RapidAPI

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
    const { q, limit = 10, maxResults = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        error: 'Missing search query',
        example: '/api/yt?q=adele+hello'
      });
    }
    
    console.log(`🔍 Searching YouTube for: "${q}" (limit: ${limit || maxResults})`);
    
    // RapidAPI YouTube Search
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      console.error('❌ RAPIDAPI_KEY not found in environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error: API key missing'
      });
    }
    
    const searchUrl = `https://yt-api.p.rapidapi.com/search?query=${encodeURIComponent(q)}`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'yt-api.p.rapidapi.com'
      }
    });
    
    if (!response.ok) {
      throw new Error(`RapidAPI error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract video results
    const videos = (data.data || [])
      .filter(item => item.type === 'video')
      .slice(0, parseInt(limit || maxResults))
      .map(video => ({
        id: video.videoId,
        videoId: video.videoId,
        title: video.title,
        author: video.channelTitle || video.channelName,
        channel: video.channelTitle || video.channelName,
        thumbnail: video.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`,
        duration: video.lengthText,
        viewCount: video.viewCount
      }));
    
    console.log(`✅ Found ${videos.length} results`);
    
    return res.status(200).json(videos);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: 'Failed to search YouTube via RapidAPI'
    });
  }
}
