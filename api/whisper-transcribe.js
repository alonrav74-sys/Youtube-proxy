// /api/whisper-transcribe.js
// Server downloads audio and sends to Replica

export const config = {
  maxDuration: 300, // 5 minutes
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use GET with ?videoId=' 
    });
  }

  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing videoId parameter' 
    });
  }

  try {
    console.log('🎤 Whisper request for videoId:', videoId);

    // Step 1: Get audio URL from RapidAPI
    console.log('📥 Step 1: Getting audio URL from RapidAPI...');
    
    const rapidApiResponse = await fetch(
      `https://youtube-proxy-pied.vercel.app/api/rapidapi-audio?videoId=${videoId}`
    );

    if (!rapidApiResponse.ok) {
      throw new Error('Failed to get audio URL from RapidAPI');
    }

    const rapidApiData = await rapidApiResponse.json();
    
    if (!rapidApiData.success || !rapidApiData.audioUrl) {
      throw new Error('No audio URL returned from RapidAPI');
    }

    const audioUrl = rapidApiData.audioUrl;
    console.log('✅ Got audio URL');

    // Step 2: Download audio file
    console.log('📥 Step 2: Downloading audio from URL...');
    
    const audioResponse = await fetch(audioUrl);
    
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file');
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    console.log('✅ Downloaded audio, size:', audioBuffer.length, 'bytes');

    // Check size limit (4.5MB for Vercel Hobby)
    if (audioBuffer.length > 4.5 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: 'Audio file too large (max 4.5MB for Vercel Hobby plan)'
      });
    }

    // Step 3: Send to Replica
    console.log('📤 Step 3: Sending to Replica Whisper...');

    const REPLICA_API_KEY = process.env.REPLICA_API_KEY;
    
    if (!REPLICA_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'REPLICA_API_KEY not configured' 
      });
    }

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
      throw new Error(`Replica API error: ${replicaResponse.status}`);
    }

    const prediction = await replicaResponse.json();
    console.log('✅ Replica prediction created:', prediction.id);

    // Step 4: Poll for result
    console.log('⏳ Step 4: Waiting for transcription...');
    
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

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
        console.log(`⏳ Still waiting... ${attempts}s (status: ${result.status})`);
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
      console.error('⏰ Timeout after', attempts, 'seconds');
      return res.status(408).json({ 
        success: false, 
        error: 'Transcription timeout' 
      });
    }

    console.log('✅ Transcription complete!');

    // Step 5: Return result
    const output = result.output;
    const segments = output.segments || [];
    const text = output.text || output.transcription || '';

    console.log('📦 Returning', segments.length, 'segments');

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
