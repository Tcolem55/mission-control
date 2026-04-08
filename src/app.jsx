import { useState, useEffect, useRef } from "react";

const NAME = "Tris";
const MACROS_GOAL = { kcal: 3300, protein: 200, carbs: 380, fat: 90 };

const WATCHLIST = [
  { ticker:"NVDA", name:"Nvidia",         sector:"AI"     },
  { ticker:"TSM",  name:"Taiwan Semi",    sector:"AI"     },
  { ticker:"PLTR", name:"Palantir",       sector:"AI"     },
  { ticker:"AMD",  name:"AMD",            sector:"AI"     },
  { ticker:"MSFT", name:"Microsoft",      sector:"TECH"   },
  { ticker:"GEV",  name:"GE Vernova",     sector:"ENERGY" },
  { ticker:"VRT",  name:"Vertiv",         sector:"ENERGY" },
  { ticker:"BE",   name:"Bloom Energy",   sector:"ENERGY" },
  { ticker:"UNH",  name:"UnitedHealth",   sector:"HEALTH" },
  { ticker:"ISRG", name:"Intuitive Surg", sector:"HEALTH" },
  { ticker:"LLY",  name:"Eli Lilly",      sector:"HEALTH" },
  { ticker:"AXSM", name:"Axsome Therap.", sector:"HEALTH" },
];

const SECTOR_COLORS = { AI:"#a78bfa", TECH:"#38bdf8", ENERGY:"#fbbf24", HEALTH:"#f472b6" };

const PANELS_CFG = [
  {
    id:"command", label:"COMMAND AI", icon:"◈", color:"#c084fc", dim:"#c084fc20",
    system:`You are the personal AI command center for ${NAME} (Tris). He is into fitness (runs MWF, lifts 5-6 days, 216 lbs, body recomp), tech, investing (watchlist: NVDA, TSM, PLTR, AMD, MSFT, GEV, VRT, BE, UNH, ISRG, LLY, AXSM), and world news. Be sharp, concise, highly personalized.`,
    quickPrompts:["Daily briefing","Plan my day","Connect the dots","What should I focus on?"],
    placeholder:"Ask me anything, Tris...",
  },
  {
    id:"news", label:"WORLD NEWS", icon:"🌐", color:"#fb923c", dim:"#fb923c20",
    system:`You are a world news analyst briefing ${NAME}. Give concise, balanced summaries of current events and how they affect markets and everyday life. Use provided news context for real-time answers.`,
    quickPrompts:["Top stories now","Market-moving news","Tech headlines","How does this affect me?"],
    placeholder:"Ask about world events...",
  },
  {
    id:"markets", label:"MARKETS", icon:"📈", color:"#38bdf8", dim:"#38bdf820",
    system:`You are a sharp financial analyst advising ${NAME}. His watchlist: NVDA, TSM, PLTR, AMD, MSFT (AI/Tech), GEV, VRT, BE (Energy), UNH, ISRG, LLY, AXSM (Health). Give concise actionable insights. Not financial advice.`,
    quickPrompts:["Analyze my watchlist","Best opportunity?","Market outlook","Biggest risks?"],
    placeholder:"Ask about stocks, markets...",
  },
  {
    id:"fitness", label:"FITNESS", icon:"⚡", color:"#00ff88", dim:"#00ff8820",
    system:`You are an elite fitness and nutrition coach for ${NAME}. He runs MWF, lifts 5-6 days/week, weighs 216 lbs, body recomp goal. Split: legs/push/pull/shoulders/pull/push. Targets: 3300 kcal, 200g protein, 380g carbs, 90g fat. Proteins: chicken, fish, steak, shrimp (no eggs). Carbs: rice, potatoes, protein pasta. Snacks: Greek yogurt, peanut butter. Supplements: creatine 5g/day, D3+K2, magnesium glycinate. Be concise, expert, personalized.`,
    quickPrompts:["Today's nutrition plan","Recovery tips","Pre-workout fuel","Supplement timing"],
    placeholder:"Ask about training, nutrition...",
  },
];

// ── Utils ─────────────────────────────────────────────────────────────────────
const fmt  = n => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n?.toFixed(2) ?? "--"}`;
const fmtP = n => `${n >= 0 ? "+" : ""}${n?.toFixed(2) ?? "--"}%`;
const getTodayKey = () => new Date().toISOString().split("T")[0];
const getGreeting = () => { const h=new Date().getHours(); return h<12?"GOOD MORNING":h<17?"GOOD AFTERNOON":"GOOD EVENING"; };
const loadMacros  = () => { try { const r=localStorage.getItem(`macros_${getTodayKey()}`); return r?JSON.parse(r):{kcal:0,protein:0,carbs:0,fat:0}; } catch { return {kcal:0,protein:0,carbs:0,fat:0}; }};
const saveMacros  = m => { try { localStorage.setItem(`macros_${getTodayKey()}`,JSON.stringify(m)); } catch {} };
const loadHistory = id => { try { const r=localStorage.getItem(`chat_${id}`); return r?JSON.parse(r):[]; } catch { return []; }};
const saveHistory = (id,msgs) => { try { localStorage.setItem(`chat_${id}`,JSON.stringify(msgs.slice(-20))); } catch {} };
const loadPortfolio = () => { try { const r=localStorage.getItem("portfolio"); return r?JSON.parse(r):{}; } catch { return {}; }};
const savePortfolio = p => { try { localStorage.setItem("portfolio",JSON.stringify(p)); } catch {} };

async function askClaude(messages, system) {
  const res = await fetch('/api/claude', {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800, system, messages }),
  });
  const data = await res.json();
  return data.content?.map(b=>b.text||"").join("") || "No response.";
}

async function fetchStock(ticker) {
  try {
    const r = await fetch(`/api/stocks?ticker=${ticker}`);
    const d = await r.json();
    if (d.results?.[0]) {
      const s = d.results[0];
      return { price:s.c, changePct:((s.c-s.o)/s.o)*100, high:s.h, low:s.l, open:s.o, volume:s.v };
    }
    return null;
  } catch { return null; }
}

async function fetchAllStocks() {
  const out = {};
  await Promise.all(WATCHLIST.map(async s => { const d=await fetchStock(s.ticker); if(d) out[s.ticker]=d; }));
  return out;
}

async function fetchChartData(ticker, days=30) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const from = start.toISOString().split("T")[0];
    const to = end.toISOString().split("T")[0];
    const r = await fetch(`/api/stocks?ticker=${ticker}&chart=true&from=${from}&to=${to}`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

async function fetchNews(type="top", q="") {
  try {
    const url = type==="top" ? `/api/news?type=top` : `/api/news?q=${encodeURIComponent(q)}`;
    const r = await fetch(url);
    const d = await r.json();
    return d.articles?.filter(a=>a.title&&a.title!=="[Removed]").slice(0,12) || [];
  } catch { return []; }
}

async function getWeather() {
  try {
    const g = await fetch("https://ipapi.co/json/"); const loc = await g.json();
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weathercode&temperature_unit=fahrenheit`);
    const d = await r.json();
    const code = d.current.weathercode;
    const icon = code===0?"☀️":code<=3?"🌤":code<=48?"☁️":code<=67?"🌧":"⛈";
    return { temp:Math.round(d.current.temperature_2m), icon, city:loc.city };
  } catch { return null; }
}

// ── HUD Corner Brackets ───────────────────────────────────────────────────────
function HUDBrackets({ color, size=12, thickness=2 }) {
  const s = { position:"absolute", width:size, height:size, zIndex:5 };
  const b = `${thickness}px solid ${color}`;
  return (
    <>
      <div style={{...s, top:0, left:0, borderTop:b, borderLeft:b}}/>
      <div style={{...s, top:0, right:0, borderTop:b, borderRight:b}}/>
      <div style={{...s, bottom:0, left:0, borderBottom:b, borderLeft:b}}/>
      <div style={{...s, bottom:0, right:0, borderBottom:b, borderRight:b}}/>
    </>
  );
}

// ── SVG Sparkline Chart ───────────────────────────────────────────────────────
function SparkChart({ data, color, width=500, height=160 }) {
  if (!data || data.length < 2) return (
    <div style={{width,height,display:"flex",alignItems:"center",justifyContent:"center",color:"#1a2a4a",fontSize:9,letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>
      NO CHART DATA
    </div>
  );

  const prices = data.map(d => d.c);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 20;
  const W = width - pad*2;
  const H = height - pad*2;

  const pts = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * W;
    const y = pad + H - ((p - min) / range) * H;
    return `${x},${y}`;
  });

  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `M ${pad},${pad+H} L ${pts.join(" L ")} L ${pad+W},${pad+H} Z`;
  const isUp = prices[prices.length-1] >= prices[0];
  const lineColor = isUp ? "#00ff88" : "#ff4444";
  const areaColor = isUp ? "#00ff8815" : "#ff444415";

  // X axis labels
  const labelIndices = [0, Math.floor(prices.length/2), prices.length-1];

  return (
    <svg width={width} height={height} style={{overflow:"visible"}}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={lineColor} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0,0.25,0.5,0.75,1].map((pct,i)=>(
        <line key={i} x1={pad} y1={pad+H*pct} x2={pad+W} y2={pad+H*pct} stroke="#0d2040" strokeWidth="1"/>
      ))}
      {/* Price labels */}
      {[0,0.5,1].map((pct,i)=>(
        <text key={i} x={pad-4} y={pad+H*pct+4} fill="#1a2a4a" fontSize="8" textAnchor="end" fontFamily="'Orbitron',monospace">
          ${(max - range*pct).toFixed(0)}
        </text>
      ))}
      {/* Area fill */}
      <path d={areaPath} fill="url(#chartGrad)" opacity="0.6"/>
      {/* Line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" style={{filter:`drop-shadow(0 0 4px ${lineColor})`}}/>
      {/* Data points at start/end */}
      <circle cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r="3" fill={lineColor} opacity="0.5"/>
      <circle cx={pts[pts.length-1].split(",")[0]} cy={pts[pts.length-1].split(",")[1]} r="4" fill={lineColor} style={{filter:`drop-shadow(0 0 6px ${lineColor})`}}/>
    </svg>
  );
}

// ── Stock Chart Modal ─────────────────────────────────────────────────────────
function StockChartModal({ stock, stockData, onClose }) {
  const [range, setRange] = useState(30);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [portfolio, setPortfolio] = useState(loadPortfolio());
  const [tab, setTab] = useState("CHART");

  const sc = SECTOR_COLORS[stock.sector] || "#38bdf8";
  const d = stockData;
  const up = d ? d.changePct >= 0 : null;

  const saved = portfolio[stock.ticker] || {};
  const totalValue = saved.shares && d ? (saved.shares * d.price) : null;
  const totalCost  = saved.shares && saved.avgCost ? (saved.shares * saved.avgCost) : null;
  const pnl = totalValue && totalCost ? totalValue - totalCost : null;
  const pnlPct = pnl && totalCost ? (pnl/totalCost)*100 : null;

  useEffect(()=>{
    setChartLoading(true);
    fetchChartData(stock.ticker, range).then(data => {
      setChartData(data);
      setChartLoading(false);
    });
  }, [stock.ticker, range]);

  const savePosition = () => {
    if (!shares) return;
    const updated = { ...portfolio, [stock.ticker]:{ shares:Number(shares), avgCost:Number(avgCost)||0 } };
    setPortfolio(updated);
    savePortfolio(updated);
    setShares(""); setAvgCost("");
  };

  const clearPosition = () => {
    const updated = { ...portfolio };
    delete updated[stock.ticker];
    setPortfolio(updated);
    savePortfolio(updated);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)"}} onClick={onClose}>
      <div style={{background:"linear-gradient(135deg,#030810,#040c1a,#030810)",border:`1px solid ${sc}30`,borderRadius:4,width:600,maxWidth:"95vw",maxHeight:"90vh",overflow:"hidden",boxShadow:`0 0 80px ${sc}15`,position:"relative",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <HUDBrackets color={sc} size={14} thickness={2}/>

        {/* Top glow */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${sc}80,transparent)`}}/>

        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${sc}18`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:8,height:40,borderRadius:2,background:sc,boxShadow:`0 0 12px ${sc}`}}/>
            <div>
              <div style={{fontSize:20,fontWeight:"900",color:"#e0f0ff",letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>{stock.ticker}</div>
              <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{stock.name} · {stock.sector}</div>
            </div>
            {d && (
              <div style={{marginLeft:12}}>
                <div style={{fontSize:22,fontWeight:"bold",color:"#c8d8f0",fontFamily:"'Orbitron',monospace"}}>{fmt(d.price)}</div>
                <div style={{fontSize:11,color:up?"#00ff88":"#ff4444",fontFamily:"'Orbitron',monospace"}}>{fmtP(d.changePct)} TODAY</div>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{background:`${sc}15`,border:`1px solid ${sc}30`,color:sc,width:28,height:28,borderRadius:3,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Orbitron',monospace"}}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:`1px solid ${sc}15`,flexShrink:0}}>
          {["CHART","PORTFOLIO","STATS"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px",fontSize:8,letterSpacing:3,cursor:"pointer",background:tab===t?`${sc}15`:"transparent",border:"none",borderBottom:tab===t?`2px solid ${sc}`:"2px solid transparent",color:tab===t?sc:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{flex:1,overflow:"auto",padding:20}}>

          {/* CHART TAB */}
          {tab==="CHART" && (
            <div>
              <div style={{display:"flex",gap:6,marginBottom:16}}>
                {[7,30,90].map(r=>(
                  <button key={r} onClick={()=>setRange(r)} style={{padding:"4px 14px",fontSize:8,letterSpacing:2,cursor:"pointer",background:range===r?`${sc}20`:"transparent",border:range===r?`1px solid ${sc}50`:"1px solid #0d2040",borderRadius:2,color:range===r?sc:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
                    {r}D
                  </button>
                ))}
              </div>
              {chartLoading ? (
                <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:sc,fontSize:9,letterSpacing:4,fontFamily:"'Orbitron',monospace",animation:"pulse 1s infinite"}}>
                  LOADING CHART...
                </div>
              ) : (
                <div style={{width:"100%",overflowX:"auto"}}>
                  <SparkChart data={chartData} color={sc} width={540} height={180}/>
                </div>
              )}
              {chartData.length > 0 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:16}}>
                  {[
                    {label:"PERIOD HIGH", val:`$${Math.max(...chartData.map(d=>d.h)).toFixed(2)}`},
                    {label:"PERIOD LOW",  val:`$${Math.min(...chartData.map(d=>d.l)).toFixed(2)}`},
                    {label:"PERIOD CHG",  val:fmtP(((chartData[chartData.length-1]?.c - chartData[0]?.o) / chartData[0]?.o)*100)},
                  ].map(({label,val})=>(
                    <div key={label} style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:3,padding:"10px 12px",textAlign:"center"}}>
                      <div style={{fontSize:7,color:"#2a3a5a",letterSpacing:2,marginBottom:4,fontFamily:"'Orbitron',monospace"}}>{label}</div>
                      <div style={{fontSize:13,color:"#a0c0e0",fontFamily:"'Orbitron',monospace"}}>{val}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PORTFOLIO TAB */}
          {tab==="PORTFOLIO" && (
            <div>
              {saved.shares ? (
                <div style={{background:"#0a1220",border:`1px solid ${sc}20`,borderRadius:3,padding:16,marginBottom:16}}>
                  <div style={{fontSize:8,color:sc,letterSpacing:3,marginBottom:12,fontFamily:"'Orbitron',monospace"}}>YOUR POSITION</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[
                      {label:"SHARES", val:saved.shares},
                      {label:"AVG COST", val:saved.avgCost?`$${saved.avgCost}`:"—"},
                      {label:"MARKET VALUE", val:totalValue?`$${totalValue.toFixed(2)}`:"—"},
                      {label:"TOTAL COST", val:totalCost?`$${totalCost.toFixed(2)}`:"—"},
                    ].map(({label,val})=>(
                      <div key={label}>
                        <div style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif",marginBottom:3}}>{label}</div>
                        <div style={{fontSize:15,color:"#d0e0f5",fontFamily:"'Orbitron',monospace",fontWeight:"bold"}}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {pnl !== null && (
                    <div style={{marginTop:14,padding:"10px 14px",background:pnl>=0?"#00ff8810":"#ff444410",border:`1px solid ${pnl>=0?"#00ff8830":"#ff444430"}`,borderRadius:3}}>
                      <div style={{fontSize:8,color:"#2a3a5a",letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:4}}>UNREALIZED P&L</div>
                      <div style={{fontSize:20,fontWeight:"bold",color:pnl>=0?"#00ff88":"#ff4444",fontFamily:"'Orbitron',monospace"}}>
                        {pnl>=0?"+":""}{pnl.toFixed(2)} <span style={{fontSize:12}}>({pnlPct>=0?"+":""}{pnlPct?.toFixed(2)}%)</span>
                      </div>
                    </div>
                  )}
                  <button onClick={clearPosition} style={{marginTop:12,width:"100%",padding:"8px",background:"#ff444410",border:"1px solid #ff444430",borderRadius:3,color:"#ff4444",fontSize:9,cursor:"pointer",letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>CLEAR POSITION</button>
                </div>
              ) : (
                <div style={{padding:"20px",textAlign:"center",color:"#1a2a4a",fontSize:9,letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:16}}>NO POSITION TRACKED</div>
              )}
              <div style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:3,padding:16}}>
                <div style={{fontSize:8,color:"#2a3a5a",letterSpacing:3,marginBottom:12,fontFamily:"'Orbitron',monospace"}}>LOG POSITION</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  {[{key:"shares",label:"SHARES",val:shares,set:setShares},{key:"avgCost",label:"AVG COST ($)",val:avgCost,set:setAvgCost}].map(({key,label,val,set})=>(
                    <div key={key}>
                      <div style={{fontSize:7,color:"#1a2a4a",letterSpacing:2,marginBottom:4,fontFamily:"'Orbitron',monospace"}}>{label}</div>
                      <input type="number" value={val} onChange={e=>set(e.target.value)} placeholder="0"
                        style={{width:"100%",background:"#050d18",border:"1px solid #0d2040",borderRadius:3,padding:"8px 10px",color:"#a0c0e0",fontSize:12,fontFamily:"'Orbitron',monospace",outline:"none",boxSizing:"border-box"}}/>
                    </div>
                  ))}
                </div>
                <button onClick={savePosition} style={{width:"100%",padding:"10px",background:`linear-gradient(135deg,${sc}20,${sc}10)`,border:`1px solid ${sc}40`,borderRadius:3,color:sc,fontSize:9,cursor:"pointer",letterSpacing:3,fontFamily:"'Orbitron',monospace",boxShadow:`0 0 15px ${sc}15`}}>
                  SAVE POSITION
                </button>
              </div>
            </div>
          )}

          {/* STATS TAB */}
          {tab==="STATS" && d && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                {label:"OPEN",   val:fmt(d.open)},
                {label:"CLOSE",  val:fmt(d.price)},
                {label:"HIGH",   val:fmt(d.high)},
                {label:"LOW",    val:fmt(d.low)},
                {label:"CHANGE", val:fmtP(d.changePct)},
                {label:"VOLUME", val:d.volume?`${(d.volume/1e6).toFixed(1)}M`:"—"},
                {label:"SECTOR", val:stock.sector},
                {label:"STATUS", val:"PREV CLOSE"},
              ].map(({label,val})=>(
                <div key={label} style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:3,padding:"12px 14px"}}>
                  <div style={{fontSize:7,color:"#2a3a5a",letterSpacing:2,marginBottom:4,fontFamily:"'Orbitron',monospace"}}>{label}</div>
                  <div style={{fontSize:15,color:"#c0d8f0",fontFamily:"'Orbitron',monospace",fontWeight:"bold"}}>{val}</div>
                </div>
              ))}
            </div>
          )}
          {tab==="STATS" && !d && (
            <div style={{textAlign:"center",color:"#1a2a4a",fontSize:9,letterSpacing:3,fontFamily:"'Orbitron',monospace",padding:40}}>NO DATA — MARKET MAY BE CLOSED</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Animated Ring ─────────────────────────────────────────────────────────────
function Ring({ pct, color, size=56, label, value }) {
  const r = (size-8)/2;
  const circ = 2*Math.PI*r;
  const dash = (pct/100)*circ;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#0d1a0d" strokeWidth={6}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:11,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{pct}%</span>
        </div>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:8,color,letterSpacing:2,opacity:0.7}}>{label}</div>
        <div style={{fontSize:9,color:"#aaa"}}>{value}</div>
      </div>
    </div>
  );
}

// ── Macro Modal ───────────────────────────────────────────────────────────────
function MacroModal({ onClose }) {
  const [macros, setMacros] = useState(loadMacros());
  const [form, setForm] = useState({ kcal:"", protein:"", carbs:"", fat:"" });

  const add = () => {
    const u = { kcal:macros.kcal+(Number(form.kcal)||0), protein:macros.protein+(Number(form.protein)||0), carbs:macros.carbs+(Number(form.carbs)||0), fat:macros.fat+(Number(form.fat)||0) };
    setMacros(u); saveMacros(u); setForm({kcal:"",protein:"",carbs:"",fat:""});
  };
  const reset = () => { const e={kcal:0,protein:0,carbs:0,fat:0}; setMacros(e); saveMacros(e); };

  const rings = [
    { label:"KCAL", color:"#00ff88", cur:macros.kcal, goal:MACROS_GOAL.kcal },
    { label:"PROTEIN", color:"#f472b6", cur:macros.protein, goal:MACROS_GOAL.protein },
    { label:"CARBS", color:"#fbbf24", cur:macros.carbs, goal:MACROS_GOAL.carbs },
    { label:"FAT", color:"#38bdf8", cur:macros.fat, goal:MACROS_GOAL.fat },
  ];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}} onClick={onClose}>
      <div style={{background:"linear-gradient(135deg,#050d10,#0a1628)",border:"1px solid #00ff8830",borderRadius:4,padding:28,width:360,position:"relative",boxShadow:"0 0 60px #00ff8815, inset 0 0 60px #00000040"}} onClick={e=>e.stopPropagation()}>
        <HUDBrackets color="#00ff88" size={14}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <div style={{fontSize:8,letterSpacing:4,color:"#00ff88",marginBottom:2}}>⚡ NUTRITION TRACKER</div>
            <div style={{fontSize:10,color:"#334",letterSpacing:2}}>{new Date().toDateString().toUpperCase()}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid #ffffff10",color:"#555",cursor:"pointer",fontSize:12,width:24,height:24,borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{display:"flex",justifyContent:"space-around",marginBottom:24}}>
          {rings.map(({label,color,cur,goal})=>(
            <Ring key={label} pct={Math.min(Math.round((cur/goal)*100),100)} color={color} label={label} value={`${cur}/${goal}`} size={60}/>
          ))}
        </div>
        <div style={{borderTop:"1px solid #ffffff08",paddingTop:20}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#334",marginBottom:10}}>LOG MEAL</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {["kcal","protein","carbs","fat"].map(k=>(
              <div key={k} style={{position:"relative"}}>
                <input type="number" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder="0"
                  style={{width:"100%",background:"#0a1220",border:"1px solid #ffffff10",borderRadius:3,padding:"8px 10px",color:"#ccc",fontSize:11,fontFamily:"'Orbitron',monospace",outline:"none",boxSizing:"border-box"}}/>
                <div style={{position:"absolute",top:2,right:6,fontSize:7,color:"#334",letterSpacing:1}}>{k.toUpperCase()}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={add} style={{flex:1,padding:"10px",background:"linear-gradient(135deg,#00ff8815,#00ff8808)",border:"1px solid #00ff8840",borderRadius:3,color:"#00ff88",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>+ LOG</button>
            <button onClick={reset} style={{padding:"10px 16px",background:"#ff444410",border:"1px solid #ff444430",borderRadius:3,color:"#ff4444",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace"}}>CLR</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chat Component ────────────────────────────────────────────────────────────
function Chat({ panel, contextStr }) {
  const [messages, setMessages] = useState(()=>loadHistory(panel.id));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQ, setShowQ] = useState(true);
  const endRef = useRef(null);
  const c = panel.color;

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  const send = async txt => {
    const msg = txt||input.trim(); if(!msg||loading) return;
    setInput(""); setShowQ(false);
    const userMsg = {role:"user",content:msg};
    const newMsgs = [...messages,userMsg];
    setMessages(newMsgs); saveHistory(panel.id,newMsgs);
    setLoading(true);
    try {
      const fullSystem = panel.system + (contextStr?`\n\nLIVE CONTEXT:\n${contextStr}`:"");
      const reply = await askClaude(newMsgs, fullSystem);
      const final = [...newMsgs,{role:"assistant",content:reply}];
      setMessages(final); saveHistory(panel.id,final);
    } catch {
      setMessages([...newMsgs,{role:"assistant",content:"Connection error. Try again."}]);
    }
    setLoading(false);
  };

  const clear = () => { setMessages([]); setShowQ(true); saveHistory(panel.id,[]); };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{padding:"4px 12px",borderBottom:`1px solid ${c}15`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,background:`${c}05`}}>
        <span style={{fontSize:8,color:c,opacity:0.7,letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>AI INTERFACE</span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {messages.length===0&&showQ&&<button onClick={()=>setShowQ(false)} style={{fontSize:8,color:`${c}80`,background:"none",border:"none",cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>HIDE PROMPTS</button>}
          {messages.length===0&&!showQ&&<button onClick={()=>setShowQ(true)} style={{fontSize:8,color:`${c}80`,background:"none",border:"none",cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>SHOW PROMPTS</button>}
          {messages.length>0&&<button onClick={clear} style={{background:"none",border:"none",color:"#2a2a3a",cursor:"pointer",fontSize:8,letterSpacing:1,fontFamily:"'Orbitron',monospace"}}>CLEAR</button>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8,scrollbarWidth:"thin",scrollbarColor:`${c}20 transparent`,minHeight:0}}>
        {messages.length===0&&showQ&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:8,color:c,opacity:0.6,letterSpacing:3,marginBottom:4,fontFamily:"'Orbitron',monospace"}}>QUICK ACCESS</div>
            {panel.quickPrompts.map(q=>(
              <button key={q} onClick={()=>send(q)}
                style={{textAlign:"left",padding:"8px 12px",background:`${c}08`,border:`1px solid ${c}18`,borderRadius:3,color:"#8899aa",fontSize:12,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.2s",fontWeight:"400"}}
                onMouseEnter={e=>{e.currentTarget.style.background=`${c}18`;e.currentTarget.style.color=c;e.currentTarget.style.borderColor=`${c}50`;}}
                onMouseLeave={e=>{e.currentTarget.style.background=`${c}08`;e.currentTarget.style.color="#8899aa";e.currentTarget.style.borderColor=`${c}18`;}}>
                <span style={{color:c,marginRight:8,fontSize:12}}>›</span>{q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:8,animation:"fadeUp 0.3s ease"}}>
            <div style={{width:22,height:22,borderRadius:3,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:"bold",background:m.role==="user"?`${c}25`:"#0d1628",border:`1px solid ${m.role==="user"?c+"50":"#1e2d4a"}`,color:m.role==="user"?c:"#3a4a6a",marginTop:2,fontFamily:"'Orbitron',monospace"}}>
              {m.role==="user"?"YOU":"AI"}
            </div>
            <div style={{maxWidth:"82%",padding:"8px 12px",borderRadius:m.role==="user"?"3px 12px 12px 12px":"12px 3px 12px 12px",background:m.role==="user"?`linear-gradient(135deg,${c}15,${c}08)`:"linear-gradient(135deg,#0d1628,#0a1220)",border:`1px solid ${m.role==="user"?c+"25":"#1e2d4a"}`,fontSize:13,lineHeight:1.7,color:m.role==="user"?"#f0f4ff":"#c8d8f0",whiteSpace:"pre-wrap",fontFamily:"'Inter',sans-serif",boxShadow:m.role==="user"?`0 0 20px ${c}10`:"none"}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:8}}>
            <div style={{width:22,height:22,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,background:"#0d1628",border:"1px solid #1e2d4a",color:"#3a4a6a",fontFamily:"'Orbitron',monospace"}}>AI</div>
            <div style={{padding:"8px 14px",borderRadius:"12px 3px 12px 12px",background:"linear-gradient(135deg,#0d1628,#0a1220)",border:"1px solid #1e2d4a"}}>
              <span style={{color:c,letterSpacing:6,animation:"pulse 1.2s infinite",fontSize:14}}>···</span>
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"8px 10px",borderTop:`1px solid ${c}12`,display:"flex",gap:8,background:"#030810",flexShrink:0}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder={panel.placeholder}
          style={{flex:1,background:"#0a1220",border:`1px solid ${c}20`,borderRadius:3,padding:"8px 12px",color:"#dde8f5",fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none",transition:"border-color 0.2s"}}
          onFocus={e=>e.target.style.borderColor=`${c}60`}
          onBlur={e=>e.target.style.borderColor=`${c}20`}/>
        <button onClick={()=>send()} disabled={loading||!input.trim()}
          style={{padding:"8px 16px",background:loading||!input.trim()?"#0a1220":`linear-gradient(135deg,${c}25,${c}10)`,border:`1px solid ${loading||!input.trim()?"#1e2d4a":c+"50"}`,borderRadius:3,color:loading||!input.trim()?"#2a3a4a":c,cursor:loading||!input.trim()?"not-allowed":"pointer",fontSize:14,transition:"all 0.2s",boxShadow:loading||!input.trim()?"none":`0 0 15px ${c}20`}}>
          →
        </button>
      </div>
    </div>
  );
}

// ── Stock Ticker ──────────────────────────────────────────────────────────────
function StockTicker({ stocks, loading, lastUpdated, onRefresh, onSelectStock }) {
  const [filter, setFilter] = useState("ALL");
  const [collapsed, setCollapsed] = useState(false);
  const sectors = ["ALL","AI","TECH","ENERGY","HEALTH"];
  const filtered = filter==="ALL" ? WATCHLIST : WATCHLIST.filter(s=>s.sector===filter);
  const portfolio = loadPortfolio();

  return (
    <div style={{display:"flex",flexDirection:"column",height:collapsed?"auto":"100%",overflow:"hidden",transition:"height 0.3s ease"}}>
      <div style={{display:"flex",gap:4,padding:"6px 10px",borderBottom:"1px solid #0d2040",flexShrink:0,alignItems:"center"}}>
        {!collapsed && sectors.map(s=>{
          const sc = s==="ALL"?"#38bdf8":SECTOR_COLORS[s];
          return (
            <button key={s} onClick={()=>setFilter(s)} style={{padding:"3px 8px",fontSize:7,letterSpacing:2,cursor:"pointer",background:filter===s?`${sc}20`:"transparent",border:filter===s?`1px solid ${sc}50`:"1px solid transparent",borderRadius:2,color:filter===s?sc:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
              {s}
            </button>
          );
        })}
        <div style={{flex:1}}/>
        {!collapsed && <button onClick={onRefresh} style={{fontSize:8,color:"#1a2a4a",background:"none",border:"none",cursor:"pointer",letterSpacing:1,fontFamily:"'Orbitron',monospace",transition:"color 0.2s"}}
          onMouseEnter={e=>e.target.style.color="#38bdf8"}
          onMouseLeave={e=>e.target.style.color="#1a2a4a"}>
          {loading?"···":"↻ SYNC"}
        </button>}
        <button onClick={()=>setCollapsed(c=>!c)} style={{fontSize:9,color:"#38bdf8",background:"#38bdf810",border:"1px solid #38bdf825",borderRadius:2,cursor:"pointer",padding:"2px 8px",letterSpacing:1,fontFamily:"'Orbitron',monospace",marginLeft:4,transition:"all 0.2s"}}
          title={collapsed?"Expand watchlist":"Collapse watchlist"}>
          {collapsed?"▼ WATCHLIST":"▲ HIDE"}
        </button>
      </div>
      {!collapsed && <div style={{flex:1,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
        {filtered.map((s,i)=>{
          const d=stocks[s.ticker]; const up=d?d.changePct>=0:null; const sc=SECTOR_COLORS[s.sector];
          const hasPosition = portfolio[s.ticker]?.shares > 0;
          return (
            <div key={s.ticker}
              onClick={()=>onSelectStock(s)}
              style={{display:"grid",gridTemplateColumns:"8px 1fr auto auto",alignItems:"center",gap:10,padding:"7px 12px",borderBottom:"1px solid #0a1828",transition:"all 0.15s",animation:`fadeUp 0.3s ease ${i*0.04}s both`,cursor:"pointer",borderLeft:"2px solid transparent"}}
              onMouseEnter={e=>{e.currentTarget.style.background=`${sc}08`;e.currentTarget.style.borderLeftColor=sc;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderLeftColor="transparent";}}>
              <div style={{width:3,height:24,borderRadius:2,background:sc,boxShadow:`0 0 8px ${sc}`,flexShrink:0}}/>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:11,fontWeight:"bold",color:"#c8d8e8",letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>{s.ticker}</span>
                  {hasPosition&&<span style={{fontSize:6,color:"#fbbf24",background:"#fbbf2415",border:"1px solid #fbbf2430",padding:"1px 4px",borderRadius:2,letterSpacing:1}}>OWNED</span>}
                </div>
                <div style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{s.name}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,color:"#a0c0e0",letterSpacing:1,fontFamily:"'Orbitron',monospace"}}>{d?fmt(d.price):"—"}</div>
                <div style={{fontSize:7,color:"#1a2a4a",fontFamily:"'Orbitron',monospace"}}>{d?`↑${fmt(d.high)}`:"—"}</div>
              </div>
              <div style={{padding:"3px 8px",borderRadius:2,minWidth:58,textAlign:"center",background:d?(up?"#00ff8812":"#ff444412"):"#0a1220",border:d?`1px solid ${up?"#00ff8830":"#ff444430"}`:"1px solid #0d2040",boxShadow:d&&up?`0 0 10px #00ff8815`:d&&!up?`0 0 10px #ff444415`:"none"}}>
                <div style={{fontSize:9,fontWeight:"bold",color:d?(up?"#00ff88":"#ff4444"):"#1a2a4a",fontFamily:"'Orbitron',monospace"}}>{d?fmtP(d.changePct):"—"}</div>
              </div>
            </div>
          );
        })}
      </div>}
      {!collapsed && lastUpdated&&<div style={{padding:"4px 12px",fontSize:9,color:"#2a3a55",letterSpacing:1,borderTop:"1px solid #080f1e",flexShrink:0,fontFamily:"'Inter',sans-serif"}}>Last sync: {lastUpdated} · Click ticker for chart</div>}
    </div>
  );
}

// ── News Feed ─────────────────────────────────────────────────────────────────
function NewsFeed({ articles, loading, onRefresh, onArticleClick }) {
  const [cat, setCat] = useState("TOP");
  const [collapsed, setCollapsed] = useState(false);
  const categories = ["TOP","TECH","MARKETS","HEALTH"];

  return (
    <div style={{display:"flex",flexDirection:"column",height:collapsed?"auto":"100%",overflow:"hidden",transition:"height 0.3s ease"}}>
      <div style={{display:"flex",gap:4,padding:"6px 10px",borderBottom:"1px solid #1a1008",flexShrink:0,alignItems:"center"}}>
        {!collapsed && categories.map(c=>(
          <button key={c} onClick={()=>{setCat(c);onRefresh(c);}} style={{padding:"3px 8px",fontSize:7,letterSpacing:2,cursor:"pointer",background:cat===c?"#fb923c20":"transparent",border:cat===c?"1px solid #fb923c50":"1px solid transparent",borderRadius:2,color:cat===c?"#fb923c":"#2a2010",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
            {c}
          </button>
        ))}
        <div style={{flex:1}}/>
        {!collapsed && <button onClick={()=>onRefresh(cat)} style={{fontSize:8,color:"#1a1008",background:"none",border:"none",cursor:"pointer",letterSpacing:1,fontFamily:"'Orbitron',monospace"}}
          onMouseEnter={e=>e.target.style.color="#fb923c"}
          onMouseLeave={e=>e.target.style.color="#1a1008"}>
          {loading?"···":"↻ SYNC"}
        </button>}
        <button onClick={()=>setCollapsed(c=>!c)} style={{fontSize:9,color:"#fb923c",background:"#fb923c10",border:"1px solid #fb923c25",borderRadius:2,cursor:"pointer",padding:"2px 8px",letterSpacing:1,fontFamily:"'Orbitron',monospace",marginLeft:4,transition:"all 0.2s"}}
          title={collapsed?"Expand news":"Collapse news"}>
          {collapsed?"▼ NEWS":"▲ HIDE"}
        </button>
      </div>
      {!collapsed && <div style={{flex:1,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#1a1008 transparent"}}>
        {loading&&articles.length===0&&<div style={{padding:20,textAlign:"center",color:"#1a1008",fontSize:9,letterSpacing:4,fontFamily:"'Orbitron',monospace"}}>LOADING FEED...</div>}
        {articles.map((a,i)=>(
          <div key={i} onClick={()=>onArticleClick(a)}
            style={{padding:"9px 12px",borderBottom:"1px solid #100a04",cursor:"pointer",transition:"all 0.15s",animation:`fadeUp 0.3s ease ${i*0.04}s both`,borderLeft:"2px solid transparent"}}
            onMouseEnter={e=>{e.currentTarget.style.background="#fb923c08";e.currentTarget.style.borderLeftColor="#fb923c";}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderLeftColor="transparent";}}>
            <div style={{fontSize:12,color:"#d4c8b8",lineHeight:1.6,marginBottom:4,fontFamily:"'Inter',sans-serif",fontWeight:"400"}}>{a.title}</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:9,color:"#fb923c",letterSpacing:1,fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{a.source?.name}</span>
              <span style={{fontSize:7,color:"#1a1008"}}>·</span>
              <span style={{fontSize:7,color:"#2a1a08",fontFamily:"'Orbitron',monospace"}}>{new Date(a.publishedAt).toLocaleDateString([],{month:"short",day:"numeric"})}</span>
            </div>
          </div>
        ))}
        {!loading&&articles.length===0&&<div style={{padding:20,textAlign:"center",color:"#1a1008",fontSize:9,letterSpacing:4,fontFamily:"'Orbitron',monospace"}}>NO FEED DATA</div>}
      </div>}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ cfg, isExpanded, onExpand, onCollapse, extraProps }) {
  const c = cfg.color;
  const isMarkets = cfg.id==="markets";
  const isNews = cfg.id==="news";

  return (
    <div style={{position:"relative",background:`linear-gradient(135deg, #04080f 0%, #060c18 50%, #040810 100%)`,border:`1px solid ${c}25`,display:"flex",flexDirection:"column",overflow:"hidden",transition:"all 0.5s cubic-bezier(0.16,1,0.3,1)",boxShadow:isExpanded?`0 0 60px ${c}20, inset 0 0 40px ${c}05`:`inset 0 0 30px #00000040`,cursor:isExpanded?"default":"pointer",minHeight:0}}
      onClick={!isExpanded?onExpand:undefined}>
      <HUDBrackets color={c} size={14} thickness={2}/>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",opacity:0.03,backgroundImage:`linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,backgroundSize:"40px 40px"}}/>
      <div style={{position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${c}60,transparent)`,zIndex:4}}/>

      <div style={{padding:"9px 14px",borderBottom:`1px solid ${c}18`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:`linear-gradient(90deg,${c}08,transparent)`,zIndex:2}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:3,background:`${c}15`,border:`1px solid ${c}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,boxShadow:`0 0 15px ${c}20`}}>
            {cfg.icon}
          </div>
          <div>
            <div style={{fontSize:9,letterSpacing:4,color:c,fontWeight:"bold",fontFamily:"'Orbitron',monospace"}}>{cfg.label}</div>
            <div style={{fontSize:8,color:`${c}70`,letterSpacing:2,fontFamily:"'Inter',sans-serif"}}>SYSTEM ACTIVE</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {isMarkets&&extraProps.stockLoading&&<span style={{fontSize:7,color:"#fbbf2480",letterSpacing:2,fontFamily:"'Orbitron',monospace",animation:"pulse 1s infinite"}}>SYNCING</span>}
          {isNews&&extraProps.newsLoading&&<span style={{fontSize:7,color:"#fb923c80",letterSpacing:2,fontFamily:"'Orbitron',monospace",animation:"pulse 1s infinite"}}>FETCHING</span>}
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:c,boxShadow:`0 0 8px ${c}`,animation:"blink 2s infinite"}}/>
            <span style={{fontSize:7,color:`${c}50`,letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>LIVE</span>
          </div>
          {isExpanded
            ?<button onClick={e=>{e.stopPropagation();onCollapse();}} style={{background:`${c}15`,border:`1px solid ${c}30`,color:c,width:22,height:22,borderRadius:3,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 10px ${c}15`}}>✕</button>
            :<button onClick={e=>{e.stopPropagation();onExpand();}} style={{background:`${c}15`,border:`1px solid ${c}30`,color:c,width:22,height:22,borderRadius:3,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 10px ${c}15`}}>⤢</button>
          }
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,zIndex:2,overflow:"hidden"}}>
        {isMarkets ? (
          <div style={{flex:1,display:"grid",gridTemplateRows:"55% 45%",minHeight:0}}>
            <div style={{borderBottom:`1px solid ${c}10`,overflow:"hidden"}}>
              <StockTicker stocks={extraProps.stocks} loading={extraProps.stockLoading} lastUpdated={extraProps.stockUpdated} onRefresh={extraProps.onRefreshStocks} onSelectStock={extraProps.onSelectStock}/>
            </div>
            <div style={{overflow:"hidden"}}><Chat panel={cfg} contextStr={extraProps.stockContext}/></div>
          </div>
        ) : isNews ? (
          <div style={{flex:1,display:"grid",gridTemplateRows:"55% 45%",minHeight:0}}>
            <div style={{borderBottom:`1px solid ${c}10`,overflow:"hidden"}}>
              <NewsFeed articles={extraProps.articles} loading={extraProps.newsLoading} onRefresh={extraProps.onRefreshNews} onArticleClick={extraProps.onArticleClick}/>
            </div>
            <div style={{overflow:"hidden"}}><Chat panel={cfg} contextStr={extraProps.newsContext}/></div>
          </div>
        ) : (
          <Chat panel={cfg} contextStr=""/>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [time, setTime]           = useState(new Date());
  const [uptime, setUptime]       = useState(0);
  const [expanded, setExpanded]   = useState(null);
  const [weather, setWeather]     = useState(null);
  const [showMacros, setShowMacros] = useState(false);
  const [macroSnap, setMacroSnap] = useState(loadMacros());
  const [stocks, setStocks]       = useState({});
  const [stockLoading, setStockLoading] = useState(false);
  const [stockUpdated, setStockUpdated] = useState(null);
  const [articles, setArticles]   = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsContext, setNewsContext] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [booting, setBooting]     = useState(true);

  const stockContext = Object.entries(stocks).map(([t,d])=>`${t}: $${d.price?.toFixed(2)} (${fmtP(d.changePct)})`).join(", ");

  useEffect(()=>{
    const t=setInterval(()=>{ setTime(new Date()); setUptime(u=>u+1); setMacroSnap(loadMacros()); },1000);
    setTimeout(()=>setBooting(false), 1800);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{ getWeather().then(setWeather); },[]);
  useEffect(()=>{ refreshStocks(); refreshNews("TOP"); },[]);

  const refreshStocks = async () => {
    setStockLoading(true);
    const data = await fetchAllStocks();
    setStocks(data);
    setStockUpdated(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
    setStockLoading(false);
  };

  const refreshNews = async (cat="TOP") => {
    setNewsLoading(true);
    let arts = [];
    if(cat==="TOP") arts=await fetchNews("top");
    else if(cat==="TECH") arts=await fetchNews("q","technology AI software");
    else if(cat==="MARKETS") arts=await fetchNews("q","stock market investing finance");
    else if(cat==="HEALTH") arts=await fetchNews("q","health medical biotech");
    setArticles(arts);
    setNewsContext(arts.slice(0,6).map(a=>`- ${a.title} (${a.source?.name})`).join("\n"));
    setNewsLoading(false);
  };

  const formatUptime = s => {
    const h=Math.floor(s/3600).toString().padStart(2,"0");
    const m=Math.floor((s%3600)/60).toString().padStart(2,"0");
    const sec=(s%60).toString().padStart(2,"0");
    return `${h}:${m}:${sec}`;
  };

  const kcalPct = Math.min(Math.round((macroSnap.kcal/MACROS_GOAL.kcal)*100),100);
  const protPct = Math.min(Math.round((macroSnap.protein/MACROS_GOAL.protein)*100),100);

  const extraProps = {
    stocks, stockLoading, stockUpdated, stockContext,
    onRefreshStocks:refreshStocks,
    onSelectStock:setSelectedStock,
    articles, newsLoading, newsContext,
    onRefreshNews:refreshNews,
    onArticleClick:setSelectedArticle,
  };

  if (booting) return (
    <div style={{height:"100vh",width:"100vw",background:"#02040a",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Orbitron',monospace"}}>
      <div style={{fontSize:8,letterSpacing:8,color:"#00ff8840",marginBottom:16,animation:"pulse 1s infinite"}}>INITIALIZING</div>
      <div style={{fontSize:28,fontWeight:"bold",letterSpacing:6,color:"#00ff88",marginBottom:8,textShadow:"0 0 30px #00ff8860"}}>MISSION CTRL</div>
      <div style={{fontSize:10,letterSpacing:4,color:"#334",marginBottom:32}}>PERSONAL COMMAND CENTER</div>
      <div style={{width:200,height:2,background:"#0a1a0a",borderRadius:1,overflow:"hidden"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#00ff88,#38bdf8)",borderRadius:1,animation:"bootbar 1.8s ease forwards"}}/>
      </div>
      <style>{`@keyframes bootbar{from{width:0}to{width:100%}}`}</style>
    </div>
  );

  return (
    <div style={{height:"100vh",width:"100vw",background:"#02040a",color:"#e8e8f0",fontFamily:"'Orbitron',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:200,background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.015) 3px,rgba(0,0,0,0.015) 4px)"}}/>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,opacity:0.02,backgroundImage:"linear-gradient(#00ff88 1px,transparent 1px),linear-gradient(90deg,#00ff88 1px,transparent 1px)",backgroundSize:"60px 60px"}}/>

      {/* TOP BAR */}
      <div style={{flexShrink:0,padding:"0 16px",height:52,borderBottom:"1px solid #0a1828",display:"flex",alignItems:"center",gap:0,background:"linear-gradient(90deg,#02040a,#030810,#02040a)",zIndex:10,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,#00ff8840,#38bdf840,transparent)"}}/>
        <div style={{flexShrink:0,paddingRight:16,borderRight:"1px solid #0a1828"}}>
          <div style={{fontSize:8,letterSpacing:3,color:"#00ff8860",fontFamily:"'Inter',sans-serif"}}>SYSTEM</div>
          <div style={{fontSize:14,fontWeight:"900",letterSpacing:3,color:"#00ff88",textShadow:"0 0 20px #00ff8840"}}>MISSION<span style={{color:"#38bdf8"}}>·</span>CTRL</div>
        </div>
        <div style={{flexShrink:0,padding:"0 16px",borderRight:"1px solid #0a1828"}}>
          <div style={{fontSize:8,letterSpacing:2,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>OPERATOR</div>
          <div style={{fontSize:11,letterSpacing:2,fontWeight:"bold"}}>
            <span style={{color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{getGreeting()}, </span>
            <span style={{color:"#00ff88",textShadow:"0 0 15px #00ff8860"}}>{NAME}</span>
          </div>
        </div>
        <div style={{flexShrink:0,padding:"0 16px",borderRight:"1px solid #0a1828"}}>
          <div style={{fontSize:8,letterSpacing:2,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>UPTIME</div>
          <div style={{fontSize:11,color:"#00ff8870",letterSpacing:2,fontVariantNumeric:"tabular-nums"}}>{formatUptime(uptime)}</div>
        </div>
        <button onClick={()=>setShowMacros(true)} style={{flexShrink:0,padding:"4px 16px",borderRight:"1px solid #0a1828",cursor:"pointer",background:"none",border:"none",borderRight:"1px solid #0a1828",textAlign:"left"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,marginBottom:4}}>
            <span style={{fontSize:9,letterSpacing:1,color:"#00ff8890",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>⚡ NUTRITION</span>
            <span style={{fontSize:7,color:"#1a2a4a"}}>{kcalPct}% · {protPct}%P</span>
          </div>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            {[{c:"#00ff88",v:macroSnap.kcal,g:MACROS_GOAL.kcal},{c:"#f472b6",v:macroSnap.protein,g:MACROS_GOAL.protein},{c:"#fbbf24",v:macroSnap.carbs,g:MACROS_GOAL.carbs},{c:"#38bdf8",v:macroSnap.fat,g:MACROS_GOAL.fat}].map(({c,v,g},i)=>(
              <div key={i} style={{width:32,height:4,background:"#0a1220",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min((v/g)*100,100)}%`,background:c,borderRadius:2,boxShadow:`0 0 4px ${c}`}}/>
              </div>
            ))}
          </div>
        </button>
        <div style={{display:"flex",gap:0,flex:1,justifyContent:"center"}}>
          {PANELS_CFG.map((p,i)=>(
            <div key={p.id} style={{textAlign:"center",padding:"0 14px",borderRight:i<3?"1px solid #0a1828":"none"}}>
              <div style={{fontSize:7,color:p.color,opacity:0.6,letterSpacing:2,whiteSpace:"nowrap",marginBottom:2}}>{p.icon} {p.label}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <div style={{width:4,height:4,borderRadius:"50%",background:p.color,boxShadow:`0 0 6px ${p.color}`,animation:"blink 2s infinite"}}/>
                <span style={{fontSize:8,color:"#2a4060",letterSpacing:1,fontFamily:"'Inter',sans-serif"}}>ONLINE</span>
              </div>
            </div>
          ))}
        </div>
        {weather&&(
          <div style={{flexShrink:0,padding:"0 16px",borderLeft:"1px solid #0a1828",textAlign:"center"}}>
            <div style={{fontSize:18}}>{weather.icon}</div>
            <div style={{fontSize:9,color:"#38bdf8",letterSpacing:1}}>{weather.temp}°F</div>
          </div>
        )}
        <div style={{flexShrink:0,padding:"0 0 0 16px",borderLeft:"1px solid #0a1828",textAlign:"right"}}>
          <div style={{fontSize:16,fontWeight:"bold",letterSpacing:2,color:"#c8d8e8",fontVariantNumeric:"tabular-nums",textShadow:"0 0 15px #38bdf840"}}>{time.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
          <div style={{fontSize:7,color:"#1a2a4a",letterSpacing:2}}>{time.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}).toUpperCase()}</div>
        </div>
      </div>

      {/* GRID */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:expanded?"1fr":"1fr 1fr",gridTemplateRows:expanded?"1fr":"1fr 1fr",gap:2,padding:2,background:"#010308",minHeight:0,overflow:"hidden",zIndex:1}}>
        {PANELS_CFG.map(cfg=>{
          if(expanded&&expanded!==cfg.id) return null;
          return <Panel key={cfg.id} cfg={cfg} isExpanded={expanded===cfg.id} onExpand={()=>setExpanded(cfg.id)} onCollapse={()=>setExpanded(null)} extraProps={extraProps}/>;
        })}
      </div>

      {/* BOTTOM BAR */}
      <div style={{flexShrink:0,padding:"4px 16px",borderTop:"1px solid #0a1828",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#02040a",zIndex:10}}>
        <div style={{fontSize:9,color:"#2a3a55",letterSpacing:2,fontFamily:"'Inter',sans-serif"}}>{expanded?`◈ FOCUSED MODE: ${expanded.toUpperCase()} · PRESS ✕ TO RETURN TO GRID`:"◈ SELECT PANEL TO FOCUS · ⤢ EXPAND · CLICK TICKER FOR CHART · CLICK NUTRITION TO LOG"}</div>
        <div style={{display:"flex",gap:12}}>
          {[["SYS","#00ff88"],["AI","#c084fc"],["MKT","#38bdf8"],["NEWS","#fb923c"]].map(([label,color])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:3}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:color,boxShadow:`0 0 5px ${color}`,animation:"blink 2s infinite"}}/>
              <span style={{fontSize:7,color:"#0d1a30",letterSpacing:2}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Article Modal */}
      {selectedArticle&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}} onClick={()=>setSelectedArticle(null)}>
          <div style={{background:"linear-gradient(135deg,#06100a,#040c14)",border:"1px solid #fb923c30",borderRadius:4,padding:28,width:440,maxWidth:"90vw",maxHeight:"70vh",overflow:"auto",boxShadow:"0 0 60px #fb923c10",position:"relative"}} onClick={e=>e.stopPropagation()}>
            <HUDBrackets color="#fb923c" size={12}/>
            <div style={{fontSize:7,color:"#fb923c",letterSpacing:4,marginBottom:12,fontFamily:"'Orbitron',monospace"}}>🌐 INTEL REPORT</div>
            <div style={{fontSize:14,color:"#e0d4c4",lineHeight:1.6,marginBottom:12,fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{selectedArticle.title}</div>
            <div style={{fontSize:13,color:"#8a7a6a",lineHeight:1.7,marginBottom:20,fontFamily:"'Inter',sans-serif"}}>{selectedArticle.description}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:7,color:"#2a1a08",letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>{selectedArticle.source?.name?.toUpperCase()}</span>
              <a href={selectedArticle.url} target="_blank" rel="noreferrer" style={{fontSize:9,color:"#fb923c",textDecoration:"none",letterSpacing:2,border:"1px solid #fb923c40",padding:"6px 14px",borderRadius:3,fontFamily:"'Orbitron',monospace",boxShadow:"0 0 15px #fb923c15"}}>FULL REPORT →</a>
            </div>
          </div>
        </div>
      )}

      {/* Stock Chart Modal */}
      {selectedStock&&(
        <StockChartModal stock={selectedStock} stockData={stocks[selectedStock.ticker]} onClose={()=>setSelectedStock(null)}/>
      )}

      {showMacros&&<MacroModal onClose={()=>setShowMacros(false)}/>}

      <style>{`
        @keyframes blink{0%,100%{opacity:0.2}50%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:2px;height:2px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#0d1a30;border-radius:2px;}
        input::placeholder{color:#3a5070;font-family:'Inter',sans-serif;}
        a{color:inherit;}
        button{font-family:'Inter',sans-serif;} .orb{font-family:'Orbitron',monospace;}
      `}</style>
    </div>
  );
}
