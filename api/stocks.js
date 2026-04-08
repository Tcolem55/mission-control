export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { ticker, chart, from, to } = req.query;

  try {
    let url;
    if (chart === 'true' && from && to) {
      // Historical chart data
      url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${process.env.POLYGON_API_KEY}`;
    } else {
      // Previous close (current price)
      url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`;
    }

    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
