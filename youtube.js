// Vercel Serverless Function - YouTube Metadata
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }

  try {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'RapidAPI key not configured' });
    }

    const response = await fetch(
      `https://youtube-media-downloader.p.rapidapi.com/v2/video/details?videoId=${videoId}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'youtube-media-downloader.p.rapidapi.com'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    return res.status(200).json({
      title: data.title,
      author: data.channelTitle,
      lengthSeconds: data.lengthSeconds,
      thumbnail: data.thumbnail?.[0]?.url
    });

  } catch (error) {
    console.error('YouTube API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch YouTube data',
      details: error.message 
    });
  }
}
