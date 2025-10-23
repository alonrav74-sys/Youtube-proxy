export default async function handler(req, res) {
  const { q, id } = req.query;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  try {
    // 🔍 חיפוש ביוטיוב מיוזיק
    if (q) {
      const r = await fetch(
        "https://music.youtube.com/youtubei/v1/search?key=AIzaSyC-9AB4XkRW4Zy5s5r6ZjYq8mlFfVRR6_k",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20241001.01.00" } },
            query: q,
          }),
        }
      );

      const data = await r.json();
      const sections = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      const results = [];

      for (const section of sections) {
        const items = section.musicShelfRenderer?.contents || [];
        for (const item of items) {
          const vid = item.musicResponsiveListItemRenderer?.playlistItemData?.videoId;
          const title = item.musicResponsiveListItemRenderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const artist = item.musicResponsiveListItemRenderer?.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const thumb = item.musicResponsiveListItemRenderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.pop()?.url;
          if (vid) results.push({ id: vid, title, artist, thumbnail: thumb });
        }
      }

      return res.status(200).json(results.slice(0, 10));
    }

    // 🎧 פרטים על שיר
    if (id) {
      const r = await fetch(
        "https://music.youtube.com/youtubei/v1/player?key=AIzaSyC-9AB4XkRW4Zy5s5r6ZjYq8mlFfVRR6_k",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20241001.01.00" } },
            videoId: id,
          }),
        }
      );

      const data = await r.json();
      return res.status(200).json({
        id,
        title: data.videoDetails?.title,
        author: data.videoDetails?.author,
        url: `https://music.youtube.com/watch?v=${id}`,
      });
    }

    return res.status(400).json({ error: "missing query or id" });
  } catch (err) {
    return res.status(500).json({ error: "ytmusic failed", details: err.message });
  }
}
