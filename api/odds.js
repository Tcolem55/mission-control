export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { type, sport, market, eventId } = req.query;
  const KEY = process.env.ODDS_API_KEY;

  try {
    // ── Get today's events (game IDs) ─────────────────────────────────────────
    if (type === 'events' || !type) {
      const sp = sport || 'baseball_mlb';
      const r = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sp}/events?apiKey=${KEY}&dateFormat=iso`
      );
      const d = await r.json();
      return res.status(200).json(Array.isArray(d) ? d : []);
    }

    // ── Get player props for a specific event ─────────────────────────────────
    if (type === 'eventprops' && eventId) {
      const sp = sport || 'baseball_mlb';
      const markets = market ||
        (sp === 'baseball_mlb'
          ? 'batter_hits,batter_home_runs,batter_total_bases,batter_doubles,pitcher_strikeouts'
          : 'player_points,player_rebounds,player_assists,player_threes');
      const r = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sp}/events/${eventId}/odds?apiKey=${KEY}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm`
      );
      const d = await r.json();
      return res.status(200).json(d);
    }

    // ── Get all props for today (batch — multiple events) ─────────────────────
    if (type === 'allprops') {
      const sp = sport || 'baseball_mlb';
      const markets = market ||
        (sp === 'baseball_mlb'
          ? 'batter_hits,batter_home_runs,batter_total_bases,batter_doubles,pitcher_strikeouts'
          : 'player_points,player_rebounds,player_assists,player_threes');

      // First get events
      const evRes = await fetch(`https://api.the-odds-api.com/v4/sports/${sp}/events?apiKey=${KEY}&dateFormat=iso`);
      const events = await evRes.json();
      if (!Array.isArray(events) || events.length === 0) return res.status(200).json([]);

      // Get props for each event (limit to 6 to save API calls)
      const results = [];
      for (const event of events.slice(0, 6)) {
        try {
          const r = await fetch(
            `https://api.the-odds-api.com/v4/sports/${sp}/events/${event.id}/odds?apiKey=${KEY}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm`
          );
          const d = await r.json();
          if (d && d.id) results.push(d);
        } catch {}
      }
      return res.status(200).json(results);
    }

    // ── Featured markets (h2h, spreads, totals) ───────────────────────────────
    if (type === 'featured') {
      const sp = sport || 'baseball_mlb';
      const r = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sp}/odds?apiKey=${KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`
      );
      const d = await r.json();
      return res.status(200).json(Array.isArray(d) ? d : []);
    }

    return res.status(400).json({ error: 'Invalid type' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
