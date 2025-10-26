// api/whisper-transcribe.js
// FINAL: Downloads audio to memory, uploads as base64 to Replicate

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
    
    // Step 1: Get audio URL
    console.log('📥 [WHISPER-REPLICATE] Getting audio URL...');
    
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
    
    console.log('✅ [WHISPER-REPLICATE] Got audio URL');
    
    // Step 2: Download audio file to memory
    console.log('📥 [WHISPER-REPLICATE] Downloading audio file...');
    
    const audioFileResponse = await fetch(audioData.audioUrl);
    if (!audioFileResponse.ok) {
      throw new Error('Failed to download audio file');
    }
    
    const audioArrayBuffer = await audioFileResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioArrayBuffer).toString('base64');
    const audioDataUri = `data:audio/mpeg;base64,${audioBase64}`;
    
    console.log(`✅ [WHISPER-REPLICATE] Downloaded ${(audioArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    
    // Step 3: Create prediction with base64 audio
    console.log('🚀 [WHISPER-REPLICATE] Sending to Replicate...');
    
    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        version: 'dc2754ae248fca9eb1628f1f037041f7524b3fbb014a9ed7ef61084c14c1fcca',
        input: {
          audio: audioDataUri,
          language: null,
          task: 'transcribe',
          vad: true
        }
      })
    });
    
    if (!prediction.ok) {
      const errorText = await prediction.text();
      console.error('❌ [WHISPER-REPLICATE] Prediction failed:', errorText);
      throw new Error(`Failed to create prediction: ${errorText}`);
    }
    
    let result = await prediction.json();
    console.log('⏳ [WHISPER-REPLICATE] Prediction created:', result.id);
    
    // Step 4: Poll for result (max 2 minutes)
    const maxAttempts = 60;
    let attempts = 0;
    
    while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        }
      });
      
      if (!statusResponse.ok) {
        console.error('❌ [WHISPER-REPLICATE] Status check failed');
        break;
      }
      
      result = await statusResponse.json();
      attempts++;
      
      console.log(`⏳ [WHISPER-REPLICATE] Status: ${result.status} (${attempts}/${maxAttempts})`);
    }
    
    if (result.status !== 'succeeded') {
      const errorMsg = result.error || `Status: ${result.status}`;
      console.error('❌ [WHISPER-REPLICATE] Final status:', result.status);
      throw new Error(`Transcription failed: ${errorMsg}`);
    }
    
    console.log('✅ [WHISPER-REPLICATE] Transcription completed!');
    
    // Step 5: Process result
    const output = result.output;
    
    if (!output) {
      throw new Error('No output in result');
    }
    
    const segments = [];
    
    if (output.segments && Array.isArray(output.segments)) {
      for (const segment of output.segments) {
        if (segment.words && Array.isArray(segment.words)) {
          for (const word of segment.words) {
            segments.push({
              text: word.word || word.text || '',
              start: parseFloat(word.start || 0),
              end: parseFloat(word.end || 0)
            });
          }
        } else {
          segments.push({
            text: segment.text || '',
            start: parseFloat(segment.start || 0),
            end: parseFloat(segment.end || 0)
          });
        }
      }
    }
    
    const hasTimestamps = segments.some(s => s.start > 0 || s.end > 0);
    console.log(`📊 [WHISPER-REPLICATE] Created ${segments.length} segments, timestamps: ${hasTimestamps ? 'YES ✅' : 'NO ❌'}`);
    
    if (segments.length > 0) {
      console.log('📝 [WHISPER-REPLICATE] Sample:', segments[0]);
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
