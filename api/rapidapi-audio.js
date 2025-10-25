export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const videoId = req.query.videoId;
  
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId' });
    return;
  }
  
  const key = process.env.RAPIDAPI_KEY;
  
  if (!key) {
    res.status(500).json({ error: 'No API key' });
    return;
  }
  
  try {
    const r = await fetch('https://youtube-mp36.p.rapidapi.com/dl?id=' + videoId, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
      }
    });
    
    const data = await r.json();
    const url = data.link || data.url;
    
    if (url) {
      res.json({ success: true, audioUrl: url });
    } else {
      res.status(500).json({ error: 'No URL', data: data });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
