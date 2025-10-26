// api/test-whisper-endpoints.js
// This endpoint tests all possible Whisper API combinations and returns what works

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const { videoId } = req.query;
  
  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId' });
  }
  
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  
  if (!RAPIDAPI_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const results = [];
  
  // All possible endpoint combinations to test
  const testCases = [
    // Endpoint 1: /transcribe with url
    {
      name: 'POST /transcribe with url',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/transcribe',
      body: { url: youtubeUrl, language: 'he' }
    },
    // Endpoint 2: /transcribe with videoId
    {
      name: 'POST /transcribe with videoId',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/transcribe',
      body: { videoId: videoId, language: 'he' }
    },
    // Endpoint 3: /youtube
    {
      name: 'POST /youtube with url',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/youtube',
      body: { url: youtubeUrl }
    },
    // Endpoint 4: /youtube with videoId
    {
      name: 'POST /youtube with videoId',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/youtube',
      body: { videoId: videoId }
    },
    // Endpoint 5: /youtube-transcribe
    {
      name: 'POST /youtube-transcribe with url',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/youtube-transcribe',
      body: { url: youtubeUrl }
    },
    // Endpoint 6: /speech-to-text
    {
      name: 'POST /speech-to-text with url',
      method: 'POST',
      endpoint: 'https://speech-to-text-ai.p.rapidapi.com/speech-to-text',
      body: { url: youtubeUrl, language: 'he' }
    },
    // Endpoint 7: GET with query params
    {
      name: 'GET /transcribe?url=...',
      method: 'GET',
      endpoint: `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${encodeURIComponent(youtubeUrl)}`,
      body: null
    }
  ];
  
  // Test each endpoint
  for (const test of testCases) {
    try {
      console.log(`🧪 Testing: ${test.name}`);
      
      const options = {
        method: test.method,
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'speech-to-text-ai.p.rapidapi.com'
        }
      };
      
      if (test.body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(test.body);
      }
      
      const response = await fetch(test.endpoint, options);
      const statusCode = response.status;
      
      let responseData;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }
      
      results.push({
        test: test.name,
        endpoint: test.endpoint,
        method: test.method,
        body: test.body,
        statusCode: statusCode,
        success: statusCode >= 200 && statusCode < 300,
        response: responseData
      });
      
      console.log(`   Status: ${statusCode}`);
      
      // If successful, return immediately!
      if (statusCode >= 200 && statusCode < 300) {
        console.log('   ✅ SUCCESS! Found working endpoint!');
        return res.status(200).json({
          success: true,
          workingEndpoint: test.name,
          result: responseData,
          allTests: results
        });
      }
      
    } catch (error) {
      results.push({
        test: test.name,
        endpoint: test.endpoint,
        error: error.message,
        success: false
      });
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  // None worked - return all results for debugging
  return res.status(200).json({
    success: false,
    message: 'No working endpoint found. Check results for clues.',
    allTests: results
  });
}
