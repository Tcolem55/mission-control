export default async function handler(req, res) {
  const MLB_TEAMS = [
    {id:109,abbr:"ARI"},{id:144,abbr:"ATL"},{id:110,abbr:"BAL"},{id:111,abbr:"BOS"},
    {id:112,abbr:"CHC"},{id:145,abbr:"CWS"},{id:113,abbr:"CIN"},{id:114,abbr:"CLE"},
    {id:115,abbr:"COL"},{id:116,abbr:"DET"},{id:117,abbr:"HOU"},{id:118,abbr:"KC"},
    {id:108,abbr:"LAA"},{id:119,abbr:"LAD"},{id:146,abbr:"MIA"},{id:158,abbr:"MIL"},
    {id:142,abbr:"MIN"},{id:121,abbr:"NYM"},{id:147,abbr:"NYY"},{id:133,abbr:"OAK"},
    {id:143,abbr:"PHI"},{id:134,abbr:"PIT"},{id:135,abbr:"SD"},{id:137,abbr:"SF"},
    {id:136,abbr:"SEA"},{id:138,abbr:"STL"},{id:139,abbr:"TB"},{id:140,abbr:"TEX"},
    {id:141,abbr:"TOR"},{id:120,abbr:"WSH"}
  ];
  const NBA_TEAMS = [
    {id:"1",abbr:"ATL"},{id:"2",abbr:"BOS"},{id:"3",abbr:"NOP"},{id:"4",abbr:"CHI"},
    {id:"5",abbr:"CLE"},{id:"6",abbr:"DAL"},{id:"7",abbr:"DEN"},{id:"8",abbr:"DET"},
    {id:"9",abbr:"GSW"},{id:"10",abbr:"HOU"},{id:"11",abbr:"IND"},{id:"12",abbr:"LAC"},
    {id:"13",abbr:"LAL"},{id:"14",abbr:"MIA"},{id:"15",abbr:"MIL"},{id:"16",abbr:"MIN"},
    {id:"17",abbr:"BKN"},{id:"18",abbr:"NYK"},{id:"19",abbr:"ORL"},{id:"20",abbr:"PHI"},
    {id:"21",abbr:"PHX"},{id:"22",abbr:"POR"},{id:"23",abbr:"SAC"},{id:"24",abbr:"SAS"},
    {id:"25",abbr:"OKC"},{id:"26",abbr:"UTA"},{id:"27",abbr:"WAS"},{id:"28",abbr:"TOR"},
    {id:"29",abbr:"MEM"},{id:"30",abbr:"CHA"}
  ];

  const results = { mlb:{}, nba:{}, timestamp:new Date().toISOString(), errors:[] };
  const PITCHERS = ['P','SP','RP','CL'];

  for (const team of MLB_TEAMS) {
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/teams/${team.id}/roster?rosterType=active&season=2026`);
      const d = await r.json();
      results.mlb[team.abbr] = {
        teamId: team.id,
        roster: (d.roster||[]).map(p=>({
          id: p.person?.id,
          name: p.person?.fullName,
          position: p.position?.abbreviation,
          isPitcher: PITCHERS.includes(p.position?.abbreviation),
        })),
        updatedAt: new Date().toISOString()
      };
    } catch(e) { results.errors.push(`MLB ${team.abbr}: ${e.message}`); }
  }

  for (const team of NBA_TEAMS) {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`);
      const d = await r.json();
      const athletes = d.athletes||[];
      results.nba[team.abbr] = {
        teamId: team.id,
        roster: athletes.flatMap(g=>(g.items||[g]).map(p=>({
          id: p.id,
          name: p.fullName||p.displayName,
          position: p.position?.abbreviation,
          injuryStatus: p.injuries?.[0]?.status||null,
        }))).filter(p=>p.name),
        updatedAt: new Date().toISOString()
      };
    } catch(e) { results.errors.push(`NBA ${team.abbr}: ${e.message}`); }
  }

  return res.status(200).json({
    success: true,
    mlbTeams: Object.keys(results.mlb).length,
    nbaTeams: Object.keys(results.nba).length,
    errors: results.errors.length,
    timestamp: results.timestamp,
  });
}
