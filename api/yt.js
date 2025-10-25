// api/yt.js
// Vercel Serverless Function for searching YouTube videos

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
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        error: 'Missing search query',
        example: '/api/yt?q=adele+hello'
      });
    }
    
    console.log(`Searching YouTube for: ${q}`);
    
    // Use YouTube's autocomplete/search suggestions (no API key needed)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    
    // Simple mock response for now - replace with actual scraping if needed
    const mockResults = [
      {
        id: 'dQw4w9WgXcQ',
        title: q,
        author: 'YouTube',
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg'
      }
    ];
    
    return res.status(200).json(mockResults);
    
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
}
