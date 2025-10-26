// /api/whisper-transcribe.js
// Receives audio file via FormData and sends to Replica

export const config = {
  api: {
    bodyParser: false, // Handle FormData manually
  },
  maxDuration: 300,
};

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    console.log('🎤 Whisper transcribe request received');

    // Read raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    console.log('📦 Received data, size:', buffer.length, 'bytes');

    // Get boundary from Content-Type
    const contentType = req.headers['content-type'] || '';
    const boundary = contentType.split('boundary=')[1];
    
    if (!boundary) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing boundary in Content-Type' 
      });
    }

    // Extract audio file from FormData
    const audioBuffer = extractAudioFromFormData(buffer, boundary);
    
    if (!audioBuffer) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file found in request' 
      });
    }

    console.log('🎵 Extracted audio, size:', audioBuffer.length, 'bytes');

    // Check size (10MB limit)
    if (audioBuffer.length > 10 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: 'Audio file too large (max 10MB)'
      });
    }

    // Get Replica API key
    const REPLICA_API_KEY = process.env.REPLICA_API_KEY;
    
    if (!REPLICA_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'REPLICA_API_KEY not configured' 
      });
    }

    console.log('📤 Sending to Replica...');

    // Convert to base64
    const base64Audio = audioBuffer.toString('base64');

    // Call Replica
    const replicaResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2',
        input: {
          audio: `data:audio/mpeg;base64,${base64Audio}`,
          model: 'large-v3',
          language: 'auto',
          translate: false,
          temperature: 0,
          transcription: 'plain text',
          suppress_tokens: '-1',
          logprob_threshold: -1.0,
          no_speech_threshold: 0.6,
          condition_on_previous_text: true,
          compression_ratio_threshold: 2.4,
          temperature_increment_on_fallback: 0.2,
        },
      }),
    });

    if (!replicaResponse.ok) {
      const errorText = await replicaResponse.text();
      console.error('❌ Replica error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: `Replica API error: ${replicaResponse.status}` 
      });
    }

    const prediction = await replicaResponse.json();
    console.log('✅ Replica prediction created:', prediction.id);

    // Poll for result
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const pollResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: {
            'Authorization': `Bearer ${REPLICA_API_KEY}`,
          },
        }
      );

      result = await pollResponse.json();
      attempts++;
      
      if (attempts % 5 === 0) {
        console.log(`⏳ Waiting... ${attempts}s (${result.status})`);
      }
    }

    if (result.status === 'failed') {
      console.error('❌ Transcription failed:', result.error);
      return res.status(500).json({ 
        success: false, 
        error: 'Transcription failed: ' + (result.error || 'Unknown error')
      });
    }

    if (result.status !== 'succeeded') {
      console.error('⏰ Timeout');
      return res.status(408).json({ 
        success: false, 
        error: 'Transcription timeout' 
      });
    }

    console.log('✅ Transcription complete!');

    // Return result
    const output = result.output;
    const segments = output.segments || [];
    const text = output.text || output.transcription || '';

    return res.status(200).json({
      success: true,
      text: text,
      segments: segments.map(seg => ({
        text: seg.text || '',
        start: seg.start || 0,
        end: seg.end || 0,
      })),
      language: output.language || 'en',
      duration: output.duration || 0,
    });

  } catch (error) {
    console.error('💥 Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}

// Extract audio from FormData
function extractAudioFromFormData(buffer, boundary) {
  try {
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = 0;
    
    while (true) {
      const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;
      
      if (start > 0) {
        parts.push(buffer.slice(start, boundaryIndex));
      }
      
      start = boundaryIndex + boundaryBuffer.length;
    }
    
    for (const part of parts) {
      const partStr = part.toString('utf8', 0, Math.min(500, part.length));
      
      if (partStr.includes('Content-Disposition') && partStr.includes('name="audio"')) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        
        const fileStart = headerEnd + 4;
        const fileEnd = part.length - 2;
        
        if (fileEnd <= fileStart) continue;
        
        return part.slice(fileStart, fileEnd);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing FormData:', error);
    return null;
  }
}
