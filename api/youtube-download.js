export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  console.log('🚀 ========================================');
  console.log('🚀 YOUTUBE MP3 DOWNLOADER API STARTED');
  console.log('🚀 ========================================');
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('📝 Request method:', req.method);
  console.log('📝 Request URL:', req.url);
  console.log('📝 Request query:', JSON.stringify(req.query));
  console.log('📝 Request headers:', JSON.stringify(req.headers));
  
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request - returning 200');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    console.log('❌ Invalid method:', req.method);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { videoId } = req.query;
    console.log('📦 Extracted videoId:', videoId);
    console.log('📦 videoId type:', typeof videoId);
    console.log('📦 videoId length:', videoId ? videoId.length : 0);
    
    if (!videoId) {
      console.log('❌ No videoId provided in query');
      return res.status(400).json({ success: false, error: 'videoId required' });
    }

    console.log('🎵 ========================================');
    console.log('🎵 STARTING DOWNLOAD FOR:', videoId);
    console.log('🎵 ========================================');

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    console.log('🔑 Checking API Key...');
    console.log('🔑 API Key exists:', !!RAPIDAPI_KEY);
    console.log('🔑 API Key length:', RAPIDAPI_KEY ? RAPIDAPI_KEY.length : 0);
    console.log('🔑 API Key first 15 chars:', RAPIDAPI_KEY ? RAPIDAPI_KEY.substring(0, 15) + '...' : 'N/A');
    
    if (!RAPIDAPI_KEY) {
      console.log('❌ RAPIDAPI_KEY not found in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ YouTube MP3 Audio Video Downloader API (PRO - HIGH QUALITY)
    const apiUrl = `https://youtube-mp3-audio-video-downloader.p.rapidapi.com/download-mp3/${videoId}?quality=high`;
    
    console.log('📡 ========================================');
    console.log('📡 CALLING RAPIDAPI');
    console.log('📡 ========================================');
    console.log('📡 API URL:', apiUrl);
    console.log('📡 API Host: youtube-mp3-audio-video-downloader.p.rapidapi.com');
    console.log('📡 Quality: high (PRO plan)');
    console.log('⏰ Request start time:', new Date().toISOString());
    
    const requestHeaders = {
      'x-rapidapi-host': 'youtube-mp3-audio-video-downloader.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY
    };
    
    console.log('📤 Request headers:', JSON.stringify({
      'x-rapidapi-host': requestHeaders['x-rapidapi-host'],
      'x-rapidapi-key': RAPIDAPI_KEY.substring(0, 15) + '...'
    }));
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: requestHeaders
    });

    console.log('📬 ========================================');
    console.log('📬 API RESPONSE RECEIVED');
    console.log('📬 ========================================');
    console.log('⏰ Response time:', new Date().toISOString());
    console.log('📬 Response status:', response.status);
    console.log('📬 Response statusText:', response.statusText);
    console.log('📬 Response ok:', response.ok);
    console.log('📬 Response type:', response.type);
    console.log('📬 Response redirected:', response.redirected);
    
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log('📬 Response headers:', JSON.stringify(responseHeaders, null, 2));

    if (!response.ok) {
      console.log('❌ ========================================');
      console.log('❌ API ERROR');
      console.log('❌ ========================================');
      console.log('❌ Status code:', response.status);
      
      const errorText = await response.text();
      console.log('❌ Error response length:', errorText.length);
      console.log('❌ Error response (full):', errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.log('❌ Error JSON parsed:', JSON.stringify(errorJson, null, 2));
      } catch {
        console.log('❌ Error response is not JSON');
      }
      
      throw new Error(`API failed: ${response.status} - ${errorText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    console.log('📦 ========================================');
    console.log('📦 ANALYZING RESPONSE');
    console.log('📦 ========================================');
    console.log('📦 Content-Type:', contentType);
    console.log('📦 Content-Length:', response.headers.get('content-length'));

    // If it's a direct stream (audio file)
    if (contentType && contentType.includes('audio')) {
      console.log('✅ Response is direct audio stream!');
      console.log('⬇️ Downloading audio buffer...');
      
      const audioBuffer = await response.arrayBuffer();
      const sizeInBytes = audioBuffer.byteLength;
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);
      const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
      
      console.log('✅ ========================================');
      console.log('✅ AUDIO DOWNLOADED SUCCESSFULLY');
      console.log('✅ ========================================');
      console.log('📊 Size (bytes):', sizeInBytes);
      console.log('📊 Size (KB):', sizeInKB);
      console.log('📊 Size (MB):', sizeInMB);

      const needsCompression = audioBuffer.byteLength > 15 * 1024 * 1024;
      console.log('🗜️ Max allowed size: 15 MB');
      console.log('🗜️ Needs compression:', needsCompression);
      
      console.log('📤 Setting response headers...');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.byteLength);
      res.setHeader('X-Audio-Size-MB', sizeInMB);
      res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
      
      console.log('🎉 ========================================');
      console.log('🎉 SUCCESS - SENDING AUDIO TO CLIENT');
      console.log('🎉 ========================================');
      
      return res.status(200).send(Buffer.from(audioBuffer));
    }
    
    // If it's JSON response with download link
    console.log('📥 Response is JSON, parsing...');
    const data = await response.json();
    
    console.log('📦 ========================================');
    console.log('📦 PARSED JSON RESPONSE');
    console.log('📦 ========================================');
    console.log('📦 Response type:', typeof data);
    console.log('📦 Response keys:', Object.keys(data));
    console.log('📦 Full response:', JSON.stringify(data, null, 2));

    // Extract download URL from various possible fields
    console.log('🔍 Searching for download URL...');
    console.log('🔍 Checking data.download_url:', !!data.download_url);
    console.log('🔍 Checking data.url:', !!data.url);
    console.log('🔍 Checking data.link:', !!data.link);
    console.log('🔍 Checking data.downloadLink:', !!data.downloadLink);
    console.log('🔍 Checking data.mp3:', !!data.mp3);
    
    let downloadUrl = data.download_url || data.url || data.link || data.downloadLink || data.mp3;
    
    if (!downloadUrl) {
      console.log('❌ No download URL found in any expected field');
      console.log('❌ Available fields:', Object.keys(data));
      throw new Error('No download URL in API response');
    }

    console.log('✅ Found download URL!');
    console.log('✅ URL length:', downloadUrl.length);
    console.log('✅ URL (first 100 chars):', downloadUrl.substring(0, 100));

    // Download the audio file
    console.log('⬇️ ========================================');
    console.log('⬇️ DOWNLOADING AUDIO FROM URL');
    console.log('⬇️ ========================================');
    console.log('⬇️ Fetching from:', downloadUrl.substring(0, 150) + '...');
    console.log('⏰ Download start:', new Date().toISOString());
    
    const audioResponse = await fetch(downloadUrl);
    
    console.log('📬 Download response status:', audioResponse.status);
    console.log('📬 Download response ok:', audioResponse.ok);
    console.log('📬 Download content-type:', audioResponse.headers.get('content-type'));
    console.log('📬 Download content-length:', audioResponse.headers.get('content-length'));
    
    if (!audioResponse.ok) {
      console.log('❌ Audio download failed');
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    console.log('📥 Reading audio buffer...');
    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInBytes = audioBuffer.byteLength;
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);
    const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
    
    console.log('✅ ========================================');
    console.log('✅ AUDIO DOWNLOADED SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log('⏰ Download end:', new Date().toISOString());
    console.log('📊 Size (bytes):', sizeInBytes);
    console.log('📊 Size (KB):', sizeInKB);
    console.log('📊 Size (MB):', sizeInMB);

    const MAX_SIZE = 15 * 1024 * 1024;
    const needsCompression = audioBuffer.byteLength > MAX_SIZE;
    console.log('🗜️ Max allowed size:', (MAX_SIZE / 1024 / 1024).toFixed(2), 'MB');
    console.log('🗜️ Needs compression:', needsCompression);
    
    console.log('📤 Setting response headers...');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    console.log('🎉 ========================================');
    console.log('🎉 SUCCESS - SENDING AUDIO TO CLIENT');
    console.log('🎉 ========================================');
    console.log('🎉 Total size:', sizeInMB, 'MB');
    console.log('🎉 Compression needed:', needsCompression);
    
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('💥 ========================================');
    console.error('💥 ERROR OCCURRED');
    console.error('💥 ========================================');
    console.error('💥 Error type:', error.constructor.name);
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    
    try {
      console.error('💥 Error details (JSON):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    } catch {
      console.error('💥 Could not stringify error');
    }
    
    console.error('💥 ========================================');
    
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      errorType: error.constructor.name
    });
  }
}
