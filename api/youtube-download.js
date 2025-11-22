export const config = {
  maxDuration: 300,
};

export default async function handler(req, res) {
  console.log('🚀 === YOUTUBE DOWNLOAD API STARTED ===');
  console.log('📝 Request method:', req.method);
  console.log('📝 Request query:', JSON.stringify(req.query));
  
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
    console.log('📦 Extracted videoId from query:', videoId);
    
    if (!videoId) {
      console.log('❌ No videoId provided');
      return res.status(400).json({ success: false, error: 'videoId required' });
    }

    console.log('🎵 === STARTING DOWNLOAD FOR VIDEO:', videoId, '===');

    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    console.log('🔑 API Key exists:', !!RAPIDAPI_KEY);
    console.log('🔑 API Key length:', RAPIDAPI_KEY ? RAPIDAPI_KEY.length : 0);
    console.log('🔑 API Key first 10 chars:', RAPIDAPI_KEY ? RAPIDAPI_KEY.substring(0, 10) + '...' : 'N/A');
    
    if (!RAPIDAPI_KEY) {
      console.log('❌ RAPIDAPI_KEY not configured in environment');
      return res.status(500).json({ 
        success: false, 
        error: 'RAPIDAPI_KEY not configured' 
      });
    }

    // ✅ TUBE MP3 API - base URL (no endpoint)
    const apiUrl = 'https://tube-mp31.p.rapidapi.com/';
    console.log('🌐 API URL:', apiUrl);
    
    const requestBody = { videoId: videoId };
    console.log('📤 Request body:', JSON.stringify(requestBody));
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'tube-mp31.p.rapidapi.com',
      'x-rapidapi-key': RAPIDAPI_KEY
    };
    console.log('📤 Request headers:', JSON.stringify({
      'Content-Type': requestHeaders['Content-Type'],
      'x-rapidapi-host': requestHeaders['x-rapidapi-host'],
      'x-rapidapi-key': RAPIDAPI_KEY.substring(0, 10) + '...'
    }));
    
    console.log('📡 === CALLING TUBE MP3 API ===');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
    });

    console.log('📬 === API RESPONSE RECEIVED ===');
    console.log('📬 Response status:', response.status);
    console.log('📬 Response statusText:', response.statusText);
    console.log('📬 Response ok:', response.ok);
    console.log('📬 Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ === API ERROR ===');
      console.log('❌ Status:', response.status);
      console.log('❌ Error text:', errorText);
      console.log('❌ Error text length:', errorText.length);
      throw new Error(`RapidAPI failed: ${response.status} - ${errorText}`);
    }

    console.log('📥 Reading response as JSON...');
    const data = await response.json();
    console.log('📦 === API RESPONSE DATA ===');
    console.log('📦 Response type:', typeof data);
    console.log('📦 Response keys:', Object.keys(data));
    console.log('📦 Full response:', JSON.stringify(data, null, 2));
    console.log('📦 Status field:', data.status);
    console.log('📦 Result field exists:', !!data.result);
    console.log('📦 Result is array:', Array.isArray(data.result));
    console.log('📦 Result length:', data.result ? data.result.length : 0);

    if (data.status !== 'success') {
      console.log('❌ Conversion not successful');
      console.log('❌ Status:', data.status);
      console.log('❌ Error field:', data.error);
      throw new Error('Conversion failed: ' + (data.error || 'Unknown error'));
    }

    console.log('✅ Conversion successful!');
    
    // Extract download URL
    console.log('🔍 Extracting download URL...');
    const downloadUrl = data.result?.[0]?.dlurl;
    console.log('🔍 Download URL exists:', !!downloadUrl);
    console.log('🔍 Download URL:', downloadUrl);
    
    if (!downloadUrl) {
      console.log('❌ No download URL found');
      console.log('❌ Result[0]:', JSON.stringify(data.result?.[0]));
      throw new Error('No download URL in response');
    }

    console.log('✅ Got download URL:', downloadUrl.substring(0, 50) + '...');
    console.log('📝 Video title:', data.result?.[0]?.title);
    console.log('📝 Video ID in response:', data.result?.[0]?.videoId);

    // Download MP3
    console.log('⬇️ === DOWNLOADING MP3 FILE ===');
    console.log('⬇️ Fetching from:', downloadUrl.substring(0, 100));
    console.log('⏰ Download start time:', new Date().toISOString());
    
    const audioResponse = await fetch(downloadUrl);
    
    console.log('📬 Download response status:', audioResponse.status);
    console.log('📬 Download response ok:', audioResponse.ok);
    
    if (!audioResponse.ok) {
      console.log('❌ Download failed with status:', audioResponse.status);
      throw new Error(`Download failed: ${audioResponse.status}`);
    }

    console.log('📥 Reading audio buffer...');
    const audioBuffer = await audioResponse.arrayBuffer();
    const sizeInBytes = audioBuffer.byteLength;
    const sizeInMB = (sizeInBytes / 1024 / 1024).toFixed(2);
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);
    
    console.log('✅ === DOWNLOAD COMPLETE ===');
    console.log('📊 File size (bytes):', sizeInBytes);
    console.log('📊 File size (KB):', sizeInKB);
    console.log('📊 File size (MB):', sizeInMB);
    console.log('⏰ Download end time:', new Date().toISOString());

    // Compression check
    const MAX_SIZE = 15 * 1024 * 1024;
    const needsCompression = audioBuffer.byteLength > MAX_SIZE;
    console.log('🗜️ Max size (MB):', (MAX_SIZE / 1024 / 1024).toFixed(2));
    console.log('🗜️ Needs compression:', needsCompression);
    
    // Set response headers
    console.log('📤 Setting response headers...');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('X-Audio-Size-MB', sizeInMB);
    res.setHeader('X-Needs-Compression', needsCompression ? 'true' : 'false');
    
    console.log('✅ === SENDING MP3 TO CLIENT ===');
    console.log('✅ Content-Type: audio/mpeg');
    console.log('✅ Content-Length:', audioBuffer.byteLength);
    console.log('✅ Size:', sizeInMB, 'MB');
    console.log('🎉 === DOWNLOAD SUCCESSFUL ===');
    
    return res.status(200).send(Buffer.from(audioBuffer));

  } catch (error) {
    console.log('💥 === ERROR OCCURRED ===');
    console.log('💥 Error type:', error.constructor.name);
    console.log('💥 Error message:', error.message);
    console.log('💥 Error stack:', error.stack);
    console.log('💥 Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      errorType: error.constructor.name
    });
  }
}
