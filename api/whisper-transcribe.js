// /api/whisper-transcribe.js
// Vercel Serverless Function for Whisper AI Transcription via Replicate
// Native Vercel implementation - no external dependencies needed!

export const config = {
  api: {
    bodyParser: false, // Disable to handle FormData manually
  },
  maxDuration: 300, // 5 minutes max
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    console.log('🎤 Whisper transcription request received');

    // Get content type
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content-Type must be multipart/form-data' 
      });
    }

    // Read the raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    console.log('📦 Received data, size:', buffer.length, 'bytes');

    // Parse boundary from Content-Type
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

    console.log('🎵 Extracted audio buffer, size:', audioBuffer.length, 'bytes');

    // Get Replica API key
    const REPLICA_API_KEY = process.env.REPLICA_API_KEY;
    
    if (!REPLICA_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'REPLICA_API_KEY not configured in environment variables' 
      });
    }

    console.log('📤 Sending to Replicate...');

    // Convert to base64
    const base64Audio = audioBuffer.toString('base64');

    // Call Replicate API
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
      console.error('❌ Replicate error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: `Replicate API error: ${replicaResponse.status}` 
      });
    }

    const prediction = await replicaResponse.json();
    console.log('📥 Replicate prediction created:', prediction.id);

    // Poll for result (max 60 seconds)
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: {
          'Authorization': `Bearer ${REPLICA_API_KEY}`,
        },
      });

      result = await pollResponse.json();
      attempts++;
      
      console.log(`⏳ Status: ${result.status} (${attempts}s)`);
    }

    if (result.status === 'failed') {
      console.error('❌ Replicate failed:', result.error);
      return res.status(500).json({ 
        success: false, 
        error: 'Transcription failed: ' + (result.error || 'Unknown error')
      });
    }

    if (result.status !== 'succeeded') {
      console.error('⏰ Timeout after', attempts, 'seconds');
      return res.status(408).json({ 
        success: false, 
        error: 'Transcription timeout' 
      });
    }

    console.log('✅ Transcription complete!');

    // Parse Whisper output
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

// Helper function to extract audio buffer from FormData
function extractAudioFromFormData(buffer, boundary) {
  try {
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = 0;
    
    // Split buffer by boundary
    while (true) {
      const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;
      
      if (start > 0) {
        parts.push(buffer.slice(start, boundaryIndex));
      }
      
      start = boundaryIndex + boundaryBuffer.length;
    }
    
    // Find the part with audio file
    for (const part of parts) {
      const partStr = part.toString('utf8', 0, Math.min(500, part.length));
      
      if (partStr.includes('Content-Disposition') && partStr.includes('name="audio"')) {
        // Find where headers end (double CRLF)
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        
        // Extract file data (skip headers, trim trailing CRLF)
        const fileStart = headerEnd + 4;
        const fileEnd = part.length - 2; // Remove trailing \r\n
        
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
