/**
 * Vercel Serverless Function
 * Downloads audio from YouTube video using RapidAPI
 */

export default async function handler(req, res) {
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }
  
  try {
    console.log('Downloading YouTube video:', videoId);
    
    // Use RapidAPI YouTube downloader
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'demo-key';
    const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';
    
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/dl?id=${videoId}`,
      {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`RapidAPI error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.link) {
      throw new Error('No download link returned from API');
    }
    
    console.log('Got download link, fetching audio...');
    
    // Download the actual audio file
    const audioResponse = await fetch(data.link);
    
    if (!audioResponse.ok) {
      throw new Error(`Audio download error: ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Return audio as blob
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));
    
  } catch (error) {
    console.error('YouTube download error:', error);
    res.status(500).json({ 
      error: 'Failed to download YouTube audio',
      message: error.message 
    });
  }
}
