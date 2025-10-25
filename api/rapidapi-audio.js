// ✅ קובץ מתוקן לחלוטין ל־Vercel (Node 18+)
import fetch from 'node-fetch';

export default async function handler(req, res) {
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
    return res.status(400).json({ error: 'Missing videoId parameter', success: false });
  }

  console.log(`🎵 Starting download for videoId: ${videoId}`);

  const maxAttempts = 5;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`📡 Attempt ${attempt}/${maxAttempts}`);
    try {
      const response = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || 'a637ca7180msh850c76189325e37p117845jsn7fb712822d79',
          'X-RapidAPI-Host': 'youtube-mp36.p.rapidapi.com'
        }
      });

      if (!response.ok) throw new Error(`RapidAPI status ${response.status}`);

      const data = await response.json();
      console.log(`📦 Response:`, data);

      if (data.status === 'ok' && data.link) {
        return res.status(200).json({
          success: true,
          videoId,
          title: data.title || 'YouTube Audio',
          url: data.link,
          audio: data.link,
          method: 'rapidapi',
          duration: data.duration || null
        });
      }

      if (data.status === 'processing' && attempt < maxAttempts) {
        console.log(`⏳ Processing... retry in ${retryDelay}ms`);
        await new Promise(r => setTimeout(r, retryDelay));
        continue;
      }

      if (data.status === 'fail') {
        return res.status(400).json({
          success: false,
          error: data.msg || 'RapidAPI failed',
          videoId
        });
      }

    } catch (err) {
      console.error(`❌ Attempt ${attempt} error:`, err.message);
      if (attempt === maxAttempts) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch audio',
          message: err.message
        });
      }
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
}
