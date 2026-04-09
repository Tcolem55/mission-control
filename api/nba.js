export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { type, teamId, athleteId, gameId, playerName, season } = req.query;
  const BDL_KEY = process.env.BALLDONTLIE_API_KEY;
  const BDL = 'https://api.balldontlie.io/v1';
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

  try {

    // ── Today's scoreboard (ESPN) ─────────────────────────────────────────────
    if (type === 'scoreboard') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const r = await fetch(`${ESPN}/scoreboard?dates=${today}`);
      return res.status(200).json(await r.json());
    }

    // ── Active roster (ESPN) ──────────────────────────────────────────────────
    if (type === 'roster' && teamId) {
      const r = await fetch(`${ESPN}/teams/${teamId}/roster`);
      const d = await r.json();
      const athletes = d.athletes || [];
      const roster = athletes.flatMap(group =>
        (group.items || [group]).map(p => ({
          id:           p.id,
          name:         p.fullName || p.displayName,
          position:     p.position?.abbreviation,
          jersey:       p.jersey,
          injuryStatus: p.injuries?.[0]?.status || null,
          injuryDetail: p.injuries?.[0]?.shortComment || null,
        }))
      ).filter(p => p.name);
      return res.status(200).json({ roster, teamId });
    }

    // ── Injury report (ESPN) ──────────────────────────────────────────────────
    if (type === 'injuries' && teamId) {
      const r = await fetch(`${ESPN}/teams/${teamId}/injuries`);
      const d = await r.json();
      const injuries = (d.injuries || []).map(i => ({
        player:     i.athlete?.displayName,
        status:     i.status,
        detail:     i.longComment || i.shortComment || '',
        returnDate: i.details?.returnDate || null,
      }));
      return res.status(200).json({ injuries });
    }

    // ── Search player by name (BallDontLie) ───────────────────────────────────
    if (type === 'searchplayer' && playerName) {
      const r = await fetch(`${BDL}/players?search=${encodeURIComponent(playerName)}&per_page=5`, {
        headers: { 'Authorization': BDL_KEY }
      });
      const d = await r.json();
      return res.status(200).json(d);
    }

    // ── Player season averages (BallDontLie) ──────────────────────────────────
    if (type === 'seasonavg') {
      const ids = (athleteId || '').split(',').filter(Boolean).slice(0, 20);
      const season_yr = season || new Date().getFullYear();
      const r = await fetch(
        `${BDL}/season_averages?season=${season_yr}&player_ids[]=${ids.join('&player_ids[]=')}`,
        { headers: { 'Authorization': BDL_KEY } }
      );
      const d = await r.json();
      return res.status(200).json(d);
    }

    // ── Player last N games stats (BallDontLie) ───────────────────────────────
    if (type === 'recentgames' && athleteId) {
      const ids = athleteId.split(',').filter(Boolean).slice(0, 10);
      const season_yr = new Date().getFullYear();

      // Get last 10 games for each player
      const results = {};
      await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(
            `${BDL}/stats?player_ids[]=${id}&seasons[]=${season_yr}&per_page=10&sort=date&order=desc`,
            { headers: { 'Authorization': BDL_KEY } }
          );
          const d = await r.json();
          const games = d.data || [];
          if (games.length > 0) {
            const avg = field => {
              const vals = games.map(g => parseFloat(g[field]) || 0);
              return vals.length ? (vals.reduce((a,b) => a+b,0) / vals.length).toFixed(1) : '0';
            };
            results[id] = {
              gamesPlayed: games.length,
              avgPTS: avg('pts'),
              avgREB: avg('reb'),
              avgAST: avg('ast'),
              avg3PM: avg('fg3m'),
              avgSTL: avg('stl'),
              avgBLK: avg('blk'),
              avgTO:  avg('turnover'),
              avgMIN: avg('min'),
              recentGames: games.slice(0,5).map(g => ({
                date: g.game?.date?.split('T')[0],
                opponent: g.game?.home_team_id === parseInt(id) ? g.game?.visitor_team?.full_name : g.game?.home_team?.full_name,
                pts: g.pts, reb: g.reb, ast: g.ast,
                fg3m: g.fg3m, stl: g.stl, blk: g.blk, min: g.min,
              })),
            };
          }
        } catch {}
      }));
      return res.status(200).json(results);
    }

    // ── Batch player lookup — ESPN id to BallDontLie id mapping ──────────────
    if (type === 'batchlogs' && athleteId) {
      const espnIds = athleteId.split(',').filter(Boolean).slice(0, 12);
      // We need to search by name since ESPN and BDL use different IDs
      // This endpoint expects names to be passed instead
      return res.status(200).json({ message: 'Use playerrecentstats instead', espnIds });
    }

    // ── Get stats for players by name list (BallDontLie) ─────────────────────
    if (type === 'playerrecentstats') {
      const names = (playerName || '').split('|').filter(Boolean).slice(0, 15);
      const season_yr = new Date().getFullYear();
      const results = {};

      await Promise.all(names.map(async name => {
        try {
          // Search for player
          const searchRes = await fetch(
            `${BDL}/players?search=${encodeURIComponent(name)}&per_page=3`,
            { headers: { 'Authorization': BDL_KEY } }
          );
          const searchData = await searchRes.json();
          const player = searchData.data?.[0];
          if (!player) return;

          // Get their recent games
          const statsRes = await fetch(
            `${BDL}/stats?player_ids[]=${player.id}&seasons[]=${season_yr}&per_page=10`,
            { headers: { 'Authorization': BDL_KEY } }
          );
          const statsData = await statsRes.json();
          const games = statsData.data || [];

          if (games.length > 0) {
            const avg = field => {
              const vals = games.map(g => parseFloat(g[field]) || 0);
              return vals.length ? (vals.reduce((a,b) => a+b,0) / vals.length).toFixed(1) : '0';
            };
            results[name] = {
              bdlId: player.id,
              fullName: `${player.first_name} ${player.last_name}`,
              team: player.team?.full_name,
              position: player.position,
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
                pts: g.pts, reb: g.reb, ast: g.ast,
                fg3m: g.fg3m, min: g.min,
              })),
            };
          }
        } catch {}
      }));
      return res.status(200).json(results);
    }

    // ── League injuries (ESPN) ────────────────────────────────────────────────
    if (type === 'leagueinjuries') {
      const r = await fetch(`${ESPN}/injuries`);
      const d = await r.json();
      const injuries = (d.injuries || []).map(i => ({
        player:   i.athlete?.displayName,
        team:     i.team?.displayName,
        teamAbbr: i.team?.abbreviation,
        status:   i.status,
        detail:   i.shortComment || '',
      }));
      return res.status(200).json({ injuries });
    }

    // ── Today's games with team info ──────────────────────────────────────────
    if (type === 'todaygames') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const r = await fetch(`${ESPN}/scoreboard?dates=${today}`);
      const d = await r.json();
      return res.status(200).json(d);
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
