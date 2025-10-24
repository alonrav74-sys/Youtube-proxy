export default async function handler(req, res) {
  try {
    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ success: false, error: 'videoId is required' });

    const key = process.env.RAPIDAPI_KEY;
    if (!key) return res.status(500).json({ success: false, error: 'Missing RAPIDAPI_KEY' });

    const url = `https://youtube-transcript-api1.p.rapidapi.com/url?videoId=${encodeURIComponent(videoId)}&locale=EN`;

    const rr = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'youtube-transcript-api1.p.rapidapi.com'
      }
    });

    if (!rr.ok) {
      const txt = await rr.text().catch(() => '');
      return res.status(rr.status).json({ success: false, error: `RapidAPI error ${rr.status}`, details: txt });
    }

    const data = await rr.json();
    let segments = null, text = null;
    if (Array.isArray(data.transcript)) {
      segments = data.transcript.map(s => ({
        text: s.text ?? '',
        start: Number(s.start ?? 0),
        duration: Number(s.duration ?? 0)
      }));
    } else if (Array.isArray(data.data)) {
      segments = data.data.map(s => ({
        text: s.text ?? '',
        start: Number(s.start ?? 0),
        duration: Number(s.duration ?? 0)
      }));
    } else if (typeof data.text === 'string') {
      text = data.text;
    }

    if (!segments && !text) {
      return res.status(404).json({ success: false, error: 'No transcript available' });
    }

    return res.status(200).json({
      success: true,
      segments,
      text: text ?? (segments ? segments.map(s => s.text).join(' ') : '')
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Server error' });
  }
}
