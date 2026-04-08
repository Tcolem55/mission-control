export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { q, type } = req.query;

  try {
    let url;
    if (type === 'top') {
      url = `https://newsapi.org/v2/top-headlines?language=en&pageSize=12&apiKey=${process.env.NEWS_API_KEY}`;
    } else {
      url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q || 'technology business')}&sortBy=publishedAt&pageSize=12&language=en&apiKey=${process.env.NEWS_API_KEY}`;
    }

    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
