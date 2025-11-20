// /api/youtube-download.js
// YouTube audio download using Cloud Api Hub

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
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

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    console.log('📥 Downloading audio for:', videoId);
    
    // Cloud Api Hub - /download endpoint
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const rapidUrl = `https://cloud-api-hub---youtube-downloader.p.rapidapi.com/download?url=${encodeURIComponent(videoUrl)}`;
    
    const rapidRes = await fetch(rapidUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'cloud-api-hub---youtube-downloader.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    if (!rapidRes.ok) {
      const errorText = await rapidRes.text();
      console.error('❌ RapidAPI error:', rapidRes.status, errorText);
      throw new Error(`RapidAPI failed: ${rapidRes.status}`);
    }
    
    const rapidData = await rapidRes.json();
    
    // Log response for debugging
    console.log('📦 Full Response:', JSON.stringify(rapidData, null, 2));
    
    // Cloud Api Hub returns direct download links
    // Look for audio formats
    let audioUrl = null;
    
    // Check different possible structures
    if (rapidData.formats && Array.isArray(rapidData.formats)) {
      // Find audio-only format (usually has no video)
      const audioFormat = rapidData.formats.find(f => 
        f.mimeType && f.mimeType.includes('audio') && !f.hasVideo
      );
      audioUrl = audioFormat?.url;
      
      console.log('🎵 Found audio format:', audioFormat ? 'YES' : 'NO');
    }
    
    // Fallback: check for direct url field
    if (!audioUrl) {
      audioUrl = rapidData.url || 
                 rapidData.downloadUrl || 
                 rapidData.download_url ||
                 rapidData.link ||
                 rapidData.audio_url;
    }
    
    console.log('🔍 Found audio URL:', audioUrl ? 'YES' : 'NO');
    
    if (!audioUrl) {
      console.error('❌ No audio URL found!');
      console.error('Available fields:', Object.keys(rapidData));
      throw new Error('No audio URL in response');
    }
    
    // Download the actual audio file
    console.log('⬇️ Downloading from:', audioUrl.substring(0, 100) + '...');
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Download failed: ${audioRes.status}`);
    }
    
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    
    console.log('✅ Downloaded:', audioBuffer.length, 'bytes');
    
    // Return audio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
