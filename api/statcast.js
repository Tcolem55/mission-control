export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { type, playerId, year } = req.query;
  const yr = year || new Date().getFullYear();

  try {

    // ── Statcast batter leaderboard — Hard Hit%, Barrel%, xBA, xSLG ──────────
    if (type === 'batter' && playerId) {
      const ids = playerId.split(',').filter(Boolean).slice(0, 20);
      const results = {};

      await Promise.all(ids.map(async id => {
        try {
          // Baseball Savant expected stats leaderboard for specific player
          const r = await fetch(
            `https://baseballsavant.mlb.com/statcast_search/csv?hfPT=&hfAB=&hfGT=R%7C&hfPR=&hfZO=&hfBBL=&hfNewZones=&hfPull=&hfC=&hfSea=${yr}%7C&hfSit=&player_type=batter&hfOuts=&hfOpponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=&game_date_lt=&hfMo=&hfTeam=&home_road=&hfRO=&position=&hfInfield=&hfOutfield=&hfInn=&hfBBT=&batters_lookup%5B%5D=${id}&hfFlag=is%5C.%5C.hard%5C.%5C.hit%7C&metric_1=&hfInnFrame=&hfFrames=&type=details&`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
          );
          const text = await r.text();
          const lines = text.split('\n').filter(l => l.trim());
          if (lines.length < 2) return;

          // Parse CSV headers
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
          const evIdx      = headers.indexOf('launch_speed');
          const laIdx      = headers.indexOf('launch_angle');
          const isBarrelIdx = headers.indexOf('launch_speed_angle');

          let totalBBE = 0, hardHits = 0, barrels = 0, totalEV = 0;

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const ev  = parseFloat(cols[evIdx]);
            const lsa = parseInt(cols[isBarrelIdx]);
            if (!isNaN(ev)) {
              totalBBE++;
              totalEV += ev;
              if (ev >= 95) hardHits++;
              if (lsa === 6) barrels++;
            }
          }

          if (totalBBE > 0) {
            results[id] = {
              hardHitPct: ((hardHits/totalBBE)*100).toFixed(1),
              barrelPct:  ((barrels/totalBBE)*100).toFixed(1),
              avgEV:      (totalEV/totalBBE).toFixed(1),
              bbe:        totalBBE,
            };
          }
        } catch {}
      }));

      return res.status(200).json(results);
    }

    // ── Statcast leaderboard — season totals for all qualified batters ────────
    if (type === 'leaderboard') {
      const r = await fetch(
        `https://baseballsavant.mlb.com/leaderboard/statcast?type=batter&year=${yr}&position=&team=&min=q&csv=true`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );
      const text = await r.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return res.status(200).json([]);

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
      const get = (row, field) => {
        const idx = headers.indexOf(field);
        return idx >= 0 ? row[idx]?.trim().replace(/"/g,'') : null;
      };

      const players = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < 5) continue;
        players.push({
          id:         get(cols,'player_id'),
          name:       get(cols,'player_name') || get(cols,'last_name, first_name'),
          hardHitPct: get(cols,'hard_hit_percent'),
          barrelPct:  get(cols,'barrel_batted_rate') || get(cols,'brl_percent'),
          avgEV:      get(cols,'avg_hit_speed') || get(cols,'launch_speed'),
          xBA:        get(cols,'xba'),
          xSLG:       get(cols,'xslg'),
          xwOBA:      get(cols,'xwoba'),
          avgLA:      get(cols,'avg_launch_angle') || get(cols,'launch_angle'),
          bbe:        get(cols,'batted_balls') || get(cols,'bbe'),
        });
      }
      return res.status(200).json(players);
    }

    // ── Ballpark factors ──────────────────────────────────────────────────────
    if (type === 'park') {
      // Static park factors (HR and runs) — updated for 2026 season
      const PARK_FACTORS = {
        "Coors Field":             { hr:138, runs:121, name:"COL", flag:"🔥 HITTER'S PARK" },
        "Great American Ball Park":{ hr:118, runs:112, name:"CIN", flag:"🔥 HITTER'S PARK" },
        "Fenway Park":             { hr:104, runs:108, name:"BOS", flag:"⚾ NEUTRAL" },
        "Yankee Stadium":          { hr:112, runs:106, name:"NYY", flag:"🔥 HITTER'S PARK" },
        "Globe Life Field":        { hr:98,  runs:97,  name:"TEX", flag:"🏔️ PITCHER'S PARK" },
        "Busch Stadium":           { hr:90,  runs:93,  name:"STL", flag:"🏔️ PITCHER'S PARK" },
        "Petco Park":              { hr:88,  runs:91,  name:"SD",  flag:"🏔️ PITCHER'S PARK" },
        "Oracle Park":             { hr:85,  runs:90,  name:"SF",  flag:"🏔️ PITCHER'S PARK" },
        "Dodger Stadium":          { hr:96,  runs:97,  name:"LAD", flag:"⚾ NEUTRAL" },
        "Wrigley Field":           { hr:108, runs:104, name:"CHC", flag:"🔥 HITTER'S PARK" },
        "Truist Park":             { hr:103, runs:102, name:"ATL", flag:"⚾ NEUTRAL" },
        "LoanDepot Park":          { hr:82,  runs:88,  name:"MIA", flag:"🏔️ PITCHER'S PARK" },
        "Citi Field":              { hr:95,  runs:97,  name:"NYM", flag:"⚾ NEUTRAL" },
        "Camden Yards":            { hr:105, runs:103, name:"BAL", flag:"⚾ NEUTRAL" },
        "Citizens Bank Park":      { hr:114, runs:109, name:"PHI", flag:"🔥 HITTER'S PARK" },
        "Nationals Park":          { hr:98,  runs:99,  name:"WSH", flag:"⚾ NEUTRAL" },
        "Minute Maid Park":        { hr:102, runs:103, name:"HOU", flag:"⚾ NEUTRAL" },
        "American Family Field":   { hr:107, runs:104, name:"MIL", flag:"🔥 HITTER'S PARK" },
        "Target Field":            { hr:94,  runs:97,  name:"MIN", flag:"⚾ NEUTRAL" },
        "Guaranteed Rate Field":   { hr:108, runs:106, name:"CWS", flag:"🔥 HITTER'S PARK" },
        "Progressive Field":       { hr:96,  runs:99,  name:"CLE", flag:"⚾ NEUTRAL" },
        "Comerica Park":           { hr:88,  runs:93,  name:"DET", flag:"🏔️ PITCHER'S PARK" },
        "Kauffman Stadium":        { hr:93,  runs:96,  name:"KC",  flag:"⚾ NEUTRAL" },
        "T-Mobile Park":           { hr:87,  runs:91,  name:"SEA", flag:"🏔️ PITCHER'S PARK" },
        "Oakland Coliseum":        { hr:91,  runs:94,  name:"OAK", flag:"⚾ NEUTRAL" },
        "Angel Stadium":           { hr:95,  runs:97,  name:"LAA", flag:"⚾ NEUTRAL" },
        "Chase Field":             { hr:105, runs:103, name:"ARI", flag:"🔥 HITTER'S PARK" },
        "Coors Field":             { hr:138, runs:121, name:"COL", flag:"🔥 HITTER'S PARK" },
        "Tropicana Field":         { hr:96,  runs:98,  name:"TB",  flag:"⚾ NEUTRAL" },
        "Rogers Centre":           { hr:110, runs:107, name:"TOR", flag:"🔥 HITTER'S PARK" },
        "Sahlen Field":            { hr:96,  runs:98,  name:"BUF", flag:"⚾ NEUTRAL" },
      };
      return res.status(200).json(PARK_FACTORS);
    }

    // ── NBA back-to-back schedule check ──────────────────────────────────────
    if (type === 'b2b') {
      const today     = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
      const todayFmt  = today.replace(/-/g,'');
      const yestFmt   = yesterday.replace(/-/g,'');

      const [todayRes, yestRes] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${todayFmt}`),
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${yestFmt}`),
      ]);
      const [todayData, yestData] = await Promise.all([todayRes.json(), yestRes.json()]);

      // Get teams that played yesterday
      const playedYesterday = new Set();
      (yestData.events||[]).forEach(e => {
        e.competitions?.[0]?.competitors?.forEach(c => {
          playedYesterday.add(c.team?.abbreviation);
        });
      });

      // Check which teams playing today also played yesterday
      const b2bTeams = {};
      (todayData.events||[]).forEach(e => {
        const comp = e.competitions?.[0];
        comp?.competitors?.forEach(c => {
          const abbr = c.team?.abbreviation;
          if (playedYesterday.has(abbr)) {
            b2bTeams[abbr] = {
              team:       c.team?.displayName,
              abbr,
              isB2B:      true,
              homeAway:   c.homeAway,
            };
          }
        });
      });

      return res.status(200).json({ b2bTeams, playedYesterday: [...playedYesterday] });
    }

    // ── NBA recent form — last 7 days ─────────────────────────────────────────
    if (type === 'nbarecent' && playerId) {
      const ids = playerId.split(',').filter(Boolean).slice(0, 15);
      const results = {};

      await Promise.all(ids.map(async id => {
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${id}/gamelog?season=2025`
          );
          const d = await r.json();
          const categories = d.categories||[];
          const events     = d.events||{};
          const labels     = categories.map(c=>c.abbreviation||c.name);
          const keys       = Object.keys(events).slice(-7); // last 7 games

          if (!keys.length) return;

          const games = keys.map(key => {
            const ev    = events[key];
            const stats = ev?.stats||[];
            const gs    = {};
            labels.forEach((l,i)=>{ gs[l]=stats[i]; });
            return { date: ev?.gameDate, opponent: ev?.opponent?.displayName, home: ev?.home, ...gs };
          }).filter(g => g.PTS !== undefined);

          const avg = f => {
            const vals = games.map(g=>parseFloat(g[f])||0);
            return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '0';
          };

          results[id] = {
            last7Games: games.length,
            avgPTS: avg('PTS'), avgREB: avg('REB'), avgAST: avg('AST'),
            avg3PM: avg('3PM'), avgSTL: avg('STL'),
            trend: games.map(g=>({ date:g.date?.slice(5)||'?', opp:g.opponent?.slice(0,3)||'?', pts:g.PTS||0, reb:g.REB||0, ast:g.AST||0 })),
          };
        } catch {}
      }));

      return res.status(200).json(results);
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
