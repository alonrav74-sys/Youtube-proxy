// api/whisper-transcribe.js
// Fixed version with proper timestamp parsing

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId', success: false });
    }
    
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: 'API key not configured', success: false });
    }
    
    console.log('🎤 [WHISPER] Starting transcription for:', videoId);
    
    // Build YouTube URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // The working endpoint: GET /transcribe?url=...
    const apiUrl = `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${encodeURIComponent(youtubeUrl)}`;
    
    console.log('📡 [WHISPER] Calling API...');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'speech-to-text-ai.p.rapidapi.com'
      }
    });
    
    console.log('📡 [WHISPER] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [WHISPER] API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Whisper API failed',
        details: errorText,
        success: false
      });
    }
    
    const data = await response.json();
    console.log('📦 [WHISPER] Response data:', JSON.stringify(data).substring(0, 500));
    
    // ⭐ Convert chunks to segments with proper timestamp parsing
    const segments = [];
    if (data.chunks && Array.isArray(data.chunks)) {
      console.log(`📝 [WHISPER] Processing ${data.chunks.length} chunks...`);
      
      for (let i = 0; i < data.chunks.length; i++) {
        const chunk = data.chunks[i];
        
        // Parse timestamps - ensure they're numbers
        const offset = parseFloat(chunk.offset || chunk.start || 0);
        const duration = parseFloat(chunk.duration || chunk.dur || 0);
        const end = offset + duration;
        
        // Skip empty chunks
        if (!chunk.text || !chunk.text.trim()) continue;
        
        const segment = {
          text: chunk.text.trim(),
          start: offset,
          end: end
        };
        
        segments.push(segment);
        
        // Log first few segments for debugging
        if (i < 3) {
          console.log(`   Segment ${i}:`, segment);
        }
      }
      
      console.log(`✅ [WHISPER] Created ${segments.length} segments with timestamps`);
      
      // Verify timestamps exist
      const hasTimestamps = segments.some(s => s.start > 0 || s.end > 0);
      if (!hasTimestamps) {
        console.warn('⚠️ [WHISPER] WARNING: All timestamps are 0!');
      } else {
        console.log('✅ [WHISPER] Timestamps verified - first:', segments[0], 'last:', segments[segments.length - 1]);
      }
    } else {
      console.warn('⚠️ [WHISPER] No chunks in response');
    }
    
    // Get full text
    const text = data.text || segments.map(s => s.text).join(' ');
    
    const result = {
      success: true,
      text: text,
      segments: segments,
      language: data.lang || data.language || 'unknown',
      duration: parseFloat(data.duration || 0)
    };
    
    console.log('✅ [WHISPER] Success! Returning', segments.length, 'segments');
    
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('💥 [WHISPER] Server error:', error);
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: error.message,
      success: false
    });
  }
}
