export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { sport, market, region } = req.query;

  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport || 'baseball_mlb'}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=${region || 'us'}&markets=${market || 'h2h,spreads,totals'}&oddsFormat=american`;

    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
