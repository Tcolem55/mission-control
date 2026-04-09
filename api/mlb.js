export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { type, gamePk, teamId, playerId } = req.query;

  try {

    // ── Full game context — rosters + pitcher stats + lineups ─────────────────
    if (type === 'gamecontext' && gamePk) {
      const result = { away: {}, home: {}, lineups: { away: [], home: [] } };

      // Get game schedule with team IDs and probable pitchers
      const schedRes = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePks=${gamePk}&hydrate=probablePitcher(stats),team,linescore`
      );
      const schedData = await schedRes.json();
      const game = schedData.dates?.[0]?.games?.[0];
      if (!game) return res.status(404).json({ error: 'Game not found' });

      const awayTeamId = game.teams?.away?.team?.id;
      const homeTeamId = game.teams?.home?.team?.id;
      const awayTeamName = game.teams?.away?.team?.name;
      const homeTeamName = game.teams?.home?.team?.name;
      const awayPitcher = game.teams?.away?.probablePitcher;
      const homePitcher = game.teams?.home?.probablePitcher;

      result.away.teamName = awayTeamName;
      result.home.teamName = homeTeamName;
      result.away.pitcher = awayPitcher;
      result.home.pitcher = homePitcher;

      // Get active rosters for both teams
      const [awayRosterRes, homeRosterRes] = await Promise.all([
        fetch(`https://statsapi.mlb.com/api/v1/teams/${awayTeamId}/roster?rosterType=active&season=2025`),
        fetch(`https://statsapi.mlb.com/api/v1/teams/${homeTeamId}/roster?rosterType=active&season=2025`)
      ]);
      const awayRosterData = await awayRosterRes.json();
      const homeRosterData = await homeRosterRes.json();

      // Get hitters only (not pitchers)
      const PITCHER_POSITIONS = ['P', 'SP', 'RP', 'CL'];
      const awayHitters = (awayRosterData.roster || []).filter(p => !PITCHER_POSITIONS.includes(p.position?.abbreviation));
      const homeHitters = (homeRosterData.roster || []).filter(p => !PITCHER_POSITIONS.includes(p.position?.abbreviation));

      result.away.roster = awayHitters.map(p => ({ id: p.person?.id, name: p.person?.fullName, position: p.position?.abbreviation }));
      result.home.roster = homeHitters.map(p => ({ id: p.person?.id, name: p.person?.fullName, position: p.position?.abbreviation }));

      // Try to get confirmed lineups from game feed
      try {
        const feedRes = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
        const feedData = await feedRes.json();
        const awayBattingOrder = feedData.liveData?.boxscore?.teams?.away?.battingOrder || [];
        const homeBattingOrder = feedData.liveData?.boxscore?.teams?.home?.battingOrder || [];
        const awayPlayers = feedData.liveData?.boxscore?.teams?.away?.players || {};
        const homePlayers = feedData.liveData?.boxscore?.teams?.home?.players || {};

        if (awayBattingOrder.length > 0) {
          result.lineups.away = awayBattingOrder.map(id => ({
            id, name: awayPlayers[`ID${id}`]?.person?.fullName || null
          })).filter(p => p.name);
        }
        if (homeBattingOrder.length > 0) {
          result.lineups.home = homeBattingOrder.map(id => ({
            id, name: homePlayers[`ID${id}`]?.person?.fullName || null
          })).filter(p => p.name);
        }
      } catch {}

      return res.status(200).json(result);
    }

    // ── Active roster ─────────────────────────────────────────────────────────
    if (type === 'roster' && teamId) {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&season=2025`);
      return res.status(200).json(await r.json());
    }

    // ── Player batting stats last N days ──────────────────────────────────────
    if (type === 'batting' && playerId) {
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=byDateRange&group=hitting&startDate=${start}&endDate=${end}&season=2025`
      );
      return res.status(200).json(await r.json());
    }

    // ── Pitcher last 5 starts ─────────────────────────────────────────────────
    if (type === 'pitching' && playerId) {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=gameLog&group=pitching&season=2025&limit=5`
      );
      return res.status(200).json(await r.json());
    }

    // ── Today's schedule with team IDs ────────────────────────────────────────
    if (type === 'schedule') {
      const today = new Date().toISOString().split('T')[0];
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher(stats),team,linescore`
      );
      return res.status(200).json(await r.json());
    }

    // ── IL / injury transactions ──────────────────────────────────────────────
    if (type === 'injuries') {
      const r = await fetch(
        `https://statsapi.mlb.com/api/v1/transactions?sportId=1&limit=100&transactionTypes=IL_TRANSFER,IL_PLACEMENT`
      );
      return res.status(200).json(await r.json());
    }

    // ── Batch player stats — comma separated IDs ──────────────────────────────
    if (type === 'batchbatting') {
      const ids = (playerId || '').split(',').filter(Boolean).slice(0, 12);
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const results = {};
      await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=byDateRange&group=hitting&startDate=${start}&endDate=${end}&season=2025`);
          const d = await r.json();
          const stat = d.stats?.[0]?.splits?.[0]?.stat;
          if (stat) results[id] = stat;
        } catch {}
      }));
      return res.status(200).json(results);
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
