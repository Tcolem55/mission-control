export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { type, teamId, athleteId, gameId } = req.query;

  try {

    // ── Today's NBA scoreboard with team IDs ──────────────────────────────────
    if (type === 'scoreboard') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`
      );
      return res.status(200).json(await r.json());
    }

    // ── Active roster for a team ──────────────────────────────────────────────
    if (type === 'roster' && teamId) {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/roster`
      );
      const d = await r.json();
      // Extract clean roster with player IDs and names
      const athletes = d.athletes || [];
      const roster = athletes.flatMap(group =>
        (group.items || [group]).map(p => ({
          id: p.id,
          name: p.fullName || p.displayName,
          position: p.position?.abbreviation,
          jersey: p.jersey,
          status: p.status?.type || 'active',
          injuryStatus: p.injuries?.[0]?.status || null,
          injuryDetail: p.injuries?.[0]?.longComment || null,
        }))
      ).filter(p => p.name);
      return res.status(200).json({ roster, teamId });
    }

    // ── Player recent game log (last 10 games) ────────────────────────────────
    if (type === 'gamelog' && athleteId) {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${athleteId}/gamelog?season=2025`
      );
      const d = await r.json();
      // Get last 10 games
      const categories = d.categories || [];
      const events = d.events || {};
      const labels = categories.map(c => c.abbreviation || c.name);
      const recentGames = [];
      const eventKeys = Object.keys(events).slice(-10);
      for (const key of eventKeys) {
        const event = events[key];
        const stats = event?.stats || [];
        const gameStats = {};
        labels.forEach((label, i) => { gameStats[label] = stats[i]; });
        recentGames.push({
          date: event?.gameDate || key,
          opponent: event?.opponent?.displayName || '?',
          home: event?.home,
          stats: gameStats,
        });
      }
      return res.status(200).json({ playerId: athleteId, labels, recentGames });
    }

    // ── Team injury report ────────────────────────────────────────────────────
    if (type === 'injuries' && teamId) {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/injuries`
      );
      const d = await r.json();
      const injuries = (d.injuries || []).map(inj => ({
        player: inj.athlete?.displayName,
        status: inj.status,
        detail: inj.longComment || inj.shortComment || '',
        returnDate: inj.details?.returnDate || null,
      }));
      return res.status(200).json({ injuries });
    }

    // ── Full game context — rosters + injuries for both teams ─────────────────
    if (type === 'gamecontext' && gameId) {
      // Get game details
      const gameRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`
      );
      const gameData = await gameRes.json();

      const competitors = gameData.header?.competitions?.[0]?.competitors || [];
      const awayTeam = competitors.find(c => c.homeAway === 'away');
      const homeTeam = competitors.find(c => c.homeAway === 'home');
      const awayTeamId = awayTeam?.team?.id;
      const homeTeamId = homeTeam?.team?.id;

      const result = {
        awayTeam: awayTeam?.team?.displayName,
        homeTeam: homeTeam?.team?.displayName,
        awayTeamId,
        homeTeamId,
        awayRoster: [],
        homeRoster: [],
        awayInjuries: [],
        homeInjuries: [],
        boxscore: null,
      };

      // Fetch rosters and injuries in parallel
      const [awayRosterRes, homeRosterRes, awayInjRes, homeInjRes] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/roster`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/roster`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${awayTeamId}/injuries`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${homeTeamId}/injuries`),
      ]);

      const extractRoster = (d) => {
        const athletes = d.athletes || [];
        return athletes.flatMap(group =>
          (group.items || [group]).map(p => ({
            id: p.id,
            name: p.fullName || p.displayName,
            position: p.position?.abbreviation,
            status: p.status?.type || 'active',
            injuryStatus: p.injuries?.[0]?.status || null,
          }))
        ).filter(p => p.name);
      };

      const extractInjuries = (d) =>
        (d.injuries || []).map(i => ({
          player: i.athlete?.displayName,
          status: i.status,
          detail: i.shortComment || '',
        }));

      const [awayRosterData, homeRosterData, awayInjData, homeInjData] = await Promise.all([
        awayRosterRes.json(), homeRosterRes.json(), awayInjRes.json(), homeInjRes.json()
      ]);

      result.awayRoster = extractRoster(awayRosterData);
      result.homeRoster = extractRoster(homeRosterData);
      result.awayInjuries = extractInjuries(awayInjData);
      result.homeInjuries = extractInjuries(homeInjData);

      // Try to get boxscore if game has started
      try {
        if (gameData.boxscore?.players) {
          result.boxscore = gameData.boxscore.players;
        }
      } catch {}

      return res.status(200).json(result);
    }

    // ── Batch player game logs ────────────────────────────────────────────────
    if (type === 'batchlogs') {
      const ids = (athleteId || '').split(',').filter(Boolean).slice(0, 10);
      const results = {};
      await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${id}/gamelog?season=2025`
          );
          const d = await r.json();
          const categories = d.categories || [];
          const events = d.events || {};
          const labels = categories.map(c => c.abbreviation || c.name);
          const eventKeys = Object.keys(events).slice(-10);
          const games = eventKeys.map(key => {
            const event = events[key];
            const stats = event?.stats || [];
            const gs = {};
            labels.forEach((label, i) => { gs[label] = stats[i]; });
            return gs;
          }).filter(g => Object.keys(g).length > 0);

          if (games.length > 0) {
            // Calculate averages over last 10 games
            const avg = (field) => {
              const vals = games.map(g => parseFloat(g[field]) || 0);
              return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '0';
            };
            results[id] = {
              gamesPlayed: games.length,
              avgPTS: avg('PTS'), avgREB: avg('REB'), avgAST: avg('AST'),
              avg3PM: avg('3PM'), avgSTL: avg('STL'), avgBLK: avg('BLK'),
              avgTO: avg('TO'), avgMIN: avg('MIN'),
            };
          }
        } catch {}
      }));
      return res.status(200).json(results);
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
