export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  try {
    const { videoId } = req.query;
    if (!videoId) {
      return res.status(400).json({ error: 'No videoId' });
    }

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    console.log('📥 Download:', videoId);
    
    // YouTube V2
    const apiUrl = `https://youtube-v2.p.rapidapi.com/video/details?video_id=${videoId}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'youtube-v2.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    console.log('📬 Status:', response.status);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Got video data');
    
    // DEBUG: Print the entire response structure
    console.log('🔍 Response keys:', Object.keys(data).join(', '));
    console.log('🔍 Full response (first 500 chars):', JSON.stringify(data).substring(0, 500));
    
    // Try multiple ways to find audio URL
    let audioUrl = null;
    
    // Method 1: download_links
    if (data.download_links && Array.isArray(data.download_links)) {
      console.log('🔍 Found download_links array');
      const audioLink = data.download_links.find(link => 
        link.format && (link.format.includes('audio') || link.format.includes('m4a') || link.format.includes('mp3'))
      );
      if (audioLink) {
        audioUrl = audioLink.url || audioLink.link;
        console.log('✅ Found audio in download_links');
      }
    }
    
    // Method 2: streamingData
    if (!audioUrl && data.streamingData?.adaptiveFormats) {
      console.log('🔍 Checking streamingData');
      const audioFormat = data.streamingData.adaptiveFormats.find(f => 
        f.mimeType && f.mimeType.includes('audio') && f.url
      );
      if (audioFormat) {
        audioUrl = audioFormat.url;
        console.log('✅ Found audio in streamingData');
      }
    }
    
    // Method 3: formats array
    if (!audioUrl && data.formats && Array.isArray(data.formats)) {
      console.log('🔍 Checking formats array');
      const audioFormat = data.formats.find(f => 
        f.mimeType && f.mimeType.includes('audio') && f.url
      );
      if (audioFormat) {
        audioUrl = audioFormat.url;
        console.log('✅ Found audio in formats');
      }
    }
    
    // Method 4: direct fields
    if (!audioUrl) {
      console.log('🔍 Checking direct fields');
      audioUrl = data.audioUrl || data.audio_url || data.downloadUrl || data.download_url;
      if (audioUrl) {
        console.log('✅ Found audio in direct fields');
      }
    }
    
    if (!audioUrl) {
      console.error('❌ No audio URL found after all attempts');
      console.error('📦 Available data:', JSON.stringify(data, null, 2).substring(0, 1000));
      throw new Error('No audio URL available - check logs for response structure');
    }
    
    console.log('🎵 Audio URL found:', audioUrl.substring(0, 100) + '...');
    console.log('⬇️ Downloading...');
    
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
    
    const contentType = audioUrl.includes('.m4a') || audioUrl.includes('mp4') 
      ? 'audio/mp4' 
      : 'audio/webm';
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', audioBuffer.length);
    res.status(200).send(audioBuffer);
    
    console.log('✅ Complete!');

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'Check Vercel logs for full response structure'
    });
  }
}
