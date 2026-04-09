export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  const results = { mlb:{games:[],confirmedLineups:[]}, nba:{games:[],confirmedLineups:[]}, timestamp:new Date().toISOString(), errors:[] };

  try {
    const schedRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team,linescore`);
    const schedData = await schedRes.json();
    const games = schedData.dates?.[0]?.games||[];

    for (const game of games) {
      const gamePk = game.gamePk;
      const away = game.teams?.away;
      const home = game.teams?.home;
      const gameInfo = {
        gamePk, status: game.status?.abstractGameState,
        away: away?.team?.name, home: home?.team?.name,
        awayPitcher: away?.probablePitcher?.fullName||'TBD',
        homePitcher: home?.probablePitcher?.fullName||'TBD',
        gameTime: game.gameDate, lineupConfirmed:false,
        awayLineup:[], homeLineup:[],
      };
      try {
        const feedRes = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=liveData,boxscore,teams,battingOrder,players`);
        const feedData = await feedRes.json();
        const awayOrder = feedData.liveData?.boxscore?.teams?.away?.battingOrder||[];
        const homeOrder = feedData.liveData?.boxscore?.teams?.home?.battingOrder||[];
        const awayP = feedData.liveData?.boxscore?.teams?.away?.players||{};
        const homeP = feedData.liveData?.boxscore?.teams?.home?.players||{};
        if (awayOrder.length>0 && homeOrder.length>0) {
          gameInfo.lineupConfirmed = true;
          gameInfo.awayLineup = awayOrder.map(id=>awayP[`ID${id}`]?.person?.fullName).filter(Boolean);
          gameInfo.homeLineup = homeOrder.map(id=>homeP[`ID${id}`]?.person?.fullName).filter(Boolean);
          results.mlb.confirmedLineups.push({ gamePk, matchup:`${away?.team?.name} @ ${home?.team?.name}`, awayLineup:gameInfo.awayLineup, homeLineup:gameInfo.homeLineup, awayPitcher:gameInfo.awayPitcher, homePitcher:gameInfo.homePitcher });
        }
      } catch {}
      results.mlb.games.push(gameInfo);
    }
  } catch(e) { results.errors.push(`MLB lineups: ${e.message}`); }

  try {
    const todayFmt = today.replace(/-/g,'');
    const scoreRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayFmt}`);
    const scoreData = await scoreRes.json();
    for (const event of scoreData.events||[]) {
      const comp = event.competitions?.[0];
      const away = comp?.competitors?.find(c=>c.homeAway==='away');
      const home = comp?.competitors?.find(c=>c.homeAway==='home');
      const isLive = comp?.status?.type?.state==='in';
      const isFinal = comp?.status?.type?.state==='post';
      const gameInfo = {
        gameId:event.id, away:away?.team?.displayName, home:home?.team?.displayName,
        awayId:away?.team?.id, homeId:home?.team?.id,
        status:comp?.status?.type?.description, isLive, isFinal,
        awayScore:away?.score, homeScore:home?.score,
        lineupConfirmed:isLive||isFinal,
      };
      if (isLive||isFinal) results.nba.confirmedLineups.push({ gameId:event.id, matchup:`${away?.team?.displayName} @ ${home?.team?.displayName}`, status:comp?.status?.type?.description });
      results.nba.games.push(gameInfo);
    }
  } catch(e) { results.errors.push(`NBA lineups: ${e.message}`); }

  return res.status(200).json({
    success:true,
    mlbGames:results.mlb.games.length, mlbConfirmed:results.mlb.confirmedLineups.length,
    nbaGames:results.nba.games.length, nbaConfirmed:results.nba.confirmedLineups.length,
    errors:results.errors, timestamp:results.timestamp, data:results
  });
}
