import ytdl from '@distube/ytdl-core';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.query;
    if (!videoId) {
      return res.status(400).json({ error: 'No videoId' });
    }

    console.log('📥 Download:', videoId);
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get video info
    console.log('🔍 Getting video info...');
    const info = await ytdl.getInfo(videoUrl);
    
    console.log('📦 Video title:', info.videoDetails.title);
    
    // Get audio formats
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    if (audioFormats.length === 0) {
      throw new Error('No audio formats available');
    }
    
    console.log('🎵 Found', audioFormats.length, 'audio formats');
    
    // Get highest quality audio
    const audioFormat = audioFormats.reduce((prev, current) => {
      return (prev.audioBitrate > current.audioBitrate) ? prev : current;
    });
    
    console.log('✅ Selected format:', audioFormat.mimeType, audioFormat.audioBitrate + 'kbps');
    
    const audioUrl = audioFormat.url;
    
    if (!audioUrl) {
      throw new Error('No audio URL');
    }
    
    console.log('⬇️ Downloading audio...');
    
    // Download audio
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    console.log('✅ Downloaded:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    
    // Determine content type
    const mimeType = audioFormat.mimeType.split(';')[0];
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.audio"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    console.log('✅ Sending to client...');
    res.status(200).send(audioBuffer);
    console.log('✅ Complete!');

  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error('💥 Stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: 'ytdl-core download failed'
    });
  }
}
