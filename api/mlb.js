export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { type, gamePk, teamId, playerId } = req.query;

  try {
    let data = {};

    if (type === 'lineups') {
      // Get today's game lineups
      const today = new Date().toISOString().split('T')[0];
      const schedRes = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=lineups,probablePitcher(stats),team,linescore`
      );
      const schedData = await schedRes.json();
      data = schedData;
    }

    else if (type === 'boxscore' && gamePk) {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
      data = await r.json();
    }

    else if (type === 'roster' && teamId) {
      // Get active 26-man roster
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=2025`
      );
      data = await r.json();
    }

    else if (type === 'playerstats' && playerId) {
      // Get player recent stats - last 14 days
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=byDateRange&group=hitting&startDate=${start}&endDate=${end}&season=2025`
      );
      data = await r.json();
    }

    else if (type === 'pitcherstats' && playerId) {
      // Get pitcher last 5 starts
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=pitching&season=2025&limit=5`
      );
      data = await r.json();
    }

    else if (type === 'injuries') {
      // Get league-wide injury report via transactions
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/transactions?sportId=1&limit=100&transactionTypes=IL_TRANSFER,IL_RETURN`
      );
      data = await r.json();
    }

    else if (type === 'standings') {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2025&hydrate=team`
      );
      data = await r.json();
    }

    else if (type === 'gamefeed' && gamePk) {
      // Full game feed with lineups, pitchers, stats
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=gameData,liveData,boxscore,teams,players,lineups,probablePitchers`
      );
      data = await r.json();
    }

    else {
      return res.status(400).json({ error: 'Invalid type parameter' });
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
