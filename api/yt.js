// api/yt.js
// Vercel Serverless Function for searching YouTube videos (direct scraping)

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
    const { q, limit = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        error: 'Missing search query',
        example: '/api/yt?q=adele+hello'
      });
    }
    
    console.log(`🔍 Searching YouTube for: "${q}"`);
    
    // Search YouTube directly using their internal API
    const searchUrl = `https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00'
          }
        },
        query: q
      })
    });
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Extract video results
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const videoResults = [];
    
    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      
      for (const item of items) {
        const videoRenderer = item?.videoRenderer;
        if (!videoRenderer) continue;
        
        const videoId = videoRenderer.videoId;
        const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || '';
        const channel = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.shortBylineText?.runs?.[0]?.text || '';
        const thumbnail = videoRenderer.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        
        videoResults.push({
          id: videoId,
          videoId: videoId,
          title: title,
          author: channel,
          channel: channel,
          thumbnail: thumbnail.split('?')[0], // Remove query params
          duration: videoRenderer.lengthText?.simpleText || '',
          viewCount: videoRenderer.viewCountText?.simpleText || ''
        });
        
        if (videoResults.length >= parseInt(limit)) break;
      }
      
      if (videoResults.length >= parseInt(limit)) break;
    }
    
    console.log(`✅ Found ${videoResults.length} results`);
    
    if (videoResults.length === 0) {
      return res.status(200).json([]);
    }
    
    return res.status(200).json(videoResults);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: 'Failed to search YouTube'
    });
  }
}
