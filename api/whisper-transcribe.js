// api/whisper-transcribe.js
// UPDATED: Now uses Replicate API with whisper-timestamped for accurate word-level timestamps

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
    
    const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
    
    if (!REPLICATE_API_TOKEN) {
      return res.status(500).json({ error: 'Replicate API token not configured', success: false });
    }
    
    console.log('🎤 [WHISPER-REPLICATE] Starting transcription for:', videoId);
    
    // Step 1: Get audio URL from existing rapidapi-audio endpoint
    const baseUrl = req.headers.host ? 
      (req.headers.host.includes('localhost') ? 'http://localhost:3000' : `https://${req.headers.host}`) 
      : 'https://youtube-proxy-pied.vercel.app';
    
    const audioResponse = await fetch(`${baseUrl}/api/rapidapi-audio?videoId=${videoId}`);
    
    if (!audioResponse.ok) {
      throw new Error('Failed to get audio URL');
    }
    
    const audioData = await audioResponse.json();
    if (!audioData.success || !audioData.audioUrl) {
      throw new Error('No audio URL received');
    }
    
    console.log('🎵 [WHISPER-REPLICATE] Got audio URL, starting transcription...');
    
    // Step 2: Create Replicate prediction
    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Using villesau/whisper-timestamped model
        version: 'dc2754ae248fca9eb1628f1f037041f7524b3fbb014a9ed7ef61084c14c1fcca',
        input: {
          audio: audioData.audioUrl,
          language: null, // Auto-detect (null for auto)
          task: 'transcribe',
          vad: true // Voice Activity Detection for better accuracy
        }
      })
    });
    
    if (!prediction.ok) {
      const errorText = await prediction.text();
      console.error('❌ [WHISPER-REPLICATE] Prediction creation failed:', errorText);
      throw new Error('Failed to create prediction');
    }
    
    let result = await prediction.json();
    console.log('⏳ [WHISPER-REPLICATE] Prediction created:', result.id);
    
    // Step 3: Poll for result (max 60 seconds)
    const maxAttempts = 30;
    let attempts = 0;
    
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        }
      });
      
      result = await statusResponse.json();
      attempts++;
      
      console.log(`⏳ [WHISPER-REPLICATE] Status: ${result.status} (${attempts}/${maxAttempts})`);
    }
    
    if (result.status !== 'succeeded') {
      throw new Error(`Transcription failed with status: ${result.status}`);
    }
    
    console.log('✅ [WHISPER-REPLICATE] Transcription completed!');
    
    // Step 4: Process result
    const output = result.output;
    
    // Replicate whisper-timestamped returns JSON with segments and words
    const segments = [];
    
    if (output.segments && Array.isArray(output.segments)) {
      for (const segment of output.segments) {
        // Each segment has words with precise timestamps
        if (segment.words && Array.isArray(segment.words)) {
          for (const word of segment.words) {
            segments.push({
              text: word.word || word.text || '',
              start: parseFloat(word.start || 0),
              end: parseFloat(word.end || 0)
            });
          }
        } else {
          // Fallback: use segment-level timestamps
          segments.push({
            text: segment.text || '',
            start: parseFloat(segment.start || 0),
            end: parseFloat(segment.end || 0)
          });
        }
      }
    }
    
    // Verify timestamps
    const hasTimestamps = segments.some(s => s.start > 0 || s.end > 0);
    console.log(`📊 [WHISPER-REPLICATE] Created ${segments.length} segments, timestamps: ${hasTimestamps ? 'YES ✅' : 'NO ❌'}`);
    
    if (segments.length > 0) {
      console.log('📝 [WHISPER-REPLICATE] Sample segment:', segments[0]);
    }
    
    const fullText = output.text || segments.map(s => s.text).join(' ');
    
    return res.status(200).json({
      success: true,
      text: fullText,
      segments: segments,
      language: output.language || 'unknown',
      duration: parseFloat(output.duration || 0)
    });
    
  } catch (error) {
    console.error('💥 [WHISPER-REPLICATE] Error:', error);
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: error.message,
      success: false
    });
  }
}
