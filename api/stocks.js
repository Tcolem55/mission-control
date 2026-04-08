export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { ticker } = req.query;

  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`
    );
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
