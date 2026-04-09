// Cron Job 2: Injury Monitor — run every 10 minutes
// Checks ESPN injury feeds for MLB + NBA, flags changes

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const results = {
    mlb: [], nba: [],
    timestamp: new Date().toISOString(),
    alerts: [],
    errors: []
  };

  try {
    // ── MLB Injuries via ESPN ────────────────────────────────────────────────
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/injuries');
      const d = await r.json();
      const injuries = (d.injuries || []).map(inj => ({
        player:      inj.athlete?.displayName,
        team:        inj.team?.displayName,
        teamAbbr:    inj.team?.abbreviation,
        status:      inj.status,
        detail:      inj.longComment || inj.shortComment || '',
        injuryType:  inj.details?.type || '',
        returnDate:  inj.details?.returnDate || null,
        updatedAt:   new Date().toISOString(),
      }));
      results.mlb = injuries;

      // Flag critical statuses
      const critical = injuries.filter(i =>
        ['Out','Day-To-Day','Questionable','Doubtful'].includes(i.status)
      );
      if (critical.length > 0) {
        results.alerts.push({
          sport: 'MLB',
          count: critical.length,
          players: critical.slice(0,10).map(i => `${i.player} (${i.teamAbbr}): ${i.status}`)
        });
      }
    } catch(e) {
      results.errors.push(`MLB injuries: ${e.message}`);
    }

    // ── NBA Injuries via ESPN ────────────────────────────────────────────────
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries');
      const d = await r.json();
      const injuries = (d.injuries || []).map(inj => ({
        player:      inj.athlete?.displayName,
        team:        inj.team?.displayName,
        teamAbbr:    inj.team?.abbreviation,
        status:      inj.status,
        detail:      inj.longComment || inj.shortComment || '',
        injuryType:  inj.details?.type || '',
        returnDate:  inj.details?.returnDate || null,
        updatedAt:   new Date().toISOString(),
      }));
      results.nba = injuries;

      const critical = injuries.filter(i =>
        ['Out','Day-To-Day','Questionable','Doubtful'].includes(i.status)
      );
      if (critical.length > 0) {
        results.alerts.push({
          sport: 'NBA',
          count: critical.length,
          players: critical.slice(0,10).map(i => `${i.player} (${i.teamAbbr}): ${i.status}`)
        });
      }
    } catch(e) {
      results.errors.push(`NBA injuries: ${e.message}`);
    }

    // ── Also check MLB transactions for IL moves ─────────────────────────────
    try {
      const r = await fetch('https://statsapi.mlb.com/api/v1/transactions?sportId=1&limit=50&transactionTypes=IL_PLACEMENT,IL_TRANSFER,IL_RETURN,DFA');
      const d = await r.json();
      const recent = (d.transactions || []).slice(0, 20).map(t => ({
        player:   t.player?.fullName,
        team:     t.fromTeam?.name || t.toTeam?.name,
        type:     t.typeDesc || t.type,
        date:     t.date,
      }));
      results.mlbTransactions = recent;
    } catch(e) {
      results.errors.push(`MLB transactions: ${e.message}`);
    }

    console.log(`Injury monitor: ${results.mlb.length} MLB, ${results.nba.length} NBA injuries tracked`);
    return res.status(200).json({
      success: true,
      mlbInjuries: results.mlb.length,
      nbaInjuries: results.nba.length,
      alerts: results.alerts,
      errors: results.errors,
      timestamp: results.timestamp,
      data: results
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
