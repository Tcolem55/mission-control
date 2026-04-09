// Cron Job 3: Lineup Tracker — run every 10 minutes 10am-8pm on game days
// Monitors for confirmed lineups, flags when posted

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const today = new Date().toISOString().split('T')[0];
  const results = {
    mlb: { games: [], confirmedLineups: [] },
    nba: { games: [], confirmedLineups: [] },
    timestamp: new Date().toISOString(),
    errors: []
  };

  try {
    // ── MLB Lineup Check ─────────────────────────────────────────────────────
    try {
      const schedRes = await fetch(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team,linescore,lineups`
      );
      const schedData = await schedRes.json();
      const games = schedData.dates?.[0]?.games || [];

      for (const game of games) {
        const gamePk   = game.gamePk;
        const away     = game.teams?.away;
        const home     = game.teams?.home;
        const status   = game.status?.abstractGameState;
        const gameTime = game.gameDate;

        const gameInfo = {
          gamePk,
          away: away?.team?.name,
          home: home?.team?.name,
          awayPitcher: away?.probablePitcher?.fullName || 'TBD',
          homePitcher: home?.probablePitcher?.fullName || 'TBD',
          status,
          gameTime,
          lineupConfirmed: false,
          awayLineup: [],
          homeLineup: [],
        };

        // Check for confirmed lineup via live feed
        try {
          const feedRes = await fetch(
            `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=liveData,boxscore,teams,battingOrder,players`
          );
          const feedData = await feedRes.json();
          const awayOrder  = feedData.liveData?.boxscore?.teams?.away?.battingOrder || [];
          const homeOrder  = feedData.liveData?.boxscore?.teams?.home?.battingOrder || [];
          const awayP      = feedData.liveData?.boxscore?.teams?.away?.players || {};
          const homeP      = feedData.liveData?.boxscore?.teams?.home?.players || {};

          if (awayOrder.length > 0 && homeOrder.length > 0) {
            gameInfo.lineupConfirmed = true;
            gameInfo.awayLineup = awayOrder.map(id => awayP[`ID${id}`]?.person?.fullName).filter(Boolean);
            gameInfo.homeLineup = homeOrder.map(id => homeP[`ID${id}`]?.person?.fullName).filter(Boolean);
            results.mlb.confirmedLineups.push({
              gamePk,
              matchup: `${away?.team?.name} @ ${home?.team?.name}`,
              awayLineup: gameInfo.awayLineup,
              homeLineup: gameInfo.homeLineup,
              awayPitcher: gameInfo.awayPitcher,
              homePitcher: gameInfo.homePitcher,
            });
          }
        } catch {}

        results.mlb.games.push(gameInfo);
      }
    } catch(e) {
      results.errors.push(`MLB lineups: ${e.message}`);
    }

    // ── NBA Lineup Check via ESPN ────────────────────────────────────────────
    try {
      const todayFormatted = today.replace(/-/g, '');
      const scoreRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayFormatted}`
      );
      const scoreData = await scoreRes.json();
      const events = scoreData.events || [];

      for (const event of events) {
        const comp       = event.competitions?.[0];
        const away       = comp?.competitors?.find(c=>c.homeAway==='away');
        const home       = comp?.competitors?.find(c=>c.homeAway==='home');
        const status     = comp?.status?.type?.description;
        const isLive     = comp?.status?.type?.state === 'in';
        const isFinal    = comp?.status?.type?.state === 'post';

        const gameInfo = {
          gameId:    event.id,
          away:      away?.team?.displayName,
          home:      home?.team?.displayName,
          awayId:    away?.team?.id,
          homeId:    home?.team?.id,
          status,
          isLive,
          isFinal,
          awayScore: away?.score,
          homeScore: home?.score,
          lineupConfirmed: isLive || isFinal,
        };

        // If game is live/final, lineup is confirmed
        if (isLive || isFinal) {
          results.nba.confirmedLineups.push({
            gameId:  event.id,
            matchup: `${away?.team?.displayName} @ ${home?.team?.displayName}`,
            status,
          });
        }

        results.nba.games.push(gameInfo);
      }
    } catch(e) {
      results.errors.push(`NBA lineups: ${e.message}`);
    }

    const mlbConfirmed = results.mlb.confirmedLineups.length;
    const nbaConfirmed = results.nba.confirmedLineups.length;

    console.log(`Lineup tracker: ${results.mlb.games.length} MLB games (${mlbConfirmed} confirmed), ${results.nba.games.length} NBA games (${nbaConfirmed} confirmed)`);

    return res.status(200).json({
      success: true,
      mlbGames: results.mlb.games.length,
      mlbConfirmed,
      nbaGames: results.nba.games.length,
      nbaConfirmed,
      errors: results.errors,
      timestamp: results.timestamp,
      data: results
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
