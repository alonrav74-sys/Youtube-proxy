// api/rapidapi-transcript.js
// Vercel Serverless Function for fetching YouTube transcripts via RapidAPI

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ 
        error: 'Missing videoId parameter',
        example: '/api/rapidapi-transcript?videoId=dQw4w9WgXcQ'
      });
    }
    
    // RapidAPI configuration for YouTube Transcripts
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'YOUR_KEY_HERE';
    const RAPIDAPI_HOST = 'youtube-transcripts.p.rapidapi.com';
    
    console.log(`Fetching transcript for video: ${videoId}`);
    
    // Call RapidAPI
    const response = await fetch(`https://${RAPIDAPI_HOST}/youtube/transcript?videoId=${videoId}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      
      // If no transcript available, return friendly message
      if (response.status === 404) {
        return res.status(200).json({ 
          error: 'No transcript available',
          text: '🎤 אין תמלול זמין לסרטון זה'
        });
      }
      
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('Transcript response:', data);
    
    // Extract transcript text from different possible formats
    let transcriptText = '';
    
    if (typeof data === 'string') {
      transcriptText = data;
    } else if (data.transcript) {
      transcriptText = data.transcript;
    } else if (data.text) {
      transcriptText = data.text;
    } else if (Array.isArray(data.content)) {
      transcriptText = data.content.map(item => item.text || '').join(' ');
    } else if (Array.isArray(data)) {
      transcriptText = data.map(item => item.text || '').join(' ');
    }
    
    if (!transcriptText) {
      return res.status(200).json({ 
        error: 'No transcript text found',
        text: '🎤 אין תמלול זמין לסרטון זה',
        rawResponse: data
      });
    }
    
    // Return the transcript
    return res.status(200).json({ 
      success: true,
      text: transcriptText.trim(),
      videoId: videoId
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      text: '⚠️ שגיאת שרת בטעינת תמלול'
    });
  }
}
