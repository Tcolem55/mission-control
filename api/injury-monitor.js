export default async function handler(req, res) {
  const results = {
    mlb: [], nba: [], mlbTransactions: [],
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries');
    const d = await r.json();
    results.mlb = (d.injuries||[]).map(i=>({
      player: i.athlete?.displayName,
      team: i.team?.displayName,
      teamAbbr: i.team?.abbreviation,
      status: i.status,
      detail: i.longComment||i.shortComment||'',
      returnDate: i.details?.returnDate||null,
      updatedAt: new Date().toISOString(),
    }));
  } catch(e) { results.errors.push(`MLB injuries: ${e.message}`); }

  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries');
    const d = await r.json();
    results.nba = (d.injuries||[]).map(i=>({
      player: i.athlete?.displayName,
      team: i.team?.displayName,
      teamAbbr: i.team?.abbreviation,
      status: i.status,
      detail: i.longComment||i.shortComment||'',
      returnDate: i.details?.returnDate||null,
      updatedAt: new Date().toISOString(),
    }));
  } catch(e) { results.errors.push(`NBA injuries: ${e.message}`); }

  try {
    const r = await fetch('https://statsapi.mlb.com/api/v1/transactions?sportId=1&limit=50&transactionTypes=IL_PLACEMENT,IL_TRANSFER,IL_RETURN,DFA');
    const d = await r.json();
    results.mlbTransactions = (d.transactions||[]).slice(0,20).map(t=>({
      player: t.player?.fullName,
      team: t.fromTeam?.name||t.toTeam?.name,
      type: t.typeDesc||t.type,
      date: t.date,
    }));
  } catch(e) { results.errors.push(`MLB transactions: ${e.message}`); }

  return res.status(200).json({
    success: true,
    mlbInjuries: results.mlb.length,
    nbaInjuries: results.nba.length,
    mlbTransactions: results.mlbTransactions.length,
    errors: results.errors,
    timestamp: results.timestamp,
    data: results
  });
}
