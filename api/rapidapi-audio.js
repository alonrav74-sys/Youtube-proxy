// api/rapidapi-audio.js
// Vercel Serverless Function for downloading YouTube audio via RapidAPI

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
        example: '/api/rapidapi-audio?videoId=dQw4w9WgXcQ'
      });
    }
    
    // RapidAPI configuration
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    const RAPIDAPI_HOST = 'youtube-mp36.p.rapidapi.com';
    
    if (!RAPIDAPI_KEY || RAPIDAPI_KEY === 'YOUR_KEY_HERE') {
      console.error('❌ RAPIDAPI_KEY not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        details: 'RAPIDAPI_KEY not set in environment variables'
      });
    }
    
    console.log(`🎵 Fetching audio for video: ${videoId}`);
    
    // Call RapidAPI
    const apiUrl = `https://${RAPIDAPI_HOST}/dl?id=${videoId}`;
    console.log(`📡 Calling: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });
    
    console.log(`📥 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ RapidAPI error:', response.status, errorText);
      
      // Return more helpful error messages
      if (response.status === 403) {
        return res.status(403).json({ 
          error: 'API key invalid or quota exceeded',
          details: 'Check your RapidAPI subscription and key',
          status: 403
        });
      }
      
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('📦 RapidAPI response:', JSON.stringify(data, null, 2));
    
    // Extract audio URL from different possible response formats
    let audioUrl = null;
    
    // Try different property names
    if (data.link) audioUrl = data.link;
    else if (data.url) audioUrl = data.url;
    else if (data.dlink) audioUrl = data.dlink;
    else if (data.download) audioUrl = data.download;
    else if (data.downloadUrl) audioUrl = data.downloadUrl;
    else if (data.audio) audioUrl = data.audio;
    else if (data.mp3) audioUrl = data.mp3;
    
    if (!audioUrl) {
      console.error('❌ No audio URL found in response');
      console.error('Response keys:', Object.keys(data));
      return res.status(500).json({ 
        error: 'No audio URL found in API response',
        availableKeys: Object.keys(data),
        response: data
      });
    }
    
    console.log(`✅ Audio URL found: ${audioUrl}`);
    
    // Return the audio URL
    return res.status(200).json({ 
      success: true,
      audioUrl: audioUrl,
      url: audioUrl, // backward compatibility
      videoId: videoId,
      title: data.title || 'Unknown',
      duration: data.duration || null,
      originalResponse: process.env.NODE_ENV === 'development' ? data : undefined
    });
    
  } catch (error) {
    console.error('❌ Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('RapidAPI error:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'RapidAPI request failed',
        status: response.status,
        details: errorText
      });
    }
    
    const data = await response.json();
    console.log('RapidAPI response:', data);
    
    // Extract audio URL from different possible response formats
    const audioUrl = data.link || data.url || data.dlink || data.download;
    
    if (!audioUrl) {
      console.error('No audio URL in response:', data);
      return res.status(500).json({ 
        error: 'No audio URL found in response',
        response: data
      });
    }
    
    // Return the audio URL
    return res.status(200).json({ 
      success: true,
      url: audioUrl,
      videoId: videoId,
      title: data.title || 'Unknown'
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
