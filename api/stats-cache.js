// Cron Job 4: Stats Cache — run every 6 hours
// Pre-fetches player stats so picks load instantly

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const today  = new Date().toISOString().split('T')[0];
  const start14 = new Date(Date.now() - 14*24*60*60*1000).toISOString().split('T')[0];
  const results = {
    mlb: { pitchers: {}, batters: {}, gamesCount: 0 },
    nba: { players: {}, gamesCount: 0 },
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // ── MLB: Get today's games and cache pitcher + batter stats ──────────────
    try {
      const schedRes = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team,lineups`
      );
      const schedData = await schedRes.json();
      const games = schedData.dates?.[0]?.games || [];
      results.mlb.gamesCount = games.length;

      const pitcherIds = [];
      const teamIds    = [];

      for (const game of games) {
        const awayPitcher = game.teams?.away?.probablePitcher;
        const homePitcher = game.teams?.home?.probablePitcher;
        if (awayPitcher?.id) pitcherIds.push(awayPitcher.id);
        if (homePitcher?.id) pitcherIds.push(homePitcher.id);
        if (game.teams?.away?.team?.id) teamIds.push(game.teams.away.team.id);
        if (game.teams?.home?.team?.id) teamIds.push(game.teams.home.team.id);
      }

      // Cache pitcher last 5 starts
      for (const id of [...new Set(pitcherIds)]) {
        try {
          const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=pitching&season=2025&limit=5`);
          const d = await r.json();
          const logs = d.stats?.[0]?.splits?.slice(0,5) || [];
          if (logs.length) {
            results.mlb.pitchers[id] = {
              logs: logs.map(l => ({
                date: l.date,
                opponent: l.opponent?.name,
                ip:  l.stat?.inningsPitched,
                k:   l.stat?.strikeOuts,
                er:  l.stat?.earnedRuns,
                h:   l.stat?.hits,
                bb:  l.stat?.baseOnBalls,
                era: l.stat?.era,
              })),
              avgK:  (logs.reduce((s,l)=>s+(l.stat?.strikeOuts||0),0)/logs.length).toFixed(1),
              avgIP: (logs.reduce((s,l)=>s+(parseFloat(l.stat?.inningsPitched)||0),0)/logs.length).toFixed(1),
              avgER: (logs.reduce((s,l)=>s+(l.stat?.earnedRuns||0),0)/logs.length).toFixed(1),
              cachedAt: new Date().toISOString(),
            };
          }
        } catch(e) { results.errors.push(`MLB pitcher ${id}: ${e.message}`); }
      }

      // Cache batter 14-day stats for each team
      for (const teamId of [...new Set(teamIds)]) {
        try {
          const rRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=2025`);
          const rData = await rRes.json();
          const PITCHERS = ['P','SP','RP','CL'];
          const hitters  = (rData.roster||[]).filter(p=>!PITCHERS.includes(p.position?.abbreviation)).slice(0,9);

          for (const hitter of hitters) {
            try {
              const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.person?.id}/stats?stats=byDateRange&group=hitting&startDate=${start14}&endDate=${today}&season=2025`);
              const d = await r.json();
              const stat = d.stats?.[0]?.splits?.[0]?.stat;
              if (stat) {
                results.mlb.batters[hitter.person?.id] = {
                  name:  hitter.person?.fullName,
                  team:  teamId,
                  avg:   stat.avg,
                  hits:  stat.hits,
                  hr:    stat.homeRuns,
                  doubles: stat.doubles,
                  tb:    stat.totalBases,
                  pa:    stat.plateAppearances,
                  k:     stat.strikeOuts,
                  bb:    stat.baseOnBalls,
                  cachedAt: new Date().toISOString(),
                };
              }
            } catch {}
          }
        } catch(e) { results.errors.push(`MLB team ${teamId} batters: ${e.message}`); }
      }
    } catch(e) { results.errors.push(`MLB stats cache: ${e.message}`); }

    // ── NBA: Get today's games and cache player stats ────────────────────────
    try {
      const todayFormatted = today.replace(/-/g,'');
      const scoreRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayFormatted}`);
      const scoreData = await scoreRes.json();
      const events = scoreData.events || [];
      results.nba.gamesCount = events.length;

      const teamIds = [];
      for (const event of events) {
        const comp = event.competitions?.[0];
        comp?.competitors?.forEach(c => { if(c.team?.id) teamIds.push(c.team.id); });
      }

      // Cache last 10 game stats for each team's players
      for (const teamId of [...new Set(teamIds)]) {
        try {
          const rRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`);
          const rData = await rRes.json();
          const athletes = rData.athletes || [];
          const players  = athletes.flatMap(g=>(g.items||[g])).filter(p=>p.id&&p.fullName).slice(0,12);

          for (const player of players) {
            try {
              const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${player.id}/gamelog?season=2025`);
              const d = await r.json();
              const categories = d.categories || [];
              const events     = d.events || {};
              const labels     = categories.map(c=>c.abbreviation||c.name);
              const gameKeys   = Object.keys(events).slice(-10);

              if (gameKeys.length > 0) {
                const games = gameKeys.map(key => {
                  const ev   = events[key];
                  const stats = ev?.stats || [];
                  const gs   = {};
                  labels.forEach((l,i)=>{ gs[l]=stats[i]; });
                  return gs;
                }).filter(g=>Object.keys(g).length>0);

                const avg = (field) => {
                  const vals = games.map(g=>parseFloat(g[field])||0);
                  return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '0';
                };

                results.nba.players[player.id] = {
                  name:    player.fullName,
                  teamId,
                  gamesPlayed: games.length,
                  avgPTS: avg('PTS'), avgREB: avg('REB'), avgAST: avg('AST'),
                  avg3PM: avg('3PM'), avgSTL: avg('STL'), avgBLK: avg('BLK'),
                  avgTO:  avg('TO'),  avgMIN: avg('MIN'),
                  cachedAt: new Date().toISOString(),
                };
              }
            } catch {}
          }
        } catch(e) { results.errors.push(`NBA team ${teamId}: ${e.message}`); }
      }
    } catch(e) { results.errors.push(`NBA stats cache: ${e.message}`); }

    console.log(`Stats cache: ${Object.keys(results.mlb.pitchers).length} MLB pitchers, ${Object.keys(results.mlb.batters).length} MLB batters, ${Object.keys(results.nba.players).length} NBA players`);

    return res.status(200).json({
      success: true,
      mlbPitchers: Object.keys(results.mlb.pitchers).length,
      mlbBatters:  Object.keys(results.mlb.batters).length,
      nbaPlayers:  Object.keys(results.nba.players).length,
      errors: results.errors.length,
      timestamp: results.timestamp,
      data: results
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
