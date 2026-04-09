export default async function handler(req, res) {
  const today = new Date().toISOString().split('T')[0];
  const start14 = new Date(Date.now()-14*24*60*60*1000).toISOString().split('T')[0];
  const PITCHERS = ['P','SP','RP','CL'];
  const BDL_KEY = process.env.BALLDONTLIE_API_KEY;
  const BDL = 'https://api.balldontlie.io/v1';
  const results = {
    mlb: { pitchers:{}, batters:{}, gamesCount:0 },
    nba: { players:{}, gamesCount:0 },
    timestamp: new Date().toISOString(),
    errors: []
  };

  // ── MLB Stats ────────────────────────────────────────────────────────────────
  try {
    const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team`);
    const schedData = await schedRes.json();
    const games = schedData.dates?.[0]?.games||[];
    results.mlb.gamesCount = games.length;

    const pitcherIds = [], teamIds = [];
    for (const game of games) {
      if (game.teams?.away?.probablePitcher?.id) pitcherIds.push(game.teams.away.probablePitcher.id);
      if (game.teams?.home?.probablePitcher?.id) pitcherIds.push(game.teams.home.probablePitcher.id);
      if (game.teams?.away?.team?.id) teamIds.push(game.teams.away.team.id);
      if (game.teams?.home?.team?.id) teamIds.push(game.teams.home.team.id);
    }

    for (const id of [...new Set(pitcherIds)]) {
      try {
        const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&group=pitching&season=2025&limit=5`);
        const d = await r.json();
        const logs = d.stats?.[0]?.splits?.slice(0,5)||[];
        if (logs.length) {
          results.mlb.pitchers[id] = {
            logs: logs.map(l=>({ date:l.date, opponent:l.opponent?.name, ip:l.stat?.inningsPitched, k:l.stat?.strikeOuts, er:l.stat?.earnedRuns, h:l.stat?.hits, bb:l.stat?.baseOnBalls })),
            avgK:  (logs.reduce((s,l)=>s+(l.stat?.strikeOuts||0),0)/logs.length).toFixed(1),
            avgIP: (logs.reduce((s,l)=>s+(parseFloat(l.stat?.inningsPitched)||0),0)/logs.length).toFixed(1),
            avgER: (logs.reduce((s,l)=>s+(l.stat?.earnedRuns||0),0)/logs.length).toFixed(1),
            cachedAt: new Date().toISOString(),
          };
        }
      } catch(e) { results.errors.push(`Pitcher ${id}: ${e.message}`); }
    }

    for (const teamId of [...new Set(teamIds)]) {
      try {
        const rRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=2025`);
        const rData = await rRes.json();
        const hitters = (rData.roster||[]).filter(p=>!PITCHERS.includes(p.position?.abbreviation)).slice(0,9);
        for (const hitter of hitters) {
          try {
            const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.person?.id}/stats?stats=byDateRange&group=hitting&startDate=${start14}&endDate=${today}&season=2025`);
            const d = await r.json();
            const stat = d.stats?.[0]?.splits?.[0]?.stat;
            if (stat) {
              results.mlb.batters[hitter.person?.id] = {
                name: hitter.person?.fullName, team: teamId,
                avg: stat.avg, hits: stat.hits, hr: stat.homeRuns,
                doubles: stat.doubles, tb: stat.totalBases,
                pa: stat.plateAppearances, k: stat.strikeOuts,
                cachedAt: new Date().toISOString(),
              };
            }
          } catch {}
        }
      } catch(e) { results.errors.push(`MLB team ${teamId}: ${e.message}`); }
    }
  } catch(e) { results.errors.push(`MLB: ${e.message}`); }

  // ── NBA Stats via BallDontLie ────────────────────────────────────────────────
  try {
    const todayFmt = today.replace(/-/g,'');
    const scoreRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayFmt}`);
    const scoreData = await scoreRes.json();
    const events = scoreData.events||[];
    results.nba.gamesCount = events.length;

    // Get all team IDs playing today
    const teamIds = [...new Set(events.flatMap(e=>
      e.competitions?.[0]?.competitors?.map(c=>c.team?.id)||[]
    ).filter(Boolean))];

    // Get rosters for each team and collect player names
    const allPlayers = [];
    for (const teamId of teamIds) {
      try {
        const rRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`);
        const rData = await rRes.json();
        const players = (rData.athletes||[]).flatMap(g=>(g.items||[g])).filter(p=>p.id&&(p.fullName||p.displayName)).slice(0,10);
        players.forEach(p => allPlayers.push({ espnId: p.id, name: p.fullName||p.displayName, teamId }));
      } catch {}
    }

    // Fetch stats from BallDontLie for each player
    const season_yr = new Date().getFullYear();
    for (const player of allPlayers.slice(0, 60)) {
      try {
        // Search player in BDL
        const searchRes = await fetch(
          `${BDL}/players?search=${encodeURIComponent(player.name)}&per_page=3`,
          { headers: { 'Authorization': BDL_KEY } }
        );
        const searchData = await searchRes.json();
        const bdlPlayer = searchData.data?.[0];
        if (!bdlPlayer) continue;

        // Get recent games
        const statsRes = await fetch(
          `${BDL}/stats?player_ids[]=${bdlPlayer.id}&seasons[]=${season_yr}&per_page=10`,
          { headers: { 'Authorization': BDL_KEY } }
        );
        const statsData = await statsRes.json();
        const games = statsData.data||[];

        if (games.length > 0) {
          const avg = f => {
            const vals = games.map(g=>parseFloat(g[f])||0);
            return vals.length?(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1):'0';
          };
          results.nba.players[player.espnId] = {
            name: player.name,
            bdlId: bdlPlayer.id,
            teamId: player.teamId,
            gamesPlayed: games.length,
            avgPTS: avg('pts'),
            avgREB: avg('reb'),
            avgAST: avg('ast'),
            avg3PM: avg('fg3m'),
            avgSTL: avg('stl'),
            avgBLK: avg('blk'),
            avgMIN: avg('min'),
            last5: games.slice(0,5).map(g=>({
              date: g.game?.date?.split('T')[0],
              pts: g.pts, reb: g.reb, ast: g.ast, fg3m: g.fg3m,
            })),
            cachedAt: new Date().toISOString(),
          };
        }
      } catch {}
    }
  } catch(e) { results.errors.push(`NBA: ${e.message}`); }

  return res.status(200).json({
    success: true,
    mlbPitchers: Object.keys(results.mlb.pitchers).length,
    mlbBatters: Object.keys(results.mlb.batters).length,
    nbaPlayers: Object.keys(results.nba.players).length,
    errors: results.errors.length,
    timestamp: results.timestamp,
    data: results
  });
}
