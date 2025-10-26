// api/whisper-transcribe.js
// FIXED: Request word-level timestamps and split into smaller segments

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
    
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Try to get word-level timestamps
    const apiUrl = `https://speech-to-text-ai.p.rapidapi.com/transcribe?url=${encodeURIComponent(youtubeUrl)}&word_timestamps=true&chunk_length=10`;
    
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
    console.log('📦 [WHISPER] Processing chunks...');
    
    // Split chunks into smaller segments (5 words each)
    const segments = [];
    
    if (data.chunks && Array.isArray(data.chunks)) {
      console.log(`📝 [WHISPER] Processing ${data.chunks.length} chunks...`);
      
      for (const chunk of data.chunks) {
        const offset = parseFloat(chunk.offset || chunk.start || 0);
        const duration = parseFloat(chunk.duration || chunk.dur || 0);
        const end = offset + duration;
        const text = (chunk.text || '').trim();
        
        if (!text) continue;
        
        // Split into words
        const words = text.split(/\s+/);
        const wordDuration = duration / Math.max(1, words.length);
        
        // Create segments of 5 words each
        for (let j = 0; j < words.length; j += 5) {
          const wordGroup = words.slice(j, j + 5);
          const groupStart = offset + (j * wordDuration);
          const groupEnd = offset + ((j + wordGroup.length) * wordDuration);
          
          segments.push({
            text: wordGroup.join(' '),
            start: groupStart,
            end: groupEnd
          });
        }
      }
      
      console.log(`✅ [WHISPER] Created ${segments.length} segments from ${data.chunks.length} chunks`);
      
      // Verify timestamps
      const hasTimestamps = segments.some(s => s.start > 0 || s.end > 0);
      if (hasTimestamps) {
        console.log('✅ [WHISPER] Timestamps OK');
      } else {
        console.warn('⚠️ [WHISPER] No timestamps!');
      }
    }
    
    const text = data.text || segments.map(s => s.text).join(' ');
    
    return res.status(200).json({
      success: true,
      text: text,
      segments: segments,
      language: data.lang || data.language || 'unknown',
      duration: parseFloat(data.duration || 0)
    });
    
  } catch (error) {
    console.error('💥 [WHISPER] Server error:', error);
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: error.message,
      success: false
    });
  }
}
