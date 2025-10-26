// /api/whisper-transcribe.js
// Vercel Serverless Function for Whisper AI Transcription via Replica

import { buffer } from 'micro';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser to handle FormData
  },
};

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    console.log('🎤 Whisper transcription request received');

    // Parse FormData manually
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content-Type must be multipart/form-data' 
      });
    }

    // Get the audio file buffer
    const buf = await buffer(req);
    
    console.log('📦 Received audio file, size:', buf.length, 'bytes');

    // Parse boundary from Content-Type
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing boundary in Content-Type' 
      });
    }

    // Extract the audio file from FormData
    // Simple parser - in production consider using a library like 'busboy' or 'formidable'
    const audioBuffer = extractAudioFromFormData(buf, boundary);
    
    if (!audioBuffer) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file found in request' 
      });
    }

    console.log('🎵 Extracted audio buffer, size:', audioBuffer.length, 'bytes');

    // Send to Replica Whisper API
    const REPLICA_API_KEY = process.env.REPLICA_API_KEY;
    
    if (!REPLICA_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'REPLICA_API_KEY not configured' 
      });
    }

    console.log('📤 Sending to Replica...');

    // Convert to base64 for Replica
    const base64Audio = audioBuffer.toString('base64');

    const replicaResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2',
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
    console.log('📥 Replica prediction created:', prediction.id);

    // Poll for result
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

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
      console.error('❌ Replica failed:', result.error);
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

    // Parse Whisper output
    const output = result.output;
    
    // Whisper returns: { text, segments, language, duration }
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
    const boundaryStr = `--${boundary}`;
    const parts = buffer.toString('binary').split(boundaryStr);
    
    for (const part of parts) {
      if (part.includes('Content-Disposition') && part.includes('name="audio"')) {
        // Find the start of the file data (after headers)
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        
        // Extract binary data
        const fileDataStart = headerEnd + 4;
        const fileDataEnd = part.lastIndexOf('\r\n');
        
        if (fileDataEnd <= fileDataStart) continue;
        
        const fileData = part.substring(fileDataStart, fileDataEnd);
        return Buffer.from(fileData, 'binary');
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing FormData:', error);
    return null;
  }
}
