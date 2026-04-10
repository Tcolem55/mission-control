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

// ── Smart Split — collapses data feed when chat is active ─────────────────────
function SmartSplit({ top, bottom, color, topLabel }) {
  const [showTop, setShowTop] = useState(true);
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 10px",background:`${color}06`,borderBottom:`1px solid ${color}10`,flexShrink:0}}>
        <span style={{fontSize:8,color:`${color}60`,letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>{topLabel}</span>
        <button onClick={()=>setShowTop(s=>!s)} style={{fontSize:8,color:color,background:`${color}10`,border:`1px solid ${color}25`,borderRadius:2,cursor:"pointer",padding:"2px 10px",letterSpacing:1,fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
          {showTop?"▲ HIDE":"▼ SHOW"}
        </button>
      </div>
      <div style={{flexShrink:0,overflow:"hidden",transition:"max-height 0.35s cubic-bezier(0.16,1,0.3,1)",maxHeight:showTop?"55%":"0px",borderBottom:showTop?`1px solid ${color}10`:"none"}}>
        <div style={{height:"100%",minHeight:180,overflow:"hidden"}}>{top}</div>
      </div>
      <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
        {bottom}
      </div>
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
          <SmartSplit
            top={<StockTicker stocks={extraProps.stocks} loading={extraProps.stockLoading} lastUpdated={extraProps.stockUpdated} onRefresh={extraProps.onRefreshStocks} onSelectStock={extraProps.onSelectStock}/>}
            bottom={<Chat panel={cfg} contextStr={extraProps.stockContext}/>}
            color={c}
            topLabel="WATCHLIST"
          />
        ) : isNews ? (
          <SmartSplit
            top={<NewsFeed articles={extraProps.articles} loading={extraProps.newsLoading} onRefresh={extraProps.onRefreshNews} onArticleClick={extraProps.onArticleClick}/>}
            bottom={<Chat panel={cfg} contextStr={extraProps.newsContext}/>}
            color={c}
            topLabel="NEWS FEED"
          />
        ) : (
          <Chat panel={cfg} contextStr=""/>
        )}
      </div>
    </div>
  );
}

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoon({ tab, color, icon, features }) {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#010308",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,opacity:0.02,backgroundImage:"linear-gradient(#ffffff 1px,transparent 1px),linear-gradient(90deg,#ffffff 1px,transparent 1px)",backgroundSize:"60px 60px"}}/>
      <div style={{textAlign:"center",zIndex:1,animation:"fadeUp 0.5s ease"}}>
        <div style={{fontSize:40,marginBottom:16}}>{icon}</div>
        <div style={{fontSize:20,fontWeight:"900",letterSpacing:4,color,fontFamily:"'Orbitron',monospace",marginBottom:8,textShadow:`0 0 30px ${color}40`}}>{tab} MODULE</div>
        <div style={{fontSize:12,color:"#3a5070",letterSpacing:3,fontFamily:"'Inter',sans-serif",marginBottom:32}}>COMING SOON — UNDER CONSTRUCTION</div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          {features.map(f=>(
            <div key={f} style={{padding:"8px 16px",background:"#0a1220",border:"1px solid #0d2040",borderRadius:3,fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{f}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Finance Tab ───────────────────────────────────────────────────────────────
const loadBills = () => { try { return JSON.parse(localStorage.getItem("bills")||"[]"); } catch { return []; }};
const saveBills = b => { try { localStorage.setItem("bills",JSON.stringify(b)); } catch {} };
const loadSubs  = () => { try { return JSON.parse(localStorage.getItem("subs")||"[]"); } catch { return []; }};
const saveSubs  = s => { try { localStorage.setItem("subs",JSON.stringify(s)); } catch {} };

function FinanceTab() {
  const [bills, setBills]   = useState(loadBills());
  const [subs, setSubs]     = useState(loadSubs());
  const [activeSection, setActiveSection] = useState("OVERVIEW");
  const [showAddBill, setShowAddBill] = useState(false);
  const [showAddSub, setShowAddSub]   = useState(false);
  const [billForm, setBillForm] = useState({ name:"", amount:"", due:"", category:"Housing", autopay:false });
  const [subForm, setSubForm]   = useState({ name:"", amount:"", cycle:"Monthly", category:"Entertainment" });

  const BILL_CATS = ["Housing","Utilities","Insurance","Car","Loans","Other"];
  const SUB_CATS  = ["Entertainment","Music","Software","Gaming","News","Fitness","Other"];
  const C = "#38bdf8";

  const totalBills    = bills.reduce((s,b)=>s+Number(b.amount),0);
  const totalSubs     = subs.reduce((s,b)=>s+Number(b.amount),0);
  const totalMonthly  = totalBills + totalSubs;
  const totalAnnual   = totalMonthly * 12;

  const addBill = () => {
    if(!billForm.name||!billForm.amount) return;
    const updated = [...bills, {...billForm, id:Date.now()}];
    setBills(updated); saveBills(updated);
    setBillForm({name:"",amount:"",due:"",category:"Housing",autopay:false});
    setShowAddBill(false);
  };

  const addSub = () => {
    if(!subForm.name||!subForm.amount) return;
    const updated = [...subs, {...subForm, id:Date.now()}];
    setSubs(updated); saveSubs(updated);
    setSubForm({name:"",amount:"",cycle:"Monthly",category:"Entertainment"});
    setShowAddSub(false);
  };

  const deleteBill = id => { const u=bills.filter(b=>b.id!==id); setBills(u); saveBills(u); };
  const deleteSub  = id => { const u=subs.filter(s=>s.id!==id); setSubs(u); saveSubs(u); };

  const sections = ["OVERVIEW","BILLS","SUBSCRIPTIONS"];

  const inputStyle = { width:"100%", background:"#0a1220", border:"1px solid #1a2a40", borderRadius:3, padding:"8px 12px", color:"#c8d8f0", fontSize:13, fontFamily:"'Inter',sans-serif", outline:"none", boxSizing:"border-box" };
  const labelStyle = { fontSize:10, color:"#3a5070", fontFamily:"'Inter',sans-serif", marginBottom:4, display:"block" };
  const selectStyle = { ...inputStyle, cursor:"pointer" };

  // Group subs by category
  const subsByCat = SUB_CATS.reduce((acc,cat)=>{
    const items = subs.filter(s=>s.category===cat);
    if(items.length) acc[cat]=items;
    return acc;
  },{});

  // Bills due soon (within 7 days)
  const today = new Date();
  const dueSoon = bills.filter(b=>{
    if(!b.due) return false;
    const due = new Date(today.getFullYear(), today.getMonth(), Number(b.due));
    const diff = (due-today)/(1000*60*60*24);
    return diff>=0 && diff<=7;
  });

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:"#010308",overflow:"hidden",animation:"fadeUp 0.4s ease"}}>
      {/* Finance Header */}
      <div style={{flexShrink:0,padding:"14px 20px",borderBottom:"1px solid #0a1828",background:"linear-gradient(90deg,#02040a,#030c18)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:9,letterSpacing:4,color:"#38bdf860",fontFamily:"'Orbitron',monospace",marginBottom:2}}>💳 FINANCE MODULE</div>
          <div style={{fontSize:20,fontWeight:"900",letterSpacing:3,color:"#38bdf8",fontFamily:"'Orbitron',monospace",textShadow:"0 0 20px #38bdf840"}}>FINANCIAL COMMAND</div>
        </div>
        {/* Summary stats */}
        <div style={{display:"flex",gap:20}}>
          {[
            {label:"MONTHLY",val:`$${totalMonthly.toFixed(2)}`,color:"#38bdf8"},
            {label:"ANNUAL",val:`$${totalAnnual.toFixed(0)}`,color:"#fbbf24"},
            {label:"BILLS",val:bills.length,color:"#f472b6"},
            {label:"SUBSCRIPTIONS",val:subs.length,color:"#c084fc"},
          ].map(({label,val,color})=>(
            <div key={label} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#3a5070",letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:2}}>{label}</div>
              <div style={{fontSize:18,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section tabs */}
      <div style={{flexShrink:0,display:"flex",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
        {sections.map(s=>(
          <button key={s} onClick={()=>setActiveSection(s)} style={{flex:1,padding:"10px",fontSize:9,letterSpacing:3,cursor:"pointer",background:activeSection===s?"#38bdf810":"transparent",border:"none",borderBottom:activeSection===s?"2px solid #38bdf8":"2px solid transparent",color:activeSection===s?"#38bdf8":"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
            {s}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:20,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>

        {/* OVERVIEW */}
        {activeSection==="OVERVIEW" && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Alert for bills due soon */}
            {dueSoon.length>0 && (
              <div style={{background:"#fbbf2410",border:"1px solid #fbbf2430",borderRadius:4,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div>
                  <div style={{fontSize:11,color:"#fbbf24",fontFamily:"'Orbitron',monospace",letterSpacing:2,marginBottom:2}}>BILLS DUE SOON</div>
                  <div style={{fontSize:13,color:"#c8a840",fontFamily:"'Inter',sans-serif"}}>{dueSoon.map(b=>b.name).join(", ")} — due within 7 days</div>
                </div>
              </div>
            )}

            {/* Monthly breakdown */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{background:"linear-gradient(135deg,#0a1628,#060c18)",border:"1px solid #38bdf820",borderRadius:4,padding:16,position:"relative",overflow:"hidden"}}>
                <HUDBrackets color="#38bdf8" size={10}/>
                <div style={{fontSize:9,color:"#38bdf860",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:8}}>BILLS</div>
                <div style={{fontSize:28,fontWeight:"900",color:"#38bdf8",fontFamily:"'Orbitron',monospace",marginBottom:4}}>${totalBills.toFixed(2)}</div>
                <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{bills.length} recurring bills/month</div>
              </div>
              <div style={{background:"linear-gradient(135deg,#0a1220,#060c14)",border:"1px solid #c084fc20",borderRadius:4,padding:16,position:"relative",overflow:"hidden"}}>
                <HUDBrackets color="#c084fc" size={10}/>
                <div style={{fontSize:9,color:"#c084fc60",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:8}}>SUBSCRIPTIONS</div>
                <div style={{fontSize:28,fontWeight:"900",color:"#c084fc",fontFamily:"'Orbitron',monospace",marginBottom:4}}>${totalSubs.toFixed(2)}</div>
                <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{subs.length} active subscriptions/month</div>
              </div>
            </div>

            {/* Spending bar */}
            <div style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>Monthly Breakdown</span>
                <span style={{fontSize:13,fontWeight:"bold",color:"#c8d8f0",fontFamily:"'Orbitron',monospace"}}>${totalMonthly.toFixed(2)}/mo</span>
              </div>
              <div style={{height:8,background:"#050d18",borderRadius:4,overflow:"hidden",display:"flex"}}>
                {totalMonthly>0 && <>
                  <div style={{width:`${(totalBills/totalMonthly)*100}%`,background:"#38bdf8",boxShadow:"0 0 8px #38bdf860",transition:"width 0.5s"}}/>
                  <div style={{width:`${(totalSubs/totalMonthly)*100}%`,background:"#c084fc",boxShadow:"0 0 8px #c084fc60",transition:"width 0.5s"}}/>
                </>}
              </div>
              <div style={{display:"flex",gap:16,marginTop:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:"#38bdf8"}}/><span style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>Bills</span></div>
                <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:2,background:"#c084fc"}}/><span style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>Subscriptions</span></div>
              </div>
            </div>

            {/* Recent bills */}
            {bills.length>0 && (
              <div style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:16}}>
                <div style={{fontSize:9,color:"#38bdf860",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:12}}>UPCOMING BILLS</div>
                {bills.slice(0,5).map(b=>(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #0d1a28"}}>
                    <div>
                      <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{b.name}</div>
                      <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{b.category}{b.due?` · Due ${b.due}th`:""}{b.autopay?" · Autopay ✓":""}</div>
                    </div>
                    <div style={{fontSize:15,fontWeight:"bold",color:"#38bdf8",fontFamily:"'Orbitron',monospace"}}>${Number(b.amount).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            {bills.length===0 && subs.length===0 && (
              <div style={{textAlign:"center",padding:40,color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>
                No bills or subscriptions added yet.<br/>
                <span style={{color:"#38bdf860"}}>Go to BILLS or SUBSCRIPTIONS to add them.</span>
              </div>
            )}
          </div>
        )}

        {/* BILLS */}
        {activeSection==="BILLS" && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{bills.length} bills · <span style={{color:"#38bdf8",fontWeight:"600"}}>${totalBills.toFixed(2)}/mo</span></div>
              <button onClick={()=>setShowAddBill(true)} style={{padding:"8px 16px",background:"#38bdf815",border:"1px solid #38bdf840",borderRadius:3,color:"#38bdf8",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>+ ADD BILL</button>
            </div>

            {showAddBill && (
              <div style={{background:"#0a1628",border:"1px solid #38bdf825",borderRadius:4,padding:16,position:"relative"}}>
                <HUDBrackets color="#38bdf8" size={10}/>
                <div style={{fontSize:9,color:"#38bdf8",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:14}}>NEW BILL</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label style={labelStyle}>BILL NAME</label><input value={billForm.name} onChange={e=>setBillForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Rent" style={inputStyle}/></div>
                  <div><label style={labelStyle}>AMOUNT ($)</label><input type="number" value={billForm.amount} onChange={e=>setBillForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={inputStyle}/></div>
                  <div><label style={labelStyle}>DUE DATE (day of month)</label><input type="number" value={billForm.due} onChange={e=>setBillForm(f=>({...f,due:e.target.value}))} placeholder="e.g. 15" style={inputStyle}/></div>
                  <div><label style={labelStyle}>CATEGORY</label><select value={billForm.category} onChange={e=>setBillForm(f=>({...f,category:e.target.value}))} style={selectStyle}>{BILL_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <input type="checkbox" checked={billForm.autopay} onChange={e=>setBillForm(f=>({...f,autopay:e.target.checked}))} style={{cursor:"pointer"}}/>
                  <span style={{fontSize:12,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>Autopay enabled</span>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addBill} style={{flex:1,padding:"10px",background:"#38bdf815",border:"1px solid #38bdf840",borderRadius:3,color:"#38bdf8",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>SAVE BILL</button>
                  <button onClick={()=>setShowAddBill(false)} style={{padding:"10px 16px",background:"#ff444410",border:"1px solid #ff444430",borderRadius:3,color:"#ff4444",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace"}}>CANCEL</button>
                </div>
              </div>
            )}

            {bills.length===0 && !showAddBill && (
              <div style={{textAlign:"center",padding:40,color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No bills added yet. Click + ADD BILL to get started.</div>
            )}

            {bills.map(b=>(
              <div key={b.id} style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#38bdf830"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#0d2040"}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:4,height:36,borderRadius:2,background:"#38bdf8",boxShadow:"0 0 8px #38bdf860",flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:14,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",marginBottom:2}}>{b.name}</div>
                    <div style={{display:"flex",gap:8}}>
                      <span style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{b.category}</span>
                      {b.due&&<span style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>· Due {b.due}th</span>}
                      {b.autopay&&<span style={{fontSize:10,color:"#00ff88",fontFamily:"'Inter',sans-serif"}}>· ✓ Autopay</span>}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{fontSize:18,fontWeight:"bold",color:"#38bdf8",fontFamily:"'Orbitron',monospace"}}>${Number(b.amount).toFixed(2)}</div>
                  <button onClick={()=>deleteBill(b.id)} style={{background:"#ff444410",border:"1px solid #ff444430",borderRadius:2,color:"#ff4444",fontSize:10,cursor:"pointer",padding:"4px 8px",fontFamily:"'Orbitron',monospace"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SUBSCRIPTIONS */}
        {activeSection==="SUBSCRIPTIONS" && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{subs.length} subscriptions · <span style={{color:"#c084fc",fontWeight:"600"}}>${totalSubs.toFixed(2)}/mo</span></div>
              <button onClick={()=>setShowAddSub(true)} style={{padding:"8px 16px",background:"#c084fc15",border:"1px solid #c084fc40",borderRadius:3,color:"#c084fc",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>+ ADD SUB</button>
            </div>

            {showAddSub && (
              <div style={{background:"#0a1220",border:"1px solid #c084fc25",borderRadius:4,padding:16,position:"relative"}}>
                <HUDBrackets color="#c084fc" size={10}/>
                <div style={{fontSize:9,color:"#c084fc",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:14}}>NEW SUBSCRIPTION</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div><label style={labelStyle}>SERVICE NAME</label><input value={subForm.name} onChange={e=>setSubForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Netflix" style={inputStyle}/></div>
                  <div><label style={labelStyle}>AMOUNT ($)</label><input type="number" value={subForm.amount} onChange={e=>setSubForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={inputStyle}/></div>
                  <div><label style={labelStyle}>BILLING CYCLE</label><select value={subForm.cycle} onChange={e=>setSubForm(f=>({...f,cycle:e.target.value}))} style={selectStyle}>{["Monthly","Annual","Weekly"].map(c=><option key={c}>{c}</option>)}</select></div>
                  <div><label style={labelStyle}>CATEGORY</label><select value={subForm.category} onChange={e=>setSubForm(f=>({...f,category:e.target.value}))} style={selectStyle}>{SUB_CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addSub} style={{flex:1,padding:"10px",background:"#c084fc15",border:"1px solid #c084fc40",borderRadius:3,color:"#c084fc",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>SAVE SUB</button>
                  <button onClick={()=>setShowAddSub(false)} style={{padding:"10px 16px",background:"#ff444410",border:"1px solid #ff444430",borderRadius:3,color:"#ff4444",fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace"}}>CANCEL</button>
                </div>
              </div>
            )}

            {subs.length===0 && !showAddSub && (
              <div style={{textAlign:"center",padding:40,color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No subscriptions added yet. Click + ADD SUB to get started.</div>
            )}

            {Object.entries(subsByCat).map(([cat,items])=>(
              <div key={cat}>
                <div style={{fontSize:9,color:"#c084fc60",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:8,marginTop:4}}>{cat.toUpperCase()}</div>
                {items.map(s=>(
                  <div key={s.id} style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,transition:"border-color 0.2s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#c084fc30"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#0d2040"}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:4,height:36,borderRadius:2,background:"#c084fc",boxShadow:"0 0 8px #c084fc60",flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:14,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",marginBottom:2}}>{s.name}</div>
                        <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{s.cycle}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div>
                        <div style={{fontSize:16,fontWeight:"bold",color:"#c084fc",fontFamily:"'Orbitron',monospace",textAlign:"right"}}>${Number(s.amount).toFixed(2)}<span style={{fontSize:9,color:"#3a5070"}}>/mo</span></div>
                        {s.cycle==="Annual"&&<div style={{fontSize:9,color:"#3a5070",fontFamily:"'Inter',sans-serif",textAlign:"right"}}>${(Number(s.amount)*12).toFixed(2)}/yr</div>}
                      </div>
                      <button onClick={()=>deleteSub(s.id)} style={{background:"#ff444410",border:"1px solid #ff444430",borderRadius:2,color:"#ff4444",fontSize:10,cursor:"pointer",padding:"4px 8px",fontFamily:"'Orbitron',monospace"}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Jobs Tab ──────────────────────────────────────────────────────────────────
const RESUME = `Tristen Coleman | Data Analyst I | City of Virginia Beach – Health and Human Services | 2022–Present
- Led business discovery across 50+ legacy Microsoft Access databases
- Designed executive Power BI dashboards for CIP budget tracking
- Performed end-to-end systems analysis for COTS solutioning
- Developed Oracle DA2 reporting solutions
- Built survey analytics for DBHDS Mart Committee and VA Food Pantry
- Administered SharePoint sites across departments
- Participated in Agile Sprint planning and stakeholder sessions
Skills: Power BI (Certified), Tableau (Certified), SQL, Python, JavaScript, MS Office (Certified), SharePoint, Oracle DA2, Business Analytics, Systems Analysis, Data Mapping, COTS Solutioning
Education: M.S. Computer Science (Candidate) – UNC Charlotte | B.S. Computer Information Systems – Livingstone College
Certifications: Power BI, Tableau, Microsoft Office Specialist`;

const JOB_PRESETS = [
  { label:"Data Analyst",    query:"Data Analyst",                          icon:"📊" },
  { label:"Systems Analyst", query:"Systems Analyst",                       icon:"🖥️" },
  { label:"BI Developer",    query:"Business Intelligence Developer Power BI", icon:"📈" },
  { label:"Health IT",       query:"Health IT Data Analyst",                icon:"🏥" },
  { label:"AI/ML Analyst",   query:"AI Data Analyst Machine Learning",      icon:"🤖" },
  { label:"Sr. Analyst",     query:"Senior Data Analyst",                   icon:"⭐" },
];

const loadJobs   = () => { try { return JSON.parse(localStorage.getItem("jobs_applied")||"[]"); } catch { return []; }};
const saveJobs   = j  => { try { localStorage.setItem("jobs_applied",JSON.stringify(j)); } catch {} };
const loadResume = () => { try { return localStorage.getItem("master_resume")||RESUME; } catch { return RESUME; }};
const saveResumeFn = r => { try { localStorage.setItem("master_resume",r); } catch {} };

const STATUS_COLORS_J = { Saved:"#c084fc", Applied:"#38bdf8", Interview:"#fbbf24", Offer:"#00ff88", Rejected:"#ff4444" };
const STATUSES_J = ["Saved","Applied","Interview","Offer","Rejected"];

function JobsTab() {
  const [section, setSection]       = useState("SEARCH");
  const [jobs, setJobs]             = useState(loadJobs());
  const [resume, setResume]         = useState(loadResume());
  const [editingResume, setEditingResume] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("United States");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);

  // AI state
  const [aiResult, setAiResult]   = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode]       = useState("SCORE");

  const C = "#c084fc";
  const inputStyle  = { width:"100%", background:"#0a1220", border:"1px solid #1a2a40", borderRadius:3, padding:"8px 12px", color:"#c8d8f0", fontSize:13, fontFamily:"'Inter',sans-serif", outline:"none", boxSizing:"border-box" };
  const labelStyle  = { fontSize:10, color:"#3a5070", fontFamily:"'Inter',sans-serif", marginBottom:4, display:"block" };

  const searchJobs = async (query) => {
    const q = query || searchQuery;
    if (!q) return;
    setSearchLoading(true); setSearchResults([]); setSelectedJob(null); setAiResult("");
    try {
      const params = new URLSearchParams({ query: q, location: searchLocation });
      const r = await fetch(`/api/jobs?${params}`);
      const d = await r.json();
      setSearchResults(d.data || []);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  };

  const runAI = async (mode, job) => {
    const j = job || selectedJob;
    if (!j) return;
    setAiLoading(true); setAiMode(mode); setAiResult("");
    const desc = j.job_description || j.job_title;
    const prompts = {
      SCORE:  `Analyze how well this resume matches the job. Give a match score out of 100, list the top 5 matching skills, list the top 3 gaps, and give 3 specific recommendations. Be concise.\n\nJOB: ${j.job_title} at ${j.employer_name}\nDESCRIPTION: ${desc?.slice(0,2000)}\n\nRESUME:\n${resume}`,
      RESUME: `Tailor this resume for the job below. Keep real experience but optimize language and keywords for ATS. Output only the tailored resume text.\n\nJOB: ${j.job_title} at ${j.employer_name}\nDESCRIPTION: ${desc?.slice(0,2000)}\n\nMASTER RESUME:\n${resume}`,
      COVER:  `Write a compelling 3-paragraph cover letter for ${NAME} (Tris) applying to this job. Be specific and professional.\n\nJOB: ${j.job_title} at ${j.employer_name}\nDESCRIPTION: ${desc?.slice(0,1500)}\n\nRESUME:\n${resume}`,
    };
    try {
      const res = await fetch('/api/claude', {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1200, system:"You are an expert career coach and resume writer.", messages:[{role:"user",content:prompts[mode]}] }),
      });
      const data = await res.json();
      setAiResult(data.content?.map(b=>b.text||"").join("")||"No response.");
    } catch { setAiResult("Connection error. Try again."); }
    setAiLoading(false);
  };

  const saveToTracker = (job) => {
    const updated = [...jobs, { id:Date.now(), title:job.job_title, company:job.employer_name, status:"Saved", url:job.job_apply_link||"", date:new Date().toLocaleDateString(), notes:"" }];
    setJobs(updated); saveJobs(updated);
  };

  const updateStatus = (id, status) => { const u=jobs.map(j=>j.id===id?{...j,status}:j); setJobs(u); saveJobs(u); };
  const deleteJob    = (id)         => { const u=jobs.filter(j=>j.id!==id); setJobs(u); saveJobs(u); };
  const counts = STATUSES_J.reduce((acc,s)=>({...acc,[s]:jobs.filter(j=>j.status===s).length}),{});

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:"#010308",overflow:"hidden",animation:"fadeUp 0.4s ease"}}>

      {/* Header */}
      <div style={{flexShrink:0,padding:"14px 20px",borderBottom:"1px solid #0a1828",background:"linear-gradient(90deg,#02040a,#0c0818)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:9,letterSpacing:4,color:"#c084fc60",fontFamily:"'Orbitron',monospace",marginBottom:2}}>💼 JOBS MODULE</div>
          <div style={{fontSize:20,fontWeight:"900",letterSpacing:3,color:"#c084fc",fontFamily:"'Orbitron',monospace",textShadow:"0 0 20px #c084fc40"}}>CAREER COMMAND</div>
        </div>
        <div style={{display:"flex",gap:20}}>
          {[{label:"TRACKED",val:jobs.length},{label:"APPLIED",val:counts.Applied||0},{label:"INTERVIEWS",val:counts.Interview||0},{label:"OFFERS",val:counts.Offer||0}].map(({label,val})=>(
            <div key={label} style={{textAlign:"center"}}>
              <div style={{fontSize:8,color:"#3a5070",letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:2}}>{label}</div>
              <div style={{fontSize:18,fontWeight:"bold",color:C,fontFamily:"'Orbitron',monospace"}}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section tabs */}
      <div style={{flexShrink:0,display:"flex",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
        {["SEARCH","TRACKER","RESUME"].map(s=>(
          <button key={s} onClick={()=>setSection(s)} style={{flex:1,padding:"10px",fontSize:9,letterSpacing:3,cursor:"pointer",background:section===s?"#c084fc10":"transparent",border:"none",borderBottom:section===s?"2px solid #c084fc":"2px solid transparent",color:section===s?C:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
            {s}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

        {/* ── SEARCH ── */}
        {section==="SEARCH" && (
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

            {/* Left: search + results */}
            <div style={{width:"45%",display:"flex",flexDirection:"column",borderRight:"1px solid #0a1828",overflow:"hidden"}}>
              {/* Search bar */}
              <div style={{flexShrink:0,padding:14,borderBottom:"1px solid #0a1828",background:"#02040a"}}>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchJobs()} placeholder="Job title, keywords..." style={{...inputStyle,flex:1}}/>
                  <input value={searchLocation} onChange={e=>setSearchLocation(e.target.value)} placeholder="Location" style={{...inputStyle,width:130}}/>
                  <button onClick={()=>searchJobs()} disabled={searchLoading||!searchQuery} style={{padding:"8px 14px",background:searchLoading||!searchQuery?"#0a1220":"#c084fc15",border:`1px solid ${searchLoading||!searchQuery?"#1a2a40":"#c084fc40"}`,borderRadius:3,color:searchLoading||!searchQuery?"#2a3a5a":C,cursor:searchLoading||!searchQuery?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",fontSize:11,whiteSpace:"nowrap",transition:"all 0.2s"}}>
                    {searchLoading?"···":"🔍 SEARCH"}
                  </button>
                </div>
                {/* Quick presets */}
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {JOB_PRESETS.map(p=>(
                    <button key={p.label} onClick={()=>{setSearchQuery(p.query);searchJobs(p.query);}} style={{padding:"4px 10px",background:"#0a1220",border:"1px solid #1a2a40",borderRadius:20,color:"#4a6080",fontSize:10,cursor:"pointer",fontFamily:"'Inter',sans-serif",transition:"all 0.2s",display:"flex",alignItems:"center",gap:4}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#c084fc40";e.currentTarget.style.color=C;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#1a2a40";e.currentTarget.style.color="#4a6080";}}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              <div style={{flex:1,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
                {searchLoading && <div style={{padding:30,textAlign:"center",color:C,letterSpacing:4,fontSize:13,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>SEARCHING...</div>}
                {!searchLoading && searchResults.length===0 && (
                  <div style={{padding:30,textAlign:"center",color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>
                    {searchQuery?"No results found. Try different keywords.":"Choose a preset or search for a role above."}
                  </div>
                )}
                {searchResults.map((job,i)=>{
                  const isSelected = selectedJob?.job_id===job.job_id;
                  return (
                    <div key={job.job_id||i} onClick={()=>{setSelectedJob(job);setAiResult("");}}
                      style={{padding:"12px 14px",borderBottom:"1px solid #0a1828",cursor:"pointer",transition:"all 0.15s",background:isSelected?"#c084fc0a":"transparent",borderLeft:`3px solid ${isSelected?C:"transparent"}`}}
                      onMouseEnter={e=>{if(!isSelected){e.currentTarget.style.background="#0a1220";}}}
                      onMouseLeave={e=>{if(!isSelected){e.currentTarget.style.background="transparent";}}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:4}}>
                        <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",lineHeight:1.3}}>{job.job_title}</div>
                        {job.job_is_remote&&<span style={{fontSize:8,color:"#00ff88",background:"#00ff8810",border:"1px solid #00ff8825",padding:"2px 6px",borderRadius:10,whiteSpace:"nowrap",fontFamily:"'Orbitron',monospace",flexShrink:0}}>REMOTE</span>}
                      </div>
                      <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif",marginBottom:4}}>{job.employer_name}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {job.job_city&&<span style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{job.job_city}{job.job_state?`, ${job.job_state}`:""}</span>}
                        {job.job_employment_type&&<span style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>· {job.job_employment_type}</span>}
                        {job.job_min_salary&&<span style={{fontSize:10,color:"#fbbf24",fontFamily:"'Orbitron',monospace"}}>· ${(job.job_min_salary/1000).toFixed(0)}K{job.job_max_salary?`-$${(job.job_max_salary/1000).toFixed(0)}K`:""}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: job detail + AI */}
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {!selectedJob ? (
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#1a2a4a",fontFamily:"'Inter',sans-serif",fontSize:13,textAlign:"center",padding:20}}>
                  <div>
                    <div style={{fontSize:32,marginBottom:12}}>💼</div>
                    <div style={{color:"#2a3a55"}}>Select a job from the list to see details<br/>and generate your tailored application</div>
                  </div>
                </div>
              ) : (
                <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  {/* Job detail header */}
                  <div style={{flexShrink:0,padding:"14px 16px",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontSize:15,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600",marginBottom:3}}>{selectedJob.job_title}</div>
                        <div style={{fontSize:12,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{selectedJob.employer_name}{selectedJob.job_city?` · ${selectedJob.job_city}`:""}</div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button onClick={()=>saveToTracker(selectedJob)} style={{padding:"6px 12px",background:"#c084fc15",border:"1px solid #c084fc40",borderRadius:3,color:C,fontSize:9,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>+ TRACK</button>
                        {selectedJob.job_apply_link&&<a href={selectedJob.job_apply_link} target="_blank" rel="noreferrer" style={{padding:"6px 12px",background:"#00ff8815",border:"1px solid #00ff8840",borderRadius:3,color:"#00ff88",fontSize:9,textDecoration:"none",fontFamily:"'Orbitron',monospace",letterSpacing:1,display:"flex",alignItems:"center"}}>APPLY →</a>}
                      </div>
                    </div>
                    {/* AI action buttons */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      {[
                        {mode:"SCORE",  label:"📊 SCORE MY FIT",    color:"#38bdf8"},
                        {mode:"RESUME", label:"📄 TAILOR RESUME",   color:C},
                        {mode:"COVER",  label:"✉️ COVER LETTER",    color:"#00ff88"},
                      ].map(({mode,label,color})=>(
                        <button key={mode} onClick={()=>runAI(mode)} disabled={aiLoading} style={{padding:"8px",background:aiLoading?"#0a1220":`${color}12`,border:`1px solid ${aiLoading?"#1a2a40":color+"35"}`,borderRadius:3,color:aiLoading?"#2a3a5a":color,fontSize:10,cursor:aiLoading?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:1,transition:"all 0.2s"}}>
                          {aiLoading&&aiMode===mode?"···":label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI result or job description */}
                  <div style={{flex:1,overflowY:"auto",padding:14,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
                    {aiLoading ? (
                      <div style={{textAlign:"center",padding:30,color:C,letterSpacing:4,fontSize:14,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>···</div>
                    ) : aiResult ? (
                      <div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div style={{fontSize:9,color:aiMode==="SCORE"?"#38bdf8":aiMode==="RESUME"?C:"#00ff88",letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>
                            {aiMode==="SCORE"?"📊 FIT SCORE":aiMode==="RESUME"?"📄 TAILORED RESUME":"✉️ COVER LETTER"}
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>navigator.clipboard?.writeText(aiResult)} style={{fontSize:9,color:"#3a5070",background:"#0d1828",border:"1px solid #1a2a40",borderRadius:2,cursor:"pointer",padding:"3px 10px",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>COPY</button>
                            <button onClick={()=>setAiResult("")} style={{fontSize:9,color:"#3a5070",background:"#0d1828",border:"1px solid #1a2a40",borderRadius:2,cursor:"pointer",padding:"3px 10px",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>CLEAR</button>
                          </div>
                        </div>
                        <div style={{fontSize:13,color:"#b0c4d8",lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"'Inter',sans-serif"}}>{aiResult}</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{fontSize:9,color:"#2a3a55",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:10}}>JOB DESCRIPTION</div>
                        <div style={{fontSize:12,color:"#7a8a9a",lineHeight:1.8,fontFamily:"'Inter',sans-serif",whiteSpace:"pre-wrap"}}>
                          {selectedJob.job_description?.slice(0,2000)||"No description available."}
                          {selectedJob.job_description?.length>2000&&"..."}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRACKER ── */}
        {section==="TRACKER" && (
          <div style={{flex:1,overflowY:"auto",padding:20,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
              {STATUSES_J.map(s=>(
                <div key={s} style={{background:"#0a1220",border:`1px solid ${STATUS_COLORS_J[s]}25`,borderRadius:3,padding:"10px 8px",textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:"bold",color:STATUS_COLORS_J[s],fontFamily:"'Orbitron',monospace"}}>{counts[s]||0}</div>
                  <div style={{fontSize:9,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginTop:2}}>{s}</div>
                </div>
              ))}
            </div>
            {jobs.length===0 && <div style={{textAlign:"center",padding:40,color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No jobs tracked yet. Search and click + TRACK on jobs you're interested in.</div>}
            {jobs.map(j=>(
              <div key={j.id} style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:8,transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#c084fc25"}
                onMouseLeave={e=>e.currentTarget.style.borderColor="#0d2040"}>
                <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0}}>
                  <div style={{width:4,height:40,borderRadius:2,background:STATUS_COLORS_J[j.status]||"#555",boxShadow:`0 0 8px ${STATUS_COLORS_J[j.status]||"#555"}60`,flexShrink:0}}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:14,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",marginBottom:2}}>{j.title}</div>
                    <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{j.company}{j.date?` · ${j.date}`:""}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  {j.url&&<a href={j.url} target="_blank" rel="noreferrer" style={{fontSize:9,color:C,textDecoration:"none",border:"1px solid #c084fc30",padding:"3px 8px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>APPLY</a>}
                  <select value={j.status} onChange={e=>updateStatus(j.id,e.target.value)} style={{background:"#050d18",border:`1px solid ${STATUS_COLORS_J[j.status]||"#333"}40`,borderRadius:2,color:STATUS_COLORS_J[j.status]||"#aaa",fontSize:10,cursor:"pointer",padding:"4px 6px",fontFamily:"'Orbitron',monospace",outline:"none"}}>
                    {STATUSES_J.map(s=><option key={s} style={{background:"#050d18"}}>{s}</option>)}
                  </select>
                  <button onClick={()=>deleteJob(j.id)} style={{background:"#ff444410",border:"1px solid #ff444430",borderRadius:2,color:"#ff4444",fontSize:10,cursor:"pointer",padding:"4px 8px",fontFamily:"'Orbitron',monospace"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── RESUME ── */}
        {section==="RESUME" && (
          <div style={{flex:1,overflowY:"auto",padding:20,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:9,color:"#c084fc60",letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:2}}>MASTER RESUME</div>
                <div style={{fontSize:13,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>AI uses this to tailor every resume and cover letter automatically.</div>
              </div>
              <button onClick={()=>setEditingResume(e=>!e)} style={{padding:"8px 16px",background:"#c084fc15",border:"1px solid #c084fc40",borderRadius:3,color:C,fontSize:11,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>
                {editingResume?"✓ DONE":"✏️ EDIT"}
              </button>
            </div>
            {editingResume ? (
              <textarea value={resume} onChange={e=>{setResume(e.target.value);saveResumeFn(e.target.value);}} rows={24}
                style={{...inputStyle,resize:"vertical",lineHeight:1.7,fontSize:12}}/>
            ) : (
              <div style={{background:"#0a1220",border:"1px solid #0d2040",borderRadius:4,padding:16,fontSize:12,color:"#8a9ab0",lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"'Inter',sans-serif"}}>
                {resume}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}






// ── Cache helpers — reads from cron job endpoints ────────────────────────────
async function fetchCachedInjuries() {
  try {
    const r = await fetch('/api/injury-monitor');
    const d = await r.json();
    return d.data || null;
  } catch { return null; }
}

async function fetchCachedRosters() {
  try {
    const r = await fetch('/api/roster-sync');
    const d = await r.json();
    return d.data || null;
  } catch { return null; }
}

async function fetchCachedStats() {
  try {
    const r = await fetch('/api/stats-cache');
    const d = await r.json();
    return d.data || null;
  } catch { return null; }
}

async function fetchCachedLineups() {
  try {
    const r = await fetch('/api/lineup-tracker');
    const d = await r.json();
    return d.data || null;
  } catch { return null; }
}

// ── NBA Picks — Active Roster + Real Stats + Team Parlay ─────────────────────
function NBAPicksSection({ games, gamesLoading, C }) {
  const [picks, setPicks]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [generated, setGenerated] = useState(false);
  const [status, setStatus]       = useState("");
  const [dataLog, setDataLog]     = useState([]);
  const [activeView, setActiveView] = useState("PICKS"); // PICKS | PARLAY
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [parlay, setParlay]       = useState(null);
  const [parlayLoading, setParlayLoading] = useState(false);

  const log = (msg) => { setStatus(msg); setDataLog(prev=>[...prev, msg]); };

  // Build team list from today's games
  const teamOptions = games.flatMap(g => {
    const comp = g.competitions?.[0];
    const away = comp?.competitors?.find(c=>c.homeAway==="away");
    const home = comp?.competitors?.find(c=>c.homeAway==="home");
    return [
      away ? { id: away.team?.id, name: away.team?.displayName, logo: away.team?.logo, opponent: home?.team?.displayName, gameId: g.id } : null,
      home ? { id: home.team?.id, name: home.team?.displayName, logo: home.team?.logo, opponent: away?.team?.displayName, gameId: g.id } : null,
    ].filter(Boolean);
  });

  // ── Generate full picks (all games) ────────────────────────────────────────
  const generatePicks = async () => {
    if (!games.length) return;
    setLoading(true); setPicks(null); setDataLog([]);
    try {
      const gameContexts = [];

      // Try cache first
      log("Checking cached data from cron jobs...");
      const [cachedInjuries, cachedRosters, cachedStats, b2bData] = await Promise.all([
        fetchCachedInjuries(), fetchCachedRosters(), fetchCachedStats(),
        fetch('/api/statcast?type=b2b').then(r=>r.json()).catch(()=>({b2bTeams:{}})),
      ]);
      const usingCache = !!(cachedStats?.nba && Object.keys(cachedStats.nba.players||{}).length > 0);
      const b2bTeams = b2bData?.b2bTeams || {};
      log(usingCache ? "✅ Cache loaded — fast mode!" : "⚡ No cache — fetching live...");
      if (Object.keys(b2bTeams).length > 0) {
        log(`⚠️ B2B teams today: ${Object.keys(b2bTeams).join(", ")}`);
      }

      for (const game of games.slice(0,6)) {
        const comp    = game.competitions?.[0];
        const away    = comp?.competitors?.find(c=>c.homeAway==="away");
        const home    = comp?.competitors?.find(c=>c.homeAway==="home");
        const awayName = away?.team?.displayName || "Away";
        const homeName = home?.team?.displayName || "Home";
        const awayId   = away?.team?.id;
        const homeId   = home?.team?.id;
        const awayAbbr = away?.team?.abbreviation;
        const homeAbbr = home?.team?.abbreviation;
        const awayRec  = away?.records?.[0]?.summary || "";
        const homeRec  = home?.records?.[0]?.summary || "";
        const tipTime  = comp?.date ? new Date(comp.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";

        log(`Loading ${awayName} @ ${homeName}...`);
        const awayIsB2B = !!(b2bTeams[awayAbbr]);
        const homeIsB2B = !!(b2bTeams[homeAbbr]);
        let gameCtx = `\n🏀 ${awayName} (${awayRec}) @ ${homeName} (${homeRec}) — ${tipTime}`;
        if (awayIsB2B) gameCtx += `\n  ⚠️ ${awayName} ON BACK-TO-BACK — players likely fatigued, expect lower output`;
        if (homeIsB2B) gameCtx += `\n  ⚠️ ${homeName} ON BACK-TO-BACK — players likely fatigued, expect lower output`;

        let awayRoster=[], homeRoster=[], awayInjuries=[], homeInjuries=[];
        try {
          // Use cached rosters if available
          if (cachedRosters?.nba?.[awayAbbr]?.roster) {
            awayRoster = cachedRosters.nba[awayAbbr].roster.filter(p=>!p.injuryStatus||!["Out","Doubtful","Injured Reserve","IR","Suspension"].includes(p.injuryStatus));
          }
          if (cachedRosters?.nba?.[homeAbbr]?.roster) {
            homeRoster = cachedRosters.nba[homeAbbr].roster.filter(p=>!p.injuryStatus||!["Out","Doubtful","Injured Reserve","IR","Suspension"].includes(p.injuryStatus));
          }
          // Use cached injuries
          if (cachedInjuries?.nba?.length > 0) {
            awayInjuries = cachedInjuries.nba.filter(i=>i.teamAbbr===awayAbbr);
            homeInjuries = cachedInjuries.nba.filter(i=>i.teamAbbr===homeAbbr);
          }
          // Fall back to live if no cache
          if (!awayRoster.length || !homeRoster.length) {
            const [aRR,hRR,aIR,hIR] = await Promise.all([
              fetch(`/api/nba?type=roster&teamId=${awayId}`),
              fetch(`/api/nba?type=roster&teamId=${homeId}`),
              fetch(`/api/nba?type=injuries&teamId=${awayId}`),
              fetch(`/api/nba?type=injuries&teamId=${homeId}`),
            ]);
            const [aRD,hRD,aID,hID] = await Promise.all([aRR.json(),hRR.json(),aIR.json(),hIR.json()]);
            const EXCL = ["Out","Doubtful","Injured Reserve","IR","Suspension"];
            if (!awayRoster.length) awayRoster = (aRD.roster||[]).filter(p=>!p.injuryStatus||!EXCL.includes(p.injuryStatus));
            if (!homeRoster.length) homeRoster  = (hRD.roster||[]).filter(p=>!p.injuryStatus||!EXCL.includes(p.injuryStatus));
            if (!awayInjuries.length) awayInjuries = (aID.injuries||[]);
            if (!homeInjuries.length) homeInjuries = (hID.injuries||[]);
          }
        } catch {}

        if (awayRoster.length) gameCtx += `\n  ${awayName} active: ${awayRoster.map(p=>`${p.name}(${p.position||"?"})`).join(", ")}`;
        if (homeRoster.length) gameCtx += `\n  ${homeName} active: ${homeRoster.map(p=>`${p.name}(${p.position||"?"})`).join(", ")}`;
        // Remove injured players from rosters
        const OUT_STATUSES = ["Out","Doubtful","Injured Reserve"];
        const awayOutNames = awayInjuries.filter(i=>OUT_STATUSES.includes(i.status)).map(i=>i.player?.toLowerCase());
        const homeOutNames = homeInjuries.filter(i=>OUT_STATUSES.includes(i.status)).map(i=>i.player?.toLowerCase());
        awayRoster = awayRoster.filter(p=>!awayOutNames.some(n=>p.name?.toLowerCase().includes(n?.split(" ")[1]||"")));
        homeRoster = homeRoster.filter(p=>!homeOutNames.some(n=>p.name?.toLowerCase().includes(n?.split(" ")[1]||"")));

        const criticalInj = [...awayInjuries, ...homeInjuries].filter(i=>OUT_STATUSES.includes(i.status));
        const qInj = [...awayInjuries, ...homeInjuries].filter(i=>i.status==="Questionable");
        if (criticalInj.length) gameCtx += `\n  ❌ OUT/DOUBTFUL: ${criticalInj.map(i=>`${i.player}(${i.status})`).join(", ")}`;
        if (qInj.length) gameCtx += `\n  ⚠️ QUESTIONABLE: ${qInj.map(i=>`${i.player}`).join(", ")}`;

        const topPlayers = [...awayRoster.slice(0,5), ...homeRoster.slice(0,5)];
        const playerNames = topPlayers.map(p=>p.name).filter(Boolean);

        if (playerNames.length) {
          log(`Fetching real stats for ${awayName} & ${homeName} via BallDontLie...`);
          try {
            const cachedPlayers = cachedStats?.nba?.players || {};
            const hasCached = topPlayers.some(p => cachedPlayers[p.id]);
            let statsContext = "";

            if (hasCached) {
              log(`✅ Using cached NBA stats`);
              for (const p of topPlayers) {
                const st = cachedPlayers[p.id];
                const team = awayRoster.find(r=>r.id===p.id) ? awayName : homeName;
                if (st?.gamesPlayed>0) statsContext += `\n    ${p.name}(${team}): ${st.avgPTS}PTS ${st.avgREB}REB ${st.avgAST}AST ${st.avg3PM}3PM in ${st.avgMIN}MIN over last ${st.gamesPlayed}G`;
              }
            } else {
              // Use BallDontLie for accurate stats
              const bRes = await fetch(`/api/nba?type=playerrecentstats&playerName=${encodeURIComponent(playerNames.join("|"))}`);
              const bData = await bRes.json();
              for (const p of topPlayers) {
                const st = bData[p.name];
                const team = awayRoster.find(r=>r.id===p.id) ? awayName : homeName;
                if (st?.gamesPlayed>0) {
                  statsContext += `\n    ${st.fullName}(${team}, ${st.position}): ${st.avgPTS}PTS ${st.avgREB}REB ${st.avgAST}AST ${st.avg3PM}3PM ${st.avgSTL}STL in ${st.avgMIN}MIN over last ${st.gamesPlayed}G`;
                  if (st.last5?.length) {
                    statsContext += ` | Last 5: ${st.last5.map(g=>`${g.pts}/${g.reb}/${g.ast}`).join(", ")}`;
                  }
                }
              }
            }

            if (statsContext) gameCtx += `\n  Last 10 game averages (BallDontLie):${statsContext}`;
          } catch(e) { console.error('NBA stats error:', e); }
        }
        gameContexts.push(gameCtx);
      }

      log("Generating picks from real data...");
      const prompt = `You are an elite NBA prop analyst.

ABSOLUTE RULES — VIOLATION IS NOT ACCEPTABLE:
1. ONLY recommend players whose names appear in the active roster sections below
2. Players marked ❌ OUT/DOUBTFUL — NEVER recommend them, no exceptions
3. Players marked ⚠️ QUESTIONABLE — avoid or assign LOW confidence only  
4. Do NOT use training data to recall rosters — only use what is listed below
5. If a team has ⚠️ BACK-TO-BACK flag, lean toward UNDER props for their players
6. Reference actual stats in your reasoning

TODAY'S REAL DATA:
${gameContexts.join("\n")}

Respond ONLY with valid JSON:
{"points":[{"rank":1,"player":"Name","team":"Team","line":"28.5","pick":"OVER","odds":"-115","reason":"Averaging X.X PTS last 10G","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","line":"24.5","pick":"OVER","odds":"-110","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","line":"22.5","pick":"OVER","odds":"-120","reason":"reason","confidence":"MED"},{"rank":4,"player":"Name","team":"Team","line":"18.5","pick":"OVER","odds":"-115","reason":"reason","confidence":"MED"},{"rank":5,"player":"Name","team":"Team","line":"20.5","pick":"UNDER","odds":"-110","reason":"reason","confidence":"MED"}],"rebounds":[{"rank":1,"player":"Name","team":"Team","line":"9.5","pick":"OVER","odds":"-120","reason":"Averaging X.X REB","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","line":"7.5","pick":"OVER","odds":"-115","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","line":"11.5","pick":"OVER","odds":"+105","reason":"reason","confidence":"MED"},{"rank":4,"player":"Name","team":"Team","line":"6.5","pick":"OVER","odds":"-125","reason":"reason","confidence":"MED"},{"rank":5,"player":"Name","team":"Team","line":"8.5","pick":"OVER","odds":"-110","reason":"reason","confidence":"MED"}],"assists":[{"rank":1,"player":"Name","team":"Team","line":"7.5","pick":"OVER","odds":"-115","reason":"Averaging X.X AST","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","line":"6.5","pick":"OVER","odds":"-120","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","line":"5.5","pick":"OVER","odds":"-110","reason":"reason","confidence":"MED"},{"rank":4,"player":"Name","team":"Team","line":"4.5","pick":"OVER","odds":"-130","reason":"reason","confidence":"MED"},{"rank":5,"player":"Name","team":"Team","line":"8.5","pick":"OVER","odds":"+110","reason":"reason","confidence":"MED"}],"threes":[{"rank":1,"player":"Name","team":"Team","line":"2.5","pick":"OVER","odds":"-110","reason":"Averaging X.X 3PM","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","line":"1.5","pick":"OVER","odds":"-150","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","line":"2.5","pick":"OVER","odds":"-115","reason":"reason","confidence":"MED"},{"rank":4,"player":"Name","team":"Team","line":"3.5","pick":"OVER","odds":"+120","reason":"reason","confidence":"MED"},{"rank":5,"player":"Name","team":"Team","line":"1.5","pick":"OVER","odds":"-140","reason":"reason","confidence":"MED"}],"pra":[{"rank":1,"player":"Name","team":"Team","line":"38.5","pick":"OVER","odds":"-115","reason":"PTS+REB+AST avg = X","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","line":"32.5","pick":"OVER","odds":"-110","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","line":"28.5","pick":"OVER","odds":"-120","reason":"reason","confidence":"MED"},{"rank":4,"player":"Name","team":"Team","line":"42.5","pick":"OVER","odds":"+105","reason":"reason","confidence":"MED"},{"rank":5,"player":"Name","team":"Team","line":"25.5","pick":"OVER","odds":"-115","reason":"reason","confidence":"MED"}],"doubleDouble":[{"rank":1,"player":"Name","team":"Team","matchup":"vs Team","odds":"-140","reason":"X.X PTS X.X REB avg","confidence":"HIGH"},{"rank":2,"player":"Name","team":"Team","matchup":"vs Team","odds":"-130","reason":"reason","confidence":"HIGH"},{"rank":3,"player":"Name","team":"Team","matchup":"vs Team","odds":"-115","reason":"reason","confidence":"MED"}]}`;

      const res = await fetch('/api/claude', {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000, system:"Expert NBA prop betting analyst. CRITICAL RULES: (1) ONLY recommend players in the active roster data provided — never use training memory. (2) NEVER recommend players marked as OUT or DOUBTFUL. (3) Teams on back-to-back = lean to unders. (4) Only use players explicitly listed. Valid JSON only, no markdown.", messages:[{role:"user",content:prompt}] }),
      });
      const data = await res.json();
      const text = data.content?.map(b=>b.text||"").join("")||"{}";
      setPicks(JSON.parse(text.replace(/```json|```/g,"").trim()));
      setGenerated(true);
    } catch(e) { console.error(e); setPicks(null); }
    setStatus(""); setLoading(false);
  };

  // ── Generate same-game parlay for selected team ─────────────────────────────
  const generateParlay = async (team) => {
    setSelectedTeam(team);
    setParlayLoading(true); setParlay(null);
    log(`Loading ${team.name} roster and stats...`);

    try {
      // Get roster, injuries, and opponent info
      let roster=[], injuries=[], opponentRoster=[], opponentInjuries=[];
      const game = games.find(g => {
        const comp = g.competitions?.[0];
        return comp?.competitors?.some(c=>c.team?.id===team.id);
      });
      const comp = game?.competitions?.[0];
      const opponent = comp?.competitors?.find(c=>c.team?.id!==team.id);
      const opponentId = opponent?.team?.id;
      const opponentName = opponent?.team?.displayName || "Opponent";
      const isHome = comp?.competitors?.find(c=>c.team?.id===team.id)?.homeAway === "home";
      const tipTime = comp?.date ? new Date(comp.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";

      try {
        const [rRes,iRes,orRes,oiRes] = await Promise.all([
          fetch(`/api/nba?type=roster&teamId=${team.id}`),
          fetch(`/api/nba?type=injuries&teamId=${team.id}`),
          fetch(`/api/nba?type=roster&teamId=${opponentId}`),
          fetch(`/api/nba?type=injuries&teamId=${opponentId}`),
        ]);
        const [rD,iD,orD,oiD] = await Promise.all([rRes.json(),iRes.json(),orRes.json(),oiRes.json()]);
        roster          = (rD.roster||[]).filter(p=>!p.injuryStatus||!["Out","Doubtful","Injured Reserve","IR","Suspension"].includes(p.injuryStatus));
        injuries        = (iD.injuries||[]);
        opponentRoster  = (orD.roster||[]).filter(p=>!p.injuryStatus||!["Out","Doubtful","Injured Reserve","IR","Suspension"].includes(p.injuryStatus));
        opponentInjuries= (oiD.injuries||[]);
      } catch {}

      // Get last 10 game stats for team players
      const playerIds = roster.slice(0,10).map(p=>p.id).filter(Boolean);
      let statsData = {};
      if (playerIds.length) {
        log(`Fetching last 10 game stats for ${team.name}...`);
        try {
          const bRes = await fetch(`/api/nba?type=batchlogs&athleteId=${playerIds.join(",")}`);
          statsData = await bRes.json();
        } catch {}
      }

      // Build context string
      const teamContext = `
TEAM: ${team.name} (${isHome?"HOME":"AWAY"}) vs ${opponentName} — Tip ${tipTime}

${team.name} ACTIVE ROSTER WITH LAST 10 GAME AVERAGES:
${roster.slice(0,10).map(p => {
  const st = statsData[p.id];
  if (st?.gamesPlayed>0) return `  ${p.name} (${p.position}): ${st.avgPTS}PTS ${st.avgREB}REB ${st.avgAST}AST ${st.avg3PM}3PM ${st.avgSTL}STL in ${st.avgMIN}MIN`;
  return `  ${p.name} (${p.position}): Stats loading`;
}).join("\n")}

${team.name} INJURY REPORT:
${injuries.length ? injuries.map(i=>`  ${i.player}: ${i.status} — ${i.detail}`).join("\n") : "  No injuries reported"}

OPPONENT (${opponentName}) ACTIVE ROSTER:
${opponentRoster.slice(0,8).map(p=>`  ${p.name}(${p.position||"?"})`).join(", ")}

OPPONENT INJURY REPORT:
${opponentInjuries.length ? opponentInjuries.map(i=>`  ${i.player}: ${i.status}`).join("\n") : "  No injuries reported"}`;

      log("Building parlay from real data...");
      const parlayPrompt = `You are an elite NBA same-game parlay builder. Build a 3-leg, 4-leg, AND 5-leg same-game parlay for ${team.name} vs ${opponentName} using ONLY players listed in the real data below.

REAL DATA:
${teamContext}

Rules:
- Use ONLY players listed above — no guessing from memory
- Reference actual stats from the data in reasoning
- Mix prop types (points, rebounds, assists, 3PM, PRA) for value
- Estimated combined odds should be realistic (+300 to +900 range for parlays)
- Prioritize HIGH confidence legs

Respond ONLY with valid JSON, no markdown:
{
  "game": "${team.name} vs ${opponentName}",
  "tipTime": "${tipTime}",
  "parlays": [
    {
      "legs": 3,
      "estimatedOdds": "+320",
      "confidence": "HIGH",
      "legs_detail": [
        {"player":"Exact Name","prop":"Points OVER 26.5","odds":"-115","reason":"Averaging 28.4 PTS last 10G","confidence":"HIGH"},
        {"player":"Exact Name","prop":"Rebounds OVER 8.5","odds":"-110","reason":"Averaging 9.2 REB last 10G","confidence":"HIGH"},
        {"player":"Exact Name","prop":"3-Pointers OVER 2.5","odds":"-115","reason":"Averaging 3.1 3PM last 10G","confidence":"HIGH"}
      ]
    },
    {
      "legs": 4,
      "estimatedOdds": "+580",
      "confidence": "MED",
      "legs_detail": [
        {"player":"Exact Name","prop":"Points OVER 26.5","odds":"-115","reason":"stat-based reason","confidence":"HIGH"},
        {"player":"Exact Name","prop":"Rebounds OVER 8.5","odds":"-110","reason":"stat-based reason","confidence":"HIGH"},
        {"player":"Exact Name","prop":"Assists OVER 6.5","odds":"-120","reason":"stat-based reason","confidence":"MED"},
        {"player":"Exact Name","prop":"3-Pointers OVER 1.5","odds":"-150","reason":"stat-based reason","confidence":"HIGH"}
      ]
    },
    {
      "legs": 5,
      "estimatedOdds": "+950",
      "confidence": "MED",
      "legs_detail": [
        {"player":"Exact Name","prop":"Points OVER 26.5","odds":"-115","reason":"stat-based reason","confidence":"HIGH"},
        {"player":"Exact Name","prop":"Rebounds OVER 8.5","odds":"-110","reason":"stat-based reason","confidence":"HIGH"},
        {"player":"Exact Name","prop":"Assists OVER 6.5","odds":"-120","reason":"stat-based reason","confidence":"MED"},
        {"player":"Exact Name","prop":"3-Pointers OVER 1.5","odds":"-150","reason":"stat-based reason","confidence":"HIGH"},
        {"player":"Exact Name","prop":"PRA OVER 32.5","odds":"-115","reason":"stat-based reason","confidence":"MED"}
      ]
    }
  ]
}`;

      const res = await fetch('/api/claude', {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1500, system:"Expert NBA same-game parlay builder. ONLY use players explicitly listed in provided data. Valid JSON only.", messages:[{role:"user",content:parlayPrompt}] }),
      });
      const data = await res.json();
      const text = data.content?.map(b=>b.text||"").join("")||"{}";
      setParlay(JSON.parse(text.replace(/```json|```/g,"").trim()));
    } catch(e) { console.error(e); setParlay(null); }
    setStatus(""); setParlayLoading(false);
  };

  const CONF_COLORS = { HIGH:"#00ff88", MED:"#fbbf24", LOW:"#ff6b35" };
  const LEG_COLORS  = { 3:"#00ff88", 4:"#fbbf24", 5:"#c084fc" };

  const PickCard = ({ title, icon, color, items }) => (
    <div style={{background:"#0a1220",border:`1px solid ${color}20`,borderRadius:4,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${color}15`,background:`${color}08`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color,fontFamily:"'Orbitron',monospace",letterSpacing:2}}>{icon} {title}</div>
        <div style={{fontSize:8,color:`${color}60`,fontFamily:"'Inter',sans-serif"}}>ACTIVE ROSTER · REAL STATS</div>
      </div>
      {(!items||items.length===0)&&<div style={{padding:16,textAlign:"center",color:"#2a3a55",fontSize:11,fontFamily:"'Inter',sans-serif"}}>No picks</div>}
      {items?.map((p,i)=>(
        <div key={i} style={{padding:"10px 14px",borderBottom:"1px solid #080f1e",transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background=`${color}06`}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:`${color}20`,border:`1px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:9,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{p.rank}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{p.player}</div>
              <div style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{p.team} · {p.matchup||`${p.pick} ${p.line}`}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{p.odds}</div>
              <div style={{fontSize:8,color:CONF_COLORS[p.confidence]||"#555",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{p.confidence}</div>
            </div>
          </div>
          <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif",lineHeight:1.5,paddingLeft:28}}>{p.reason}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* View toggle */}
      <div style={{flexShrink:0,display:"flex",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
        {[{id:"PICKS",label:"📊 ALL PICKS"},{id:"PARLAY",label:"🎯 TEAM PARLAY"}].map(v=>(
          <button key={v.id} onClick={()=>setActiveView(v.id)} style={{flex:1,padding:"10px",fontSize:9,letterSpacing:2,cursor:"pointer",background:activeView===v.id?`${C}10`:"transparent",border:"none",borderBottom:activeView===v.id?`2px solid ${C}`:"2px solid transparent",color:activeView===v.id?C:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── ALL PICKS VIEW ── */}
      {activeView==="PICKS" && (
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flexShrink:0,padding:"12px 20px",borderBottom:"1px solid #0a1828",background:"#02040a",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div>
              <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>AI Daily NBA Picks — Real Data</div>
              <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>Active rosters · Injury report · Last 10 game averages</div>
            </div>
            <button onClick={generatePicks} disabled={loading||gamesLoading||!games.length}
              style={{padding:"10px 20px",background:loading||!games.length?"#0a1220":`${C}15`,border:`1px solid ${loading||!games.length?"#1a2a40":C+"40"}`,borderRadius:3,color:loading||!games.length?"#2a3a5a":C,fontSize:10,cursor:loading||!games.length?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2,transition:"all 0.2s",whiteSpace:"nowrap",flexShrink:0}}>
              {loading?"LOADING···":generated?"🔄 REGENERATE":"🏀 GENERATE PICKS"}
            </button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
            {loading&&<div style={{padding:40,textAlign:"center"}}><div style={{fontSize:14,color:C,letterSpacing:4,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace",marginBottom:16}}>LOADING REAL DATA···</div><div style={{fontSize:12,color:"#38bdf8",fontFamily:"'Inter',sans-serif",marginBottom:8}}>{status}</div><div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>{dataLog.map((l,i)=><div key={i} style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{l}</div>)}</div></div>}
            {!loading&&!picks&&<div style={{padding:60,textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>🏀</div><div style={{fontSize:13,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginBottom:8}}>{games.length} games today</div><div style={{fontSize:11,color:"#1a2a4a",fontFamily:"'Inter',sans-serif",lineHeight:1.8}}>✓ Active rosters per team<br/>✓ Injury/questionable report<br/>✓ Last 10 game averages<br/>✓ Real data only — no guessing</div></div>}
            {!loading&&picks&&(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                <PickCard title="POINTS"        icon="🏀" color={C}       items={picks.points}/>
                <PickCard title="REBOUNDS"      icon="💪" color="#38bdf8" items={picks.rebounds}/>
                <PickCard title="ASSISTS"       icon="🎯" color="#00ff88" items={picks.assists}/>
                <PickCard title="3-POINTERS"    icon="🌐" color="#fbbf24" items={picks.threes}/>
                <PickCard title="PRA"           icon="⭐" color="#c084fc" items={picks.pra}/>
                <PickCard title="DOUBLE-DOUBLE" icon="🔥" color="#f97316" items={picks.doubleDouble}/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEAM PARLAY VIEW ── */}
      {activeView==="PARLAY" && (
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flexShrink:0,padding:"12px 20px",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
            <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",marginBottom:4}}>Same-Game Parlay Builder</div>
            <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginBottom:12}}>Select a team playing today — AI builds 3, 4, and 5-leg parlays using real roster stats</div>
            {/* Team selector */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {teamOptions.map(team=>(
                <button key={team.id} onClick={()=>generateParlay(team)} disabled={parlayLoading}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",background:selectedTeam?.id===team.id?`${C}20`:"#0a1220",border:`1px solid ${selectedTeam?.id===team.id?C+"60":"#1a2a40"}`,borderRadius:3,color:selectedTeam?.id===team.id?C:"#6a8090",cursor:parlayLoading?"not-allowed":"pointer",fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:"500",transition:"all 0.2s"}}
                  onMouseEnter={e=>{if(selectedTeam?.id!==team.id){e.currentTarget.style.background="#0d1a28";e.currentTarget.style.borderColor="#2a3a5a";}}}
                  onMouseLeave={e=>{if(selectedTeam?.id!==team.id){e.currentTarget.style.background="#0a1220";e.currentTarget.style.borderColor="#1a2a40";}}}>
                  {team.logo&&<img src={team.logo} style={{width:18,height:18,objectFit:"contain"}} alt=""/>}
                  <span>{team.name}</span>
                  <span style={{fontSize:10,color:"#3a5070"}}>vs {team.opponent}</span>
                </button>
              ))}
              {teamOptions.length===0&&<div style={{fontSize:12,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>No games today — check back later</div>}
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
            {parlayLoading&&(
              <div style={{padding:40,textAlign:"center"}}>
                <div style={{fontSize:14,color:C,letterSpacing:4,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace",marginBottom:16}}>BUILDING PARLAY···</div>
                <div style={{fontSize:12,color:"#38bdf8",fontFamily:"'Inter',sans-serif",marginBottom:8}}>{status}</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center"}}>{dataLog.map((l,i)=><div key={i} style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{l}</div>)}</div>
              </div>
            )}
            {!parlayLoading&&!selectedTeam&&(
              <div style={{padding:60,textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:12}}>🎯</div>
                <div style={{fontSize:13,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginBottom:6}}>Select a team above</div>
                <div style={{fontSize:11,color:"#1a2a4a",fontFamily:"'Inter',sans-serif",lineHeight:1.8}}>AI will build 3-leg, 4-leg, and 5-leg same-game parlays<br/>using real roster stats and injury data</div>
              </div>
            )}
            {!parlayLoading&&selectedTeam&&!parlay&&(
              <div style={{padding:40,textAlign:"center",color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No parlay data generated. Try again.</div>
            )}
            {!parlayLoading&&parlay&&(
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  {selectedTeam?.logo&&<img src={selectedTeam.logo} style={{width:32,height:32,objectFit:"contain"}} alt=""/>}
                  <div>
                    <div style={{fontSize:16,fontWeight:"bold",color:"#c8d8f0",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>{selectedTeam?.name}</div>
                    <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>vs {selectedTeam?.opponent} · {parlay.tipTime}</div>
                  </div>
                </div>
                {(parlay.parlays||[]).map((p,pi)=>{
                  const legColor = LEG_COLORS[p.legs] || C;
                  return (
                    <div key={pi} style={{background:"#0a1220",border:`1px solid ${legColor}25`,borderRadius:4,overflow:"hidden"}}>
                      {/* Parlay header */}
                      <div style={{padding:"12px 16px",background:`${legColor}10`,borderBottom:`1px solid ${legColor}20`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:12}}>
                          <div style={{background:`${legColor}20`,border:`1px solid ${legColor}40`,borderRadius:3,padding:"4px 12px"}}>
                            <span style={{fontSize:14,fontWeight:"900",color:legColor,fontFamily:"'Orbitron',monospace"}}>{p.legs}-LEG PARLAY</span>
                          </div>
                          <div style={{fontSize:9,color:`${legColor}70`,letterSpacing:2,fontFamily:"'Orbitron',monospace"}}>{p.confidence} CONFIDENCE</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:9,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginBottom:2}}>EST. ODDS</div>
                          <div style={{fontSize:20,fontWeight:"bold",color:legColor,fontFamily:"'Orbitron',monospace"}}>{p.estimatedOdds}</div>
                        </div>
                      </div>
                      {/* Legs */}
                      {(p.legs_detail||[]).map((leg,li)=>(
                        <div key={li} style={{padding:"10px 16px",borderBottom:"1px solid #0a1828",display:"flex",alignItems:"flex-start",gap:10}}>
                          <div style={{width:22,height:22,borderRadius:"50%",background:`${legColor}20`,border:`1px solid ${legColor}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                            <span style={{fontSize:10,fontWeight:"bold",color:legColor,fontFamily:"'Orbitron',monospace"}}>{li+1}</span>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                              <div>
                                <span style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{leg.player}</span>
                                <span style={{fontSize:11,color:legColor,fontFamily:"'Orbitron',monospace",marginLeft:8}}>{leg.prop}</span>
                              </div>
                              <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                                <span style={{fontSize:12,fontWeight:"bold",color:legColor,fontFamily:"'Orbitron',monospace"}}>{leg.odds}</span>
                                <span style={{fontSize:8,color:CONF_COLORS[leg.confidence]||"#555",fontFamily:"'Orbitron',monospace",marginLeft:6,letterSpacing:1}}>{leg.confidence}</span>
                              </div>
                            </div>
                            <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif",lineHeight:1.4}}>{leg.reason}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top Picks Section (MLB) — Active Roster + Live Stats ─────────────────────
function TopPicksSection({ games, gamesLoading, C }) {
  const [picks, setPicks]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [status, setStatus]   = useState("");
  const [dataLog, setDataLog] = useState([]);

  const log = (msg) => {
    setStatus(msg);
    setDataLog(prev => [...prev, msg]);
  };

  const generatePicks = async () => {
    if (!games.length) return;
    setLoading(true); setPicks(null); setDataLog([]);

    try {
      const gameContexts = [];

      // ── Step 1: Try cache first, fall back to live fetch ─────────────────
      log("Checking cached data from cron jobs...");
      const [cachedInjuries, cachedRosters, cachedStats, cachedLineups] = await Promise.all([
        fetchCachedInjuries(),
        fetchCachedRosters(),
        fetchCachedStats(),
        fetchCachedLineups(),
      ]);

      const usingCache = !!(cachedStats?.mlb && Object.keys(cachedStats.mlb.batters||{}).length > 0);
      log(usingCache ? "✅ Using cached data — fast mode!" : "⚡ No cache found — fetching live data...");

      // ── Step 2: Get injuries ──────────────────────────────────────────────
      log("Checking injury/IL report...");
      let injuredPlayers = [];
      try {
        // Use cached injuries if available
        if (cachedInjuries?.mlb?.length > 0) {
          injuredPlayers = cachedInjuries.mlb
            .filter(i=>['Out','Doubtful'].includes(i.status))
            .map(i=>i.player).filter(Boolean);
          log(`✅ Cached: ${cachedInjuries.mlb.length} MLB injuries loaded`);
        } else {
          const injRes = await fetch(`/api/injury-monitor`);
          const injData = await injRes.json();
          injuredPlayers = (injData.data?.mlbTransactions || [])
            .slice(0, 50).map(t => t.player).filter(Boolean);
        }
      } catch {}
      const injuryNote = injuredPlayers.length > 0
        ? `Players recently placed on IL (do NOT recommend these players): ${injuredPlayers.slice(0,20).join(", ")}`
        : "No recent IL transactions found";

      // ── Step 3: For each game pull active rosters + pitcher stats ─────────
      for (const game of games.slice(0, 6)) {
        const gamePk = game.gamePk;
        const away = game.teams?.away;
        const home = game.teams?.home;
        const awayTeam = away?.team?.name || "Away";
        const homeTeam = home?.team?.name || "Home";
        const awayPitcher = away?.probablePitcher;
        const homePitcher = home?.probablePitcher;

        log(`Loading ${awayTeam} @ ${homeTeam}...`);

        // Get park factor
        let parkNote = "";
        try {
          const pfRes = await fetch(`/api/statcast?type=park`);
          const pfData = await pfRes.json();
          const venue = game.venue?.name || "";
          const pf = pfData[venue];
          if (pf) parkNote = `\n  🏟️ ${venue} — HR Factor: ${pf.hr} ${pf.flag}`;
        } catch {}

        let gameCtx = `\n📍 ${awayTeam} @ ${homeTeam}`;
        if (parkNote) gameCtx += parkNote;
        gameCtx += `\n  Away SP: ${awayPitcher?.fullName || "TBD"}`;
        gameCtx += `\n  Home SP: ${homePitcher?.fullName || "TBD"}`;

        // Get pitcher recent form
        for (const [side, pitcher] of [["Away", awayPitcher], ["Home", homePitcher]]) {
          if (!pitcher?.id) continue;
          try {
            const pr = await fetch(`/api/mlb?type=pitching&playerId=${pitcher.id}`);
            const pd = await pr.json();
            const logs = pd.stats?.[0]?.splits?.slice(0, 5) || [];
            if (logs.length) {
              const avgK  = (logs.reduce((s,l)=>s+(l.stat?.strikeOuts||0),0)/logs.length).toFixed(1);
              const avgIP = (logs.reduce((s,l)=>s+(parseFloat(l.stat?.inningsPitched)||0),0)/logs.length).toFixed(1);
              const avgER = (logs.reduce((s,l)=>s+(l.stat?.earnedRuns||0),0)/logs.length).toFixed(1);
              const recent = logs.map(l=>`${l.date?.slice(5)||"?"}:${l.stat?.inningsPitched||0}IP/${l.stat?.strikeOuts||0}K/${l.stat?.earnedRuns||0}ER`).join(" ");
              gameCtx += `\n  ${side} SP last 5 starts: ${recent}`;
              gameCtx += `\n  ${side} SP averages: ${avgIP}IP, ${avgK}K, ${avgER}ER per start`;
            }
          } catch {}
        }

        // Always fetch rosters live from MLB Stats API — most reliable source
        const awayTeamId = away?.team?.id;
        const homeTeamId = home?.team?.id;
        const awayAbbr   = away?.team?.abbreviation;
        const homeAbbr   = home?.team?.abbreviation;
        const PITCHERS   = ['P','SP','RP','CL'];

        let awayHitters = [];
        let homeHitters = [];

        log(`Fetching live rosters for ${awayTeam} & ${homeTeam}...`);
        try {
          const [awayRosterRes, homeRosterRes] = await Promise.all([
            fetch(`https://statsapi.mlb.com/api/v1/teams/${awayTeamId}/roster?rosterType=active`),
            fetch(`https://statsapi.mlb.com/api/v1/teams/${homeTeamId}/roster?rosterType=active`),
          ]);
          const [awayRosterData, homeRosterData] = await Promise.all([
            awayRosterRes.json(), homeRosterRes.json()
          ]);
          awayHitters = (awayRosterData.roster||[])
            .filter(p=>!PITCHERS.includes(p.position?.abbreviation))
            .map(p=>({id:p.person?.id, name:p.person?.fullName, pos:p.position?.abbreviation, team:awayTeam}));
          homeHitters = (homeRosterData.roster||[])
            .filter(p=>!PITCHERS.includes(p.position?.abbreviation))
            .map(p=>({id:p.person?.id, name:p.person?.fullName, pos:p.position?.abbreviation, team:homeTeam}));
          if (awayHitters.length) log(`✅ ${awayTeam}: ${awayHitters.length} active hitters`);
          if (homeHitters.length) log(`✅ ${homeTeam}: ${homeHitters.length} active hitters`);
        } catch(e) { log(`⚠️ Roster fetch failed: ${e.message}`); }

        // Try confirmed lineup — if available use batting order, else use full roster
        let awayLineup = awayHitters;
        let homeLineup = homeHitters;
        try {
          const feedRes = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
          const feedData = await feedRes.json();
          const awayOrder = feedData.liveData?.boxscore?.teams?.away?.battingOrder || [];
          const homeOrder = feedData.liveData?.boxscore?.teams?.home?.battingOrder || [];
          const awayP = feedData.liveData?.boxscore?.teams?.away?.players || {};
          const homeP = feedData.liveData?.boxscore?.teams?.home?.players || {};
          if (awayOrder.length > 0) {
            awayLineup = awayOrder.slice(0,9).map(id=>({id, name:awayP[`ID${id}`]?.person?.fullName, team:awayTeam})).filter(p=>p.name);
            gameCtx += `\n  ✅ CONFIRMED ${awayTeam} Lineup: ${awayLineup.map(p=>`${p.name}[${awayTeam}]`).join(", ")}`;
          } else {
            gameCtx += `\n  📋 ${awayTeam} Active Roster (lineup TBD): ${awayHitters.map(p=>`${p.name}[${awayTeam}](${p.pos})`).join(", ")}`;
          }
          if (homeOrder.length > 0) {
            homeLineup = homeOrder.slice(0,9).map(id=>({id, name:homeP[`ID${id}`]?.person?.fullName, team:homeTeam})).filter(p=>p.name);
            gameCtx += `\n  ✅ CONFIRMED ${homeTeam} Lineup: ${homeLineup.map(p=>`${p.name}[${homeTeam}]`).join(", ")}`;
          } else {
            gameCtx += `\n  📋 ${homeTeam} Active Roster (lineup TBD): ${homeHitters.map(p=>`${p.name}[${homeTeam}](${p.pos})`).join(", ")}`;
          }
        } catch {
          if (awayHitters.length) gameCtx += `\n  📋 ${awayTeam} Active Roster: ${awayHitters.map(p=>`${p.name}[${awayTeam}](${p.pos})`).join(", ")}`;
          if (homeHitters.length) gameCtx += `\n  📋 ${homeTeam} Active Roster: ${homeHitters.map(p=>`${p.name}[${homeTeam}](${p.pos})`).join(", ")}`;
        }

        // Batch fetch last 14-day stats for top hitters
        const allHitters = [...awayLineup.slice(0,6), ...homeLineup.slice(0,6)];
        const hitterIds = allHitters.map(p=>p.id).filter(Boolean);

        if (hitterIds.length > 0) {
          log(`Loading 14-day stats for ${awayTeam} & ${homeTeam}...`);
          try {
            // Use cached batter stats if available
            const cachedBatters = cachedStats?.mlb?.batters || {};
            const hasCachedStats = hitterIds.some(id => cachedBatters[id]);

            let batchData = {};
            if (hasCachedStats) {
              // Use cache
              hitterIds.forEach(id => { if(cachedBatters[id]) batchData[id] = cachedBatters[id]; });
              log(`✅ Using cached batting stats for ${awayTeam} & ${homeTeam}`);
            } else {
              // Fall back to live fetch
              const batchRes = await fetch(`/api/mlb?type=batchbatting&playerId=${hitterIds.join(",")}`);
              batchData = await batchRes.json();
            }

            gameCtx += `\n  14-day batting stats:`;
            for (const hitter of allHitters) {
              const st = batchData[hitter.id];
              const team = awayLineup.find(p=>p.id===hitter.id) ? awayTeam : homeTeam;
              if (st && (st.plateAppearances > 0 || st.pa > 0)) {
                const avg = st.avg || "---";
                const hits = st.hits || st.h || 0;
                const hr = st.homeRuns || st.hr || 0;
                const doubles = st.doubles || 0;
                const tb = st.totalBases || st.tb || 0;
                const pa = st.plateAppearances || st.pa || 0;
                gameCtx += `\n    ${hitter.name}[${team}]: ${avg} AVG, ${hits}H, ${hr}HR, ${doubles}2B, ${tb}TB in ${pa}PA`;
              }
            }
          } catch {}
        }

        gameContexts.push(gameCtx);
      }

      // ── Step 3: Generate picks with all real data ─────────────────────────
      log("Sending real data to AI for pick generation...");

      const prompt = `You are an elite MLB prop betting analyst. The data below was pulled LIVE from MLB Stats API today and contains the actual current rosters reflecting all 2025-26 offseason moves.

ABSOLUTE RULES — YOU MUST FOLLOW THESE EXACTLY:
1. ONLY recommend players whose names appear in the roster/lineup data below
2. Do NOT use training data to recall which team a player is on — the data below is authoritative
3. If a player is not listed below, do NOT recommend them — period
4. Cross-check: before recommending any player, verify their name appears in the section for that team
5. Players on IL/injury report must be excluded
6. Factor in ballpark — high HR factor parks (>110) boost HR and TB props
7. Heavily weight last 7-day form — a player hitting .380 in last 7 days is a strong hit/TB pick
8. Use Hard Hit%, Barrel%, xBA, xSLG when available — these are better indicators than raw AVG

TODAY'S LIVE ROSTER AND STATS DATA:
${gameContexts.join("\n")}

INJURY/IL REPORT — DO NOT RECOMMEND THESE PLAYERS:
${injuryNote}

Generate today's top 5 picks per category using ONLY players listed above. Reference specific stats in your reasoning.

Respond ONLY with valid JSON, no markdown:
{
  "homeRuns":[
    {"rank":1,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+185","reason":"References actual stats e.g. 3 HR in last 14 days, facing SP averaging 4.2 ER/start","confidence":"HIGH"},
    {"rank":2,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+210","reason":"Specific stat-based reason","confidence":"HIGH"},
    {"rank":3,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+195","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":4,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+240","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":5,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+175","reason":"Specific stat-based reason","confidence":"MED"}
  ],
  "hits":[
    {"rank":1,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-125","reason":"References actual 14-day hit rate","confidence":"HIGH"},
    {"rank":2,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-115","reason":"Specific stat-based reason","confidence":"HIGH"},
    {"rank":3,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-110","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":4,"player":"Exact Name From Data","team":"Team Name","line":"0.5","pick":"OVER","odds":"-180","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":5,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-105","reason":"Specific stat-based reason","confidence":"MED"}
  ],
  "totalBases":[
    {"rank":1,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-130","reason":"References actual TB numbers","confidence":"HIGH"},
    {"rank":2,"player":"Exact Name From Data","team":"Team Name","line":"2.5","pick":"OVER","odds":"+110","reason":"Specific stat-based reason","confidence":"HIGH"},
    {"rank":3,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-120","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":4,"player":"Exact Name From Data","team":"Team Name","line":"2.5","pick":"OVER","odds":"+105","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":5,"player":"Exact Name From Data","team":"Team Name","line":"1.5","pick":"OVER","odds":"-110","reason":"Specific stat-based reason","confidence":"MED"}
  ],
  "doubles":[
    {"rank":1,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+225","reason":"References actual doubles data","confidence":"MED"},
    {"rank":2,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+250","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":3,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+235","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":4,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+260","reason":"Specific stat-based reason","confidence":"LOW"},
    {"rank":5,"player":"Exact Name From Data","team":"Team Name","matchup":"vs SP Name","odds":"+215","reason":"Specific stat-based reason","confidence":"LOW"}
  ],
  "strikeouts":[
    {"rank":1,"player":"Exact SP Name From Data","team":"Team Name","line":"6.5","pick":"OVER","odds":"-115","reason":"References actual last 5 starts K numbers e.g. averaging 7.2 K/start","confidence":"HIGH"},
    {"rank":2,"player":"Exact SP Name From Data","team":"Team Name","line":"5.5","pick":"OVER","odds":"-130","reason":"Specific stat-based reason","confidence":"HIGH"},
    {"rank":3,"player":"Exact SP Name From Data","team":"Team Name","line":"7.5","pick":"OVER","odds":"+110","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":4,"player":"Exact SP Name From Data","team":"Team Name","line":"5.5","pick":"OVER","odds":"-120","reason":"Specific stat-based reason","confidence":"MED"},
    {"rank":5,"player":"Exact SP Name From Data","team":"Team Name","line":"6.5","pick":"OVER","odds":"-105","reason":"Specific stat-based reason","confidence":"MED"}
  ]
}`;

      const res = await fetch('/api/claude', {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:2000,
          system:"You are an expert MLB prop betting analyst. CRITICAL: You must ONLY recommend players explicitly listed in the user message data. The roster data was pulled live from MLB Stats API today. Never use your training data to determine team rosters — players change teams via trades and free agency. If a player is not in the provided data, do not recommend them. Respond with valid JSON only, no markdown.",
          messages:[{role:"user",content:prompt}]
        }),
      });
      const data = await res.json();
      const text = data.content?.map(b=>b.text||"").join("")||"{}";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());

      // Validate picks — build list of all valid player names from fetched data
      const validNames = gameContexts.join(" ")
        .split("\n")
        .filter(l => l.includes("(") && !l.includes("SP:") && !l.includes("@"))
        .flatMap(l => l.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g)||[]);

      // Filter out any picks with players not in our data (loose match)
      const validatePicks = (picks) => {
        if (!picks) return picks;
        return picks.map(p => {
          const inData = validNames.length === 0 || // if no names parsed, allow all
            validNames.some(n => p.player?.toLowerCase().includes(n.split(" ")[1]?.toLowerCase()));
          return { ...p, verified: inData };
        });
      };

      const validatedPicks = {
        homeRuns:   validatePicks(parsed.homeRuns),
        hits:       validatePicks(parsed.hits),
        totalBases: validatePicks(parsed.totalBases),
        doubles:    validatePicks(parsed.doubles),
        strikeouts: validatePicks(parsed.strikeouts),
      };

      setPicks(validatedPicks);
      setGenerated(true);

    } catch(e) {
      console.error(e);
      setPicks(null);
    }
    setStatus("");
    setLoading(false);
  };

  const CONF_COLORS = { HIGH:"#00ff88", MED:"#fbbf24", LOW:"#ff6b35" };

  const PickCard = ({ title, icon, color, items }) => (
    <div style={{background:"#0a1220",border:`1px solid ${color}20`,borderRadius:4,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:`1px solid ${color}15`,background:`${color}08`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color,fontFamily:"'Orbitron',monospace",letterSpacing:2}}>{icon} {title}</div>
        <div style={{fontSize:8,color:`${color}60`,fontFamily:"'Inter',sans-serif"}}>ACTIVE ROSTER · LIVE STATS</div>
      </div>
      {(!items||items.length===0)&&<div style={{padding:16,textAlign:"center",color:"#2a3a55",fontSize:11,fontFamily:"'Inter',sans-serif"}}>No picks generated</div>}
      {items?.map((p,i)=>(
        <div key={i} style={{padding:"10px 14px",borderBottom:"1px solid #080f1e",transition:"background 0.15s",opacity:p.verified===false?0.5:1}}
          onMouseEnter={e=>e.currentTarget.style.background=`${color}06`}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:`${color}20`,border:`1px solid ${color}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:9,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{p.rank}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{p.player}</div>
                {p.verified===false && <span style={{fontSize:8,color:"#ff4444",background:"#ff444415",border:"1px solid #ff444430",padding:"1px 5px",borderRadius:2,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>VERIFY</span>}
                {p.verified===true && <span style={{fontSize:8,color:"#00ff88",background:"#00ff8815",border:"1px solid #00ff8830",padding:"1px 5px",borderRadius:2,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>✓</span>}
              </div>
              <div style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{p.team} · {p.matchup||`${p.pick} ${p.line}`}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:12,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{p.odds}</div>
              <div style={{fontSize:8,color:CONF_COLORS[p.confidence]||"#555",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{p.confidence}</div>
            </div>
          </div>
          <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif",lineHeight:1.5,paddingLeft:28}}>{p.reason}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{flexShrink:0,padding:"12px 20px",borderBottom:"1px solid #0a1828",background:"#02040a",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>AI Daily MLB Picks — Real Data</div>
          <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>Current active rosters · Confirmed lineups · Pitcher last 5 starts · 14-day batting stats · IL report</div>
        </div>
        <button onClick={generatePicks} disabled={loading||gamesLoading||!games.length}
          style={{padding:"10px 20px",background:loading||!games.length?"#0a1220":`${C}15`,border:`1px solid ${loading||!games.length?"#1a2a40":C+"40"}`,borderRadius:3,color:loading||!games.length?"#2a3a5a":C,fontSize:10,cursor:loading||!games.length?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2,transition:"all 0.2s",whiteSpace:"nowrap",flexShrink:0}}>
          {loading?"LOADING···":generated?"🔄 REGENERATE":"⚾ GENERATE PICKS"}
        </button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
        {loading && (
          <div style={{padding:40,textAlign:"center"}}>
            <div style={{fontSize:14,color:C,letterSpacing:4,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace",marginBottom:16}}>LOADING REAL DATA···</div>
            <div style={{fontSize:12,color:"#38bdf8",fontFamily:"'Inter',sans-serif",marginBottom:8}}>{status}</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center",maxHeight:120,overflowY:"auto"}}>
              {dataLog.map((l,i)=><div key={i} style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{l}</div>)}
            </div>
          </div>
        )}
        {!loading && !picks && (
          <div style={{padding:60,textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:12}}>⚾</div>
            <div style={{fontSize:13,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginBottom:8}}>{games.length} games today</div>
            <div style={{fontSize:11,color:"#1a2a4a",fontFamily:"'Inter',sans-serif",lineHeight:1.8}}>
              Clicking GENERATE PICKS will:<br/>
              ✓ Pull current active 26-man rosters<br/>
              ✓ Check confirmed lineups (if posted)<br/>
              ✓ Fetch pitcher last 5 starts<br/>
              ✓ Fetch 14-day batting stats per hitter<br/>
              ✓ Check IL/injury report<br/>
              ✓ Generate picks from real data only
            </div>
          </div>
        )}
        {!loading && picks && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <PickCard title="HOME RUNS"   icon="🏠" color="#f97316" items={picks.homeRuns}/>
            <PickCard title="HITS"        icon="🎯" color="#38bdf8" items={picks.hits}/>
            <PickCard title="TOTAL BASES" icon="💥" color="#c084fc" items={picks.totalBases}/>
            <PickCard title="DOUBLES"     icon="⚡" color="#fbbf24" items={picks.doubles}/>
            <div style={{gridColumn:"1/-1"}}>
              <PickCard title="PITCHER STRIKEOUTS" icon="🔥" color="#00ff88" items={picks.strikeouts}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Cheat Sheet ───────────────────────────────────────────────────────────────
function CheatSheet({ games, gamesLoading, C }) {
  const [sheets, setSheets]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState("");
  const [selectedGame, setSelectedGame] = useState(null);
  const [weather, setWeather]     = useState({});
  const [awaySortBy, setAwaySortBy]   = useState("order");
  const [awaySortDir, setAwaySortDir] = useState("asc");
  const [homeSortBy, setHomeSortBy]   = useState("order");
  const [homeSortDir, setHomeSortDir] = useState("asc");

  const load = async () => {
    if (!games.length) return;
    setLoading(true); setSheets([]); setSelectedGame(null);

    const result = [];

    // Pre-fetch park factors and Statcast leaderboard
    setStatus("Loading Statcast leaderboard and park factors...");
    let statcastMap = {};
    let parkFactors = {};
    try {
      const [scRes, pfRes] = await Promise.all([
        fetch(`/api/statcast?type=leaderboard`),
        fetch(`/api/statcast?type=park`),
      ]);
      const [scData, pfData] = await Promise.all([scRes.json(), pfRes.json()]);
      // Build map by player id
      if (Array.isArray(scData)) {
        scData.forEach(p => { if(p.id) statcastMap[p.id] = p; });
      }
      parkFactors = pfData || {};
    } catch {}

    for (const game of games.slice(0, 8)) {
      const away        = game.teams?.away;
      const home        = game.teams?.home;
      const awayTeam    = away?.team?.name;
      const homeTeam    = home?.team?.name;
      const awayAbbr    = away?.team?.abbreviation;
      const homeAbbr    = home?.team?.abbreviation;
      const awayId      = away?.team?.id;
      const homeId      = home?.team?.id;
      const awayPitcher = away?.probablePitcher;
      const homePitcher = home?.probablePitcher;
      const gameTime    = new Date(game.gameDate).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
      const PITCHERS    = ['P','SP','RP','CL'];

      setStatus(`Loading ${awayAbbr} @ ${homeAbbr}...`);

      const venueName = game.venue?.name || "";
      const park = parkFactors[venueName] || null;
      const sheet = {
        gamePk: game.gamePk, awayTeam, homeTeam, awayAbbr, homeAbbr,
        gameTime, venue: venueName, status: game.status?.abstractGameState,
        park,
        awayPitcher: null, homePitcher: null,
        awayBatters: [], homeBatters: [],
        awayLineupConfirmed: false, homeLineupConfirmed: false,
      };

      // Fetch pitcher splits
      const fetchPitcherData = async (pitcher, side) => {
        if (!pitcher?.id) return { side, name:"TBD", hand:"?", era:"—", whip:"—", k9:"—", bb9:"—", ip:"—", wl:"—", avgVsL:"—", opsVsL:"—", hrVsL:"—", kVsL:"—", avgVsR:"—", opsVsR:"—", hrVsR:"—", kVsR:"—" };
        try {
          const [seasonRes, splitsRes, bioRes] = await Promise.all([
            fetch(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=season&group=pitching&season=2026`),
            fetch(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}/stats?stats=statSplits&group=pitching&season=2026&sitCodes=vl,vr`),
            fetch(`https://statsapi.mlb.com/api/v1/people/${pitcher.id}`),
          ]);
          const [sD, spD, bD] = await Promise.all([seasonRes.json(), splitsRes.json(), bioRes.json()]);
          const s   = sD.stats?.[0]?.splits?.[0]?.stat || {};
          const spl = spD.stats?.[0]?.splits || [];
          const vsL = spl.find(x=>x.split?.code==="vl")?.stat || {};
          const vsR = spl.find(x=>x.split?.code==="vr")?.stat || {};
          const hand = bD.people?.[0]?.pitchHand?.code || "?";
          return {
            side, name: pitcher.fullName, id: pitcher.id, hand,
            era: s.era||"—", whip: s.whip||"—", k9: s.strikeoutsPer9Inn||"—",
            bb9: s.walksPer9Inn||"—", ip: s.inningsPitched||"—",
            wl: s.wins!=null?`${s.wins}-${s.losses}`:"—",
            gbPct: s.groundOutsToAirouts||"—",
            avgVsL: vsL.avg||"—", opsVsL: vsL.ops||"—", hrVsL: vsL.homeRuns??0, kVsL: vsL.strikeOuts??0, abVsL: vsL.atBats??0,
            avgVsR: vsR.avg||"—", opsVsR: vsR.ops||"—", hrVsR: vsR.homeRuns??0, kVsR: vsR.strikeOuts??0, abVsR: vsR.atBats??0,
          };
        } catch { return { side, name:pitcher.fullName||"?", hand:"?", era:"—", whip:"—", k9:"—", bb9:"—", ip:"—", wl:"—", avgVsL:"—", opsVsL:"—", hrVsL:0, kVsL:0, avgVsR:"—", opsVsR:"—", hrVsR:0, kVsR:0 }; }
      };

      const [awayPData, homePData] = await Promise.all([
        fetchPitcherData(awayPitcher, "Away"),
        fetchPitcherData(homePitcher, "Home"),
      ]);
      sheet.awayPitcher = awayPData;
      sheet.homePitcher = homePData;

      // Fetch batter splits for both teams
      const fetchBatters = async (teamId, teamName, oppPitcherHand) => {
        const batters = [];
        try {
          // Try confirmed lineup first
          const feedRes = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live?fields=liveData,boxscore,teams,battingOrder,players`);
          const feedData = await feedRes.json();
          const isAway = teamId === awayId;
          const side   = isAway ? "away" : "home";
          const order  = feedData.liveData?.boxscore?.teams?.[side]?.battingOrder || [];
          const plrs   = feedData.liveData?.boxscore?.teams?.[side]?.players || {};
          let hitterIds = [];
          let confirmed = false;

          if (order.length > 0) {
            confirmed = true;
            hitterIds = order.slice(0,9).map(id=>({ id, name: plrs[`ID${id}`]?.person?.fullName })).filter(p=>p.name);
          } else {
            const rRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`);
            const rD   = await rRes.json();
            hitterIds  = (rD.roster||[]).filter(p=>!PITCHERS.includes(p.position?.abbreviation)).slice(0,9).map(p=>({id:p.person?.id, name:p.person?.fullName, pos:p.position?.abbreviation}));
          }

          // Fetch splits for each hitter
          await Promise.all(hitterIds.slice(0,9).map(async (hitter, idx) => {
            try {
              const [splRes, bioRes, seasonRes, saberRes] = await Promise.all([
                fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.id}/stats?stats=statSplits&group=hitting&season=2026&sitCodes=vl,vr`),
                fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.id}`),
                fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.id}/stats?stats=season&group=hitting&season=2026`),
                fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.id}/stats?stats=season&group=hitting&season=2026&fields=stats,splits,stat,hardHitPercent,barrelPercent,launchAngle,exitVelocity`),
              ]);
              const [spD, bD, seD, sabD] = await Promise.all([splRes.json(), bioRes.json(), seasonRes.json(), saberRes.json()]);
              const spl    = spD.stats?.[0]?.splits || [];
              const vsL    = spl.find(x=>x.split?.code==="vl")?.stat || {};
              const vsR    = spl.find(x=>x.split?.code==="vr")?.stat || {};
              const season = seD.stats?.[0]?.splits?.[0]?.stat || {};
              const saber  = sabD.stats?.[0]?.splits?.[0]?.stat || {};
              const hand   = bD.people?.[0]?.batSide?.code || "?";
              const pos    = bD.people?.[0]?.primaryPosition?.abbreviation || hitter.pos || "?";
              // ISO = SLG - AVG
              const iso = season.slg && season.avg
                ? (parseFloat(season.slg) - parseFloat(season.avg)).toFixed(3)
                : "—";
              const isoVsL = vsL.slg && vsL.avg
                ? (parseFloat(vsL.slg) - parseFloat(vsL.avg)).toFixed(3)
                : "—";
              const isoVsR = vsR.slg && vsR.avg
                ? (parseFloat(vsR.slg) - parseFloat(vsR.avg)).toFixed(3)
                : "—";
              // Get Statcast data from leaderboard
              const sc = statcastMap[String(hitter.id)] || {};
              const hardHitVal = sc.hardHitPct ? `${sc.hardHitPct}%` : saber.hardHitPercent!=null ? `${saber.hardHitPercent}%` : "—";
              const barrelVal  = sc.barrelPct  ? `${sc.barrelPct}%`  : saber.barrelPercent!=null  ? `${saber.barrelPercent}%`  : "—";
              const xBAval     = sc.xBA  || "—";
              const xSLGval    = sc.xSLG || "—";
              const avgEVval   = sc.avgEV ? `${sc.avgEV}` : "—";

              // Recent form last 7/14 days
              let last7Avg="—", last7HR=0, last7OPS="—", recentTrend=[];
              try {
                const recentRes = await fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.id}/stats?stats=byDateRange&group=hitting&startDate=${new Date(Date.now()-7*86400000).toISOString().split("T")[0]}&endDate=${new Date().toISOString().split("T")[0]}&season=2026`);
                const recentData = await recentRes.json();
                const r7 = recentData.stats?.[0]?.splits?.[0]?.stat || {};
                last7Avg = r7.avg||"—"; last7HR = r7.homeRuns??0; last7OPS = r7.ops||"—";
              } catch {}

              batters.push({
                order: idx+1, name: hitter.name, pos, hand, team: teamName,
                oppHand: oppPitcherHand,
                seasonAvg: season.avg||"—", seasonHR: season.homeRuns??0, seasonOPS: season.ops||"—",
                seasonSLG: season.slg||"—", seasonISO: iso,
                hardHit: hardHitVal, barrel: barrelVal,
                xBA: xBAval, xSLG: xSLGval, avgEV: avgEVval,
                last7Avg, last7HR, last7OPS,
                avgVsL: vsL.avg||"—", opsVsL: vsL.ops||"—", slgVsL: vsL.slg||"—", isoVsL, hrVsL: vsL.homeRuns??0, abVsL: vsL.atBats??0,
                avgVsR: vsR.avg||"—", opsVsR: vsR.ops||"—", slgVsR: vsR.slg||"—", isoVsR, hrVsR: vsR.homeRuns??0, abVsR: vsR.atBats??0,
              });
            } catch {}
          }));

          return { batters, confirmed };
        } catch { return { batters, confirmed: false }; }
      };

      const [awayBatterResult, homeBatterResult] = await Promise.all([
        fetchBatters(awayId, awayTeam, homePData.hand),
        fetchBatters(homeId, homeTeam, awayPData.hand),
      ]);

      sheet.awayBatters = awayBatterResult.batters;
      sheet.awayLineupConfirmed = awayBatterResult.confirmed;
      sheet.homeBatters = homeBatterResult.batters;
      sheet.homeLineupConfirmed = homeBatterResult.confirmed;

      result.push(sheet);
    }

    setSheets(result);
    if (result.length > 0) setSelectedGame(result[0]);
    setStatus("");
    setLoading(false);
  };

  // Color helpers
  const avgColor  = v => { const n=parseFloat(v); if(n>=0.280)return"#00ff88"; if(n<=0.210)return"#ff4444"; return"#c8d8f0"; };
  const opsColor  = v => { const n=parseFloat(v); if(n>=0.850)return"#00ff88"; if(n<=0.650)return"#ff4444"; return"#c8d8f0"; };
  const eraColor  = v => { const n=parseFloat(v); if(n<=3.00)return"#00ff88"; if(n>=5.00)return"#ff4444"; return"#c8d8f0"; };
  const k9Color   = v => { const n=parseFloat(v); if(n>=9.5)return"#00ff88"; if(n<=6.0)return"#ff4444"; return"#c8d8f0"; };
  const whipColor = v => { const n=parseFloat(v); if(n<=1.10)return"#00ff88"; if(n>=1.50)return"#ff4444"; return"#c8d8f0"; };

  const C2 = "#f97316";
  const TH = ({children, left}) => (
    <th style={{padding:"6px 10px",fontSize:9,color:"#3a5070",letterSpacing:1,fontFamily:"'Orbitron',monospace",textAlign:left?"left":"center",borderRight:"1px solid #0a1828",whiteSpace:"nowrap",background:"#050d18",position:"sticky",top:0,zIndex:1}}>
      {children}
    </th>
  );
  const TD = ({val, color, bold, bg}) => (
    <td style={{padding:"6px 10px",textAlign:"center",fontSize:12,color:color||"#8a9ab0",fontFamily:"'Orbitron',monospace",fontWeight:bold?"bold":"normal",borderRight:"1px solid #0a1828",whiteSpace:"nowrap",background:bg||"transparent"}}>
      {val}
    </td>
  );
  const TDL = ({val, color}) => (
    <td style={{padding:"6px 10px",textAlign:"left",fontSize:12,color:color||"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",borderRight:"1px solid #0a1828",whiteSpace:"nowrap"}}>
      {val}
    </td>
  );

  const PitcherTable = ({ pitcher, oppTeam }) => {
    if (!pitcher) return null;
    const handColor = pitcher.hand==="L"?"#38bdf8":"#f97316";
    return (
      <div style={{background:"#0a1220",border:`1px solid ${C2}20`,borderRadius:4,overflow:"hidden",marginBottom:12}}>
        {/* Pitcher header */}
        <div style={{padding:"10px 14px",background:`${C2}08`,borderBottom:`1px solid ${C2}15`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:`${handColor}20`,border:`1px solid ${handColor}40`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:"bold",color:handColor,fontFamily:"'Orbitron',monospace"}}>{pitcher.hand}</span>
          </div>
          <div>
            <div style={{fontSize:14,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{pitcher.name}</div>
            <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{pitcher.side === "Away" ? `${pitcher.side} SP` : `${pitcher.side} SP`} · {pitcher.wl} W-L · {pitcher.ip} IP</div>
          </div>
          <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
            {[{label:"ERA",val:pitcher.era,color:eraColor(pitcher.era)},{label:"WHIP",val:pitcher.whip,color:whipColor(pitcher.whip)},{label:"K/9",val:pitcher.k9,color:k9Color(pitcher.k9)},{label:"BB/9",val:pitcher.bb9}].map(({label,val,color})=>(
              <div key={label} style={{textAlign:"center",background:"#050d18",border:"1px solid #0a1828",borderRadius:3,padding:"4px 10px"}}>
                <div style={{fontSize:8,color:"#3a5070",fontFamily:"'Orbitron',monospace",marginBottom:2}}>{label}</div>
                <div style={{fontSize:14,fontWeight:"bold",color:color||"#c8d8f0",fontFamily:"'Orbitron',monospace"}}>{val}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Splits table */}
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#050d18"}}>
              <TH left>SPLIT</TH>
              <TH>AB</TH>
              <TH>AVG</TH>
              <TH>OPS</TH>
              <TH>HR</TH>
              <TH>K</TH>
            </tr>
          </thead>
          <tbody>
            {[
              {label:"vs LHB", avg:pitcher.avgVsL, ops:pitcher.opsVsL, hr:pitcher.hrVsL, k:pitcher.kVsL, ab:pitcher.abVsL},
              {label:"vs RHB", avg:pitcher.avgVsR, ops:pitcher.opsVsR, hr:pitcher.hrVsR, k:pitcher.kVsR, ab:pitcher.abVsR},
            ].map((row,i)=>(
              <tr key={i} style={{borderBottom:"1px solid #0a1828"}}>
                <td style={{padding:"7px 10px",fontSize:11,color:"#4a6080",fontFamily:"'Orbitron',monospace",borderRight:"1px solid #0a1828",letterSpacing:1}}>{row.label}</td>
                <TD val={row.ab||"—"}/>
                <TD val={row.avg} color={avgColor(row.avg)} bold={parseFloat(row.avg)>=0.280||parseFloat(row.avg)<=0.210}/>
                <TD val={row.ops} color={opsColor(row.ops)} bold={parseFloat(row.ops)>=0.850||parseFloat(row.ops)<=0.650}/>
                <TD val={row.hr} color={row.hr>=3?"#ff4444":undefined}/>
                <TD val={row.k}/>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const BatterTable = ({ batters, pitcherHand, confirmed, teamName, sortBy, setSortBy, sortDir, setSortDir }) => {
    if (!batters.length) return <div style={{padding:20,textAlign:"center",color:"#2a3a55",fontSize:12,fontFamily:"'Inter',sans-serif"}}>No batter data available</div>;
    const vsLabel    = pitcherHand==="L" ? "vs LHP" : "vs RHP";
    const splitColor = pitcherHand==="L" ? "#38bdf8" : "#f97316";

    const getVal = (b, key) => {
      const map = {
        order: b.order,
        seasonAvg: parseFloat(b.seasonAvg)||0, seasonHR: b.seasonHR||0, seasonOPS: parseFloat(b.seasonOPS)||0,
        seasonISO: parseFloat(b.seasonISO)||0,
        hardHit: parseFloat(b.hardHit)||0, barrel: parseFloat(b.barrel)||0,
        xBA: parseFloat(b.xBA)||0, xSLG: parseFloat(b.xSLG)||0,
        avgEV: parseFloat(b.avgEV)||0,
        last7Avg: parseFloat(b.last7Avg)||0, last7HR: b.last7HR||0, last7OPS: parseFloat(b.last7OPS)||0,
        splitAvg: parseFloat(pitcherHand==="L"?b.avgVsL:b.avgVsR)||0,
        splitOPS: parseFloat(pitcherHand==="L"?b.opsVsL:b.opsVsR)||0,
        splitISO: parseFloat(pitcherHand==="L"?b.isoVsL:b.isoVsR)||0,
        splitHR:  pitcherHand==="L"?b.hrVsL:b.hrVsR||0,
      };
      return map[key]??0;
    };

    const sorted = [...batters].sort((a,b)=>{
      const av = getVal(a,sortBy), bv = getVal(b,sortBy);
      return sortDir==="asc" ? av-bv : bv-av;
    });

    const SortTH = ({label, field, color, last}) => {
      const active = sortBy===field;
      const c = color||(active?C:"#3a5070");
      return (
        <th onClick={()=>{ if(sortBy===field) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortBy(field);setSortDir("desc");} }}
          style={{padding:"6px 10px",fontSize:9,color:active?c:"#3a5070",letterSpacing:1,fontFamily:"'Orbitron',monospace",textAlign:"center",borderRight:last?"none":"1px solid #0a1828",background:active?"#0d1828":"#050d18",whiteSpace:"nowrap",cursor:"pointer",userSelect:"none",transition:"all 0.15s"}}>
          {label} {active?(sortDir==="desc"?"▼":"▲"):""}
        </th>
      );
    };

    const isoColor = v => { const n=parseFloat(v); if(n>=0.200)return"#00ff88"; if(n<=0.100)return"#ff4444"; return"#c8d8f0"; };
    const hhColor  = v => { const n=parseFloat(v); if(n>=45)return"#00ff88"; if(n<=30)return"#ff4444"; return"#c8d8f0"; };
    const brColor  = v => { const n=parseFloat(v); if(n>=12)return"#00ff88"; if(n<=5)return"#ff4444"; return"#c8d8f0"; };

    return (
      <div style={{background:"#0a1220",border:"1px solid #0a1828",borderRadius:4,overflow:"hidden",marginBottom:12}}>
        <div style={{padding:"8px 14px",background:"#050d18",borderBottom:"1px solid #0a1828",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{fontSize:11,color:"#c8d8f0",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>{teamName.toUpperCase()}</div>
          {confirmed
            ? <span style={{fontSize:9,color:"#00ff88",background:"#00ff8815",border:"1px solid #00ff8830",padding:"2px 8px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>✓ CONFIRMED LINEUP</span>
            : <span style={{fontSize:9,color:"#fbbf24",background:"#fbbf2415",border:"1px solid #fbbf2430",padding:"2px 8px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>PROJECTED</span>
          }
          <div style={{marginLeft:"auto",fontSize:10,color:splitColor,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>FACING {pitcherHand==="L"?"LHP":"RHP"}</div>
          <div style={{fontSize:9,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>Click column headers to sort</div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
            <thead>
              <tr>
                <SortTH label="#"         field="order"/>
                <th style={{padding:"6px 10px",fontSize:9,color:"#3a5070",letterSpacing:1,fontFamily:"'Orbitron',monospace",textAlign:"left",borderRight:"1px solid #0a1828",background:"#050d18",whiteSpace:"nowrap",minWidth:130}}>BATTER</th>
                <TH>B</TH>
                <SortTH label="SZN AVG"   field="seasonAvg"/>
                <SortTH label="SZN HR"    field="seasonHR"/>
                <SortTH label="SZN OPS"   field="seasonOPS"/>
                <SortTH label="ISO"       field="seasonISO"/>
                <SortTH label="HARD HIT%" field="hardHit"/>
                <SortTH label="BARREL%"   field="barrel"/>
                <SortTH label="xBA"       field="xBA"/>
                <SortTH label="xSLG"      field="xSLG"/>
                <SortTH label="EV"        field="avgEV"/>
                <SortTH label="L7 AVG"    field="last7Avg"/>
                <SortTH label="L7 HR"     field="last7HR"/>
                <SortTH label="L7 OPS"    field="last7OPS"/>
                <th style={{padding:"6px 10px",fontSize:9,color:splitColor,letterSpacing:1,fontFamily:"'Orbitron',monospace",textAlign:"center",borderLeft:"2px solid #1a2a40",borderRight:"1px solid #0a1828",background:"#060e1a",whiteSpace:"nowrap",minWidth:4}}/>
                <SortTH label={`${vsLabel} AVG`} field="splitAvg" color={splitColor}/>
                <SortTH label={`${vsLabel} OPS`} field="splitOPS" color={splitColor}/>
                <SortTH label={`${vsLabel} ISO`} field="splitISO" color={splitColor}/>
                <SortTH label={`${vsLabel} HR`}  field="splitHR"  color={splitColor} last/>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b,i)=>{
                const splitAvg = pitcherHand==="L" ? b.avgVsL : b.avgVsR;
                const splitOPS = pitcherHand==="L" ? b.opsVsL : b.opsVsR;
                const splitISO = pitcherHand==="L" ? b.isoVsL : b.isoVsR;
                const splitHR  = pitcherHand==="L" ? b.hrVsL  : b.hrVsR;
                const handColor = b.hand==="L"?"#38bdf8":b.hand==="R"?"#f97316":"#8a9ab0";
                const rowBg = i%2===0?"transparent":"#050d1890";
                return (
                  <tr key={i} style={{borderBottom:"1px solid #0a1828",background:rowBg}}>
                    <td style={{padding:"7px 10px",fontSize:11,color:"#3a5070",fontFamily:"'Orbitron',monospace",borderRight:"1px solid #0a1828",textAlign:"center"}}>{b.order}</td>
                    <td style={{padding:"7px 10px",fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",borderRight:"1px solid #0a1828",whiteSpace:"nowrap"}}>
                      {b.name}<span style={{fontSize:9,color:"#3a5070",marginLeft:6}}>{b.pos}</span>
                    </td>
                    <td style={{padding:"7px 10px",textAlign:"center",borderRight:"1px solid #0a1828"}}>
                      <span style={{fontSize:10,fontWeight:"bold",color:handColor,fontFamily:"'Orbitron',monospace"}}>{b.hand}</span>
                    </td>
                    <TD val={b.seasonAvg} color={avgColor(b.seasonAvg)}/>
                    <TD val={b.seasonHR}/>
                    <TD val={b.seasonOPS} color={opsColor(b.seasonOPS)}/>
                    <TD val={b.seasonISO} color={isoColor(b.seasonISO)}/>
                    <TD val={b.hardHit}   color={hhColor(b.hardHit)}/>
                    <TD val={b.barrel}    color={brColor(b.barrel)}/>
                    <TD val={b.xBA}       color={avgColor(b.xBA)}/>
                    <TD val={b.xSLG}      color={opsColor(b.xSLG)}/>
                    <TD val={b.avgEV}     color={parseFloat(b.avgEV)>=92?"#00ff88":parseFloat(b.avgEV)<=85?"#ff4444":"#c8d8f0"}/>
                    <TD val={b.last7Avg}  color={avgColor(b.last7Avg)} bold={parseFloat(b.last7Avg)>=0.300} bg={parseFloat(b.last7Avg)>=0.350?"#00ff8815":parseFloat(b.last7Avg)<=0.150?"#ff444415":undefined}/>
                    <TD val={b.last7HR}   color={b.last7HR>=2?"#f97316":undefined} bold={b.last7HR>=2}/>
                    <TD val={b.last7OPS}  color={opsColor(b.last7OPS)} bold={parseFloat(b.last7OPS)>=0.900}/>
                    {/* Split divider */}
                    <td style={{padding:0,borderLeft:"2px solid #1a2a40",background:"#060e1a",width:4}}/>
                    <TD val={splitAvg} color={avgColor(splitAvg)} bold={parseFloat(splitAvg)>=0.280} bg={parseFloat(splitAvg)>=0.300?"#00ff8808":parseFloat(splitAvg)<=0.200?"#ff444408":undefined}/>
                    <TD val={splitOPS} color={opsColor(splitOPS)} bold={parseFloat(splitOPS)>=0.850} bg={parseFloat(splitOPS)>=0.900?"#00ff8808":parseFloat(splitOPS)<=0.650?"#ff444408":undefined}/>
                    <TD val={splitISO} color={isoColor(splitISO)}/>
                    <TD val={splitHR} color={splitHR>=3?"#f97316":undefined} bold={splitHR>=3}/>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Header */}
      <div style={{flexShrink:0,padding:"12px 20px",borderBottom:"1px solid #0a1828",background:"#02040a",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
        <div>
          <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>MLB Cheat Sheet</div>
          <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>Pitcher ERA/WHIP/K9 · vs LHB/RHB splits · Batter splits vs LHP/RHP · Confirmed lineups</div>
        </div>
        <button onClick={load} disabled={loading||gamesLoading||!games.length}
          style={{padding:"10px 20px",background:loading||!games.length?"#0a1220":`${C}15`,border:`1px solid ${loading||!games.length?"#1a2a40":C+"40"}`,borderRadius:3,color:loading||!games.length?"#2a3a5a":C,fontSize:10,cursor:loading||!games.length?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2,whiteSpace:"nowrap",flexShrink:0}}>
          {loading?"LOADING···":sheets.length?"🔄 REFRESH":"📋 LOAD CHEAT SHEET"}
        </button>
      </div>

      {loading && (
        <div style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:14,color:C,letterSpacing:4,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace",marginBottom:12}}>LOADING CHEAT SHEET···</div>
          <div style={{fontSize:12,color:"#38bdf8",fontFamily:"'Inter',sans-serif"}}>{status}</div>
          <div style={{fontSize:11,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginTop:8}}>Fetching pitcher splits, batter splits vs LHP/RHP for all games</div>
        </div>
      )}

      {!loading && !sheets.length && (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
          <div style={{fontSize:32}}>📋</div>
          <div style={{fontSize:13,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{games.length} games today</div>
          <div style={{fontSize:11,color:"#1a2a4a",fontFamily:"'Inter',sans-serif",textAlign:"center",lineHeight:1.8}}>
            Click LOAD CHEAT SHEET to fetch:<br/>
            ✓ Pitcher season stats + vs LHB/RHB splits<br/>
            ✓ Confirmed lineups (or projected rosters)<br/>
            ✓ Each batter's splits vs LHP and RHP
          </div>
        </div>
      )}

      {!loading && sheets.length > 0 && (
        <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
          {/* Game selector sidebar */}
          <div style={{width:180,flexShrink:0,borderRight:"1px solid #0a1828",overflowY:"auto",scrollbarWidth:"thin"}}>
            {sheets.map((s,i)=>(
              <div key={s.gamePk} onClick={()=>{ setSelectedGame(s); setAwaySortBy("order"); setAwaySortDir("asc"); setHomeSortBy("order"); setHomeSortDir("asc"); }}
                style={{padding:"10px 12px",borderBottom:"1px solid #0a1828",cursor:"pointer",transition:"all 0.15s",background:selectedGame?.gamePk===s.gamePk?`${C}12`:"transparent",borderLeft:`3px solid ${selectedGame?.gamePk===s.gamePk?C:"transparent"}`}}
                onMouseEnter={e=>{if(selectedGame?.gamePk!==s.gamePk)e.currentTarget.style.background="#0a1220";}}
                onMouseLeave={e=>{if(selectedGame?.gamePk!==s.gamePk)e.currentTarget.style.background="transparent";}}>
                <div style={{fontSize:12,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500",marginBottom:2}}>{s.awayAbbr} @ {s.homeAbbr}</div>
                <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{s.gameTime}</div>
                {s.venue&&<div style={{fontSize:9,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginTop:2}}>{s.venue}</div>}
                <div style={{display:"flex",gap:4,marginTop:4}}>
                  {s.awayLineupConfirmed&&<span style={{fontSize:7,color:"#00ff88",background:"#00ff8815",padding:"1px 4px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>✓ LINE</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Main cheat sheet */}
          {selectedGame && (
            <div style={{flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
              {/* Game header */}
              <div style={{background:"linear-gradient(90deg,#0a1220,#060c18)",border:`1px solid ${C}20`,borderRadius:4,padding:"12px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Orbitron',monospace",letterSpacing:2,marginBottom:4}}>AWAY</div>
                  <div style={{fontSize:20,fontWeight:"900",color:"#c8d8f0",fontFamily:"'Orbitron',monospace",letterSpacing:3}}>{selectedGame.awayAbbr}</div>
                  <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{selectedGame.awayTeam}</div>
                </div>
                <div style={{textAlign:"center",padding:"0 24px"}}>
                  <div style={{fontSize:14,color:C,fontFamily:"'Orbitron',monospace",letterSpacing:2,marginBottom:4}}>{selectedGame.gameTime}</div>
                  <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginBottom:4}}>{selectedGame.venue}</div>
                  {selectedGame.park && (
                    <div style={{marginBottom:4}}>
                      <span style={{fontSize:9,color:selectedGame.park.hr>=110?"#f97316":selectedGame.park.hr<=90?"#38bdf8":"#8a9ab0",background:selectedGame.park.hr>=110?"#f9731615":selectedGame.park.hr<=90?"#38bdf815":"#0a1220",border:`1px solid ${selectedGame.park.hr>=110?"#f9731630":selectedGame.park.hr<=90?"#38bdf830":"#1a2a40"}`,padding:"2px 8px",borderRadius:2,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>
                        {selectedGame.park.flag} · HR Factor: {selectedGame.park.hr}
                      </span>
                    </div>
                  )}
                  <div style={{fontSize:9,color:selectedGame.status==="Live"?"#00ff88":"#2a3a55",fontFamily:"'Orbitron',monospace",letterSpacing:2}}>{selectedGame.status==="Live"?"🔴 LIVE":selectedGame.status==="Final"?"FINAL":"SCHEDULED"}</div>
                </div>
                <div style={{textAlign:"center",flex:1}}>
                  <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Orbitron',monospace",letterSpacing:2,marginBottom:4}}>HOME</div>
                  <div style={{fontSize:20,fontWeight:"900",color:"#c8d8f0",fontFamily:"'Orbitron',monospace",letterSpacing:3}}>{selectedGame.homeAbbr}</div>
                  <div style={{fontSize:11,color:"#4a6080",fontFamily:"'Inter',sans-serif"}}>{selectedGame.homeTeam}</div>
                </div>
              </div>

              {/* Pitchers side by side */}
              <div style={{fontSize:9,color:`${C}80`,letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:8}}>⚾ STARTING PITCHERS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                <PitcherTable pitcher={selectedGame.awayPitcher} oppTeam={selectedGame.homeTeam}/>
                <PitcherTable pitcher={selectedGame.homePitcher} oppTeam={selectedGame.awayTeam}/>
              </div>

              {/* Batters */}
              <div style={{fontSize:9,color:`${C}80`,letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:8}}>🏏 BATTER SPLITS</div>
              <BatterTable
                batters={selectedGame.awayBatters}
                pitcherHand={selectedGame.homePitcher?.hand||"R"}
                confirmed={selectedGame.awayLineupConfirmed}
                teamName={selectedGame.awayTeam}
                sortBy={awaySortBy} setSortBy={setAwaySortBy}
                sortDir={awaySortDir} setSortDir={setAwaySortDir}
              />
              <BatterTable
                batters={selectedGame.homeBatters}
                pitcherHand={selectedGame.awayPitcher?.hand||"R"}
                confirmed={selectedGame.homeLineupConfirmed}
                teamName={selectedGame.homeTeam}
                sortBy={homeSortBy} setSortBy={setHomeSortBy}
                sortDir={homeSortDir} setSortDir={setHomeSortDir}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sports Tab (MLB + NBA combined) ──────────────────────────────────────────
function SportsTab() {
  const [sport, setSport]           = useState("MLB");
  const [section, setSection]       = useState("TODAY");

  // MLB state
  const [mlbGames, setMlbGames]     = useState([]);
  const [mlbLoading, setMlbLoading] = useState(false);
  const [selectedMlbGame, setSelectedMlbGame] = useState(null);
  const [mlbAiInsight, setMlbAiInsight] = useState("");
  const [mlbAiLoading, setMlbAiLoading] = useState(false);
  const [mlbProps, setMlbProps]     = useState([]);
  const [mlbPropsLoading, setMlbPropsLoading] = useState(false);

  // NBA state
  const [nbaGames, setNbaGames]     = useState([]);
  const [nbaLoading, setNbaLoading] = useState(false);
  const [selectedNbaGame, setSelectedNbaGame] = useState(null);
  const [nbaAiInsight, setNbaAiInsight] = useState("");
  const [nbaAiLoading, setNbaAiLoading] = useState(false);
  const [nbaProps, setNbaProps]     = useState([]);
  const [nbaB2B, setNbaB2B]         = useState({});
  const [nbaPropsLoading, setNbaPropsLoading] = useState(false);

  const MLB_C = "#f97316";
  const NBA_C = "#e11d48";
  const C = sport === "MLB" ? MLB_C : NBA_C;
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (sport === "MLB") fetchMlbGames();
    else fetchNbaGames();
  }, [sport]);

  // ── MLB Fetches ──
  const fetchMlbGames = async () => {
    setMlbLoading(true);
    try {
      const r = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=probablePitcher(stats),team`);
      const d = await r.json();
      setMlbGames(d.dates?.[0]?.games || []);
    } catch { setMlbGames([]); }
    setMlbLoading(false);
  };

  const fetchMlbProps = async () => {
    setMlbPropsLoading(true);
    try {
      const r = await fetch(`/api/odds?sport=baseball_mlb&market=batter_hits,batter_home_runs,batter_total_bases`);
      const d = await r.json();
      setMlbProps(Array.isArray(d) ? d : []);
    } catch { setMlbProps([]); }
    setMlbPropsLoading(false);
  };

  const getMlbAiInsight = async (game) => {
    setMlbAiLoading(true); setMlbAiInsight("");
    const away = game.teams?.away;
    const home = game.teams?.home;
    const prompt = `You are an elite baseball prop betting analyst. Give a concise prop breakdown for:
${away?.team?.name} (SP: ${away?.probablePitcher?.fullName||"TBD"}) @ ${home?.team?.name} (SP: ${home?.probablePitcher?.fullName||"TBD"})

Provide: Top 3 player props you like, best strikeout prop, best over/under total, one contrarian pick. Be specific and concise.`;
    try {
      const res = await fetch('/api/claude', { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:600, system:"You are an expert baseball analyst and prop betting specialist.", messages:[{role:"user",content:prompt}] }) });
      const data = await res.json();
      setMlbAiInsight(data.content?.map(b=>b.text||"").join("")||"No response.");
    } catch { setMlbAiInsight("Connection error."); }
    setMlbAiLoading(false);
  };

  // ── NBA Fetches ──
  const fetchNbaGames = async () => {
    setNbaLoading(true);
    try {
      const [scoreRes, b2bRes] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today.replace(/-/g,"")}`),
        fetch(`/api/statcast?type=b2b`),
      ]);
      const [scoreData, b2bData] = await Promise.all([scoreRes.json(), b2bRes.json()]);
      setNbaGames(scoreData.events || []);
      setNbaB2B(b2bData?.b2bTeams || {});
    } catch { setNbaGames([]); }
    setNbaLoading(false);
  };

  const fetchNbaProps = async () => {
    setNbaPropsLoading(true);
    try {
      const r = await fetch(`/api/odds?sport=basketball_nba&market=player_points,player_rebounds,player_assists`);
      const d = await r.json();
      setNbaProps(Array.isArray(d) ? d : []);
    } catch { setNbaProps([]); }
    setNbaPropsLoading(false);
  };

  const getNbaAiInsight = async (game) => {
    setNbaAiLoading(true); setNbaAiInsight("");
    const comp = game.competitions?.[0];
    const away = comp?.competitors?.find(c=>c.homeAway==="away");
    const home = comp?.competitors?.find(c=>c.homeAway==="home");
    const prompt = `You are an elite NBA prop betting analyst. Give a prop breakdown for:
${away?.team?.displayName||"Away"} (${away?.records?.[0]?.summary||""}) @ ${home?.team?.displayName||"Home"} (${home?.records?.[0]?.summary||""})

Provide: Top 3 player props you like (pts/reb/ast/3PM/PRA), best scorer to target, best defensive fade, game total pick, one longshot. Be specific.`;
    try {
      const res = await fetch('/api/claude', { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:700, system:"You are an expert NBA analyst and prop betting specialist.", messages:[{role:"user",content:prompt}] }) });
      const data = await res.json();
      setNbaAiInsight(data.content?.map(b=>b.text||"").join("")||"No response.");
    } catch { setNbaAiInsight("Connection error."); }
    setNbaAiLoading(false);
  };

  const games    = sport==="MLB" ? mlbGames    : nbaGames;
  const loading  = sport==="MLB" ? mlbLoading  : nbaLoading;
  const props    = sport==="MLB" ? mlbProps    : nbaProps;
  const propsLoading = sport==="MLB" ? mlbPropsLoading : nbaPropsLoading;

  const StatBadge = ({label,val,color="#c8d8f0"}) => (
    <div style={{textAlign:"center",background:"#050d18",border:"1px solid #0d2040",borderRadius:3,padding:"6px 10px",minWidth:52}}>
      <div style={{fontSize:8,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginBottom:2}}>{label}</div>
      <div style={{fontSize:13,fontWeight:"bold",color,fontFamily:"'Orbitron',monospace"}}>{val||"—"}</div>
    </div>
  );

  const PitcherCard = ({pitcher, side}) => {
    if (!pitcher) return <div style={{flex:1,background:"#0a1220",border:"1px solid #0d2040",borderRadius:3,padding:10,textAlign:"center"}}><div style={{fontSize:10,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>TBD</div></div>;
    const stats = pitcher.stats?.[0]?.stats || {};
    return (
      <div style={{flex:1,background:"#0a1220",border:`1px solid ${C}20`,borderRadius:3,padding:10}}>
        <div style={{fontSize:8,color:C,letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:4}}>{side} SP</div>
        <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600",marginBottom:6}}>{pitcher.fullName}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <StatBadge label="ERA"  val={stats.era}/>
          <StatBadge label="WHIP" val={stats.whip}/>
          <StatBadge label="K/9"  val={stats.strikeoutsPer9Inn} color="#c084fc"/>
          <StatBadge label="W-L"  val={stats.wins!=null?`${stats.wins}-${stats.losses}`:null}/>
        </div>
      </div>
    );
  };

  const PropsPanel = ({propsList, propLoading, color}) => (
    <div style={{flex:1,overflowY:"auto",padding:20,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
      {propLoading&&<div style={{padding:30,textAlign:"center",color,letterSpacing:4,fontSize:12,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>LOADING PROPS...</div>}
      {!propLoading&&propsList.length===0&&<div style={{textAlign:"center",padding:40}}><div style={{fontSize:13,color:"#2a3a55",fontFamily:"'Inter',sans-serif",marginBottom:8}}>No props available right now.</div><div style={{fontSize:11,color:"#1a2a4a",fontFamily:"'Inter',sans-serif"}}>Props are typically available a few hours before game time.</div></div>}
      {propsList.map((game,i)=>(
        <div key={game.id||i} style={{background:"#0a1220",border:`1px solid ${color}15`,borderRadius:4,padding:14,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{game.away_team} @ {game.home_team}</div>
            <div style={{fontSize:9,color:"#3a5070",fontFamily:"'Orbitron',monospace"}}>{new Date(game.commence_time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
          </div>
          {game.bookmakers?.slice(0,1).map(bm=>(
            <div key={bm.key}>
              {bm.markets?.map(mkt=>(
                <div key={mkt.key} style={{marginBottom:8}}>
                  <div style={{fontSize:8,color:`${color}70`,letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:6}}>{mkt.key.replace("batter_","").replace("player_","").replace(/_/g," ").toUpperCase()}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {mkt.outcomes?.slice(0,8).map((o,j)=>(
                      <div key={j} style={{background:"#050d18",border:`1px solid ${o.name==="Over"?"#00ff8825":"#ff444425"}`,borderRadius:3,padding:"6px 10px",minWidth:90}}>
                        <div style={{fontSize:10,color:"#4a6080",fontFamily:"'Inter',sans-serif",marginBottom:2}}>{o.description||o.name}</div>
                        <div style={{fontSize:11,color:o.name==="Over"?"#00ff88":"#ff4444",fontFamily:"'Orbitron',monospace"}}>{o.name} {o.point} <span style={{fontSize:9}}>{o.price>0?"+":""}{o.price}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:"#010308",overflow:"hidden",animation:"fadeUp 0.4s ease"}}>

      {/* Header with sport selector */}
      <div style={{flexShrink:0,padding:"10px 20px",borderBottom:"1px solid #0a1828",background:"linear-gradient(90deg,#02040a,#100808)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:9,letterSpacing:4,color:`${C}60`,fontFamily:"'Orbitron',monospace",marginBottom:2}}>🏟️ SPORTS MODULE</div>
          <div style={{fontSize:18,fontWeight:"900",letterSpacing:3,color:C,fontFamily:"'Orbitron',monospace",textShadow:`0 0 20px ${C}40`}}>PROP COMMAND</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Sport toggle */}
          <div style={{display:"flex",background:"#0a1220",border:"1px solid #1a2a40",borderRadius:4,overflow:"hidden"}}>
            {[{id:"MLB",icon:"⚾",color:MLB_C},{id:"NBA",icon:"🏀",color:NBA_C}].map(s=>(
              <button key={s.id} onClick={()=>{setSport(s.id);setSection("TODAY");}} style={{padding:"8px 20px",background:sport===s.id?`${s.color}20`:"transparent",border:"none",borderRight:s.id==="MLB"?"1px solid #1a2a40":"none",color:sport===s.id?s.color:"#3a5070",cursor:"pointer",fontFamily:"'Orbitron',monospace",fontSize:11,letterSpacing:2,transition:"all 0.2s",display:"flex",alignItems:"center",gap:6}}>
                <span>{s.icon}</span><span>{s.id}</span>
              </button>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:8,color:"#3a5070",letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:2}}>TODAY</div>
            <div style={{fontSize:16,fontWeight:"bold",color:C,fontFamily:"'Orbitron',monospace"}}>{games.length} GAMES</div>
          </div>
          <button onClick={()=>sport==="MLB"?fetchMlbGames():fetchNbaGames()} style={{padding:"6px 14px",background:`${C}15`,border:`1px solid ${C}40`,borderRadius:3,color:C,fontSize:9,cursor:"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:1}}>↻ REFRESH</button>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{flexShrink:0,display:"flex",borderBottom:"1px solid #0a1828",background:"#02040a"}}>
        {(sport==="MLB" ? ["TODAY","PROPS","TOP PICKS","CHEAT SHEET"] : ["TODAY","PROPS","TOP PICKS"]).map(s=>(
          <button key={s} onClick={()=>{setSection(s);if(s==="PROPS"){sport==="MLB"?fetchMlbProps():fetchNbaProps();}}} style={{flex:1,padding:"10px",fontSize:9,letterSpacing:3,cursor:"pointer",background:section===s?`${C}10`:"transparent",border:"none",borderBottom:section===s?`2px solid ${C}`:"2px solid transparent",color:section===s?C:"#2a3a5a",fontFamily:"'Orbitron',monospace",transition:"all 0.2s"}}>
            {s}
          </button>
        ))}
      </div>

      <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>

        {/* ── TODAY — MLB ── */}
        {section==="TODAY" && sport==="MLB" && (
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{width:"42%",borderRight:"1px solid #0a1828",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
              {mlbLoading&&<div style={{padding:30,textAlign:"center",color:C,letterSpacing:4,fontSize:12,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>LOADING GAMES...</div>}
              {!mlbLoading&&mlbGames.length===0&&<div style={{padding:30,textAlign:"center",color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No MLB games today.</div>}
              {mlbGames.map((game,i)=>{
                const away=game.teams?.away; const home=game.teams?.home;
                const isSelected=selectedMlbGame?.gamePk===game.gamePk;
                const status=game.status?.abstractGameState;
                const gameTime=new Date(game.gameDate).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
                return (
                  <div key={game.gamePk} onClick={()=>{setSelectedMlbGame(game);setMlbAiInsight("");}}
                    style={{padding:"12px 14px",borderBottom:"1px solid #0a1828",cursor:"pointer",transition:"all 0.15s",background:isSelected?`${C}08`:"transparent",borderLeft:`3px solid ${isSelected?C:"transparent"}`}}
                    onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#0a1220";}}
                    onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="transparent";}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontSize:9,color:status==="Live"?"#00ff88":status==="Final"?"#555":C,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{status==="Live"?"🔴 LIVE":status==="Final"?"FINAL":gameTime}</span>
                      {game.venue?.name&&<span style={{fontSize:8,color:"#2a3a55",fontFamily:"'Inter',sans-serif"}}>{game.venue.name}</span>}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{away?.team?.abbreviation} <span style={{fontSize:10,color:"#4a6080"}}>({away?.team?.name})</span></div>
                        <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginTop:2}}>SP: {away?.probablePitcher?.fullName||"TBD"}</div>
                      </div>
                      <div style={{fontSize:11,color:"#3a5070",fontFamily:"'Orbitron',monospace"}}>@</div>
                      <div style={{flex:1,textAlign:"right"}}>
                        <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{home?.team?.abbreviation} <span style={{fontSize:10,color:"#4a6080"}}>({home?.team?.name})</span></div>
                        <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif",marginTop:2}}>SP: {home?.probablePitcher?.fullName||"TBD"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {!selectedMlbGame?(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:20}}><div><div style={{fontSize:32,marginBottom:12}}>⚾</div><div style={{color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>Select a game to see pitcher details<br/>and get AI prop analysis</div></div></div>
              ):(
                <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  <div style={{flexShrink:0,padding:14,borderBottom:"1px solid #0a1828",background:"#02040a"}}>
                    <div style={{fontSize:9,color:`${C}60`,letterSpacing:3,fontFamily:"'Orbitron',monospace",marginBottom:10}}>PITCHER MATCHUP</div>
                    <div style={{display:"flex",gap:10,marginBottom:12}}>
                      <PitcherCard pitcher={selectedMlbGame.teams?.away?.probablePitcher} side="AWAY"/>
                      <div style={{display:"flex",alignItems:"center",fontSize:16,color:"#2a3a55",fontFamily:"'Orbitron',monospace",flexShrink:0}}>VS</div>
                      <PitcherCard pitcher={selectedMlbGame.teams?.home?.probablePitcher} side="HOME"/>
                    </div>
                    <button onClick={()=>getMlbAiInsight(selectedMlbGame)} disabled={mlbAiLoading} style={{width:"100%",padding:"10px",background:mlbAiLoading?"#0a1220":`${C}15`,border:`1px solid ${mlbAiLoading?"#1a2a40":C+"40"}`,borderRadius:3,color:mlbAiLoading?"#2a3a5a":C,fontSize:10,cursor:mlbAiLoading?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2,transition:"all 0.2s"}}>
                      {mlbAiLoading?"ANALYZING···":"🤖 GET AI PROP ANALYSIS"}
                    </button>
                  </div>
                  <div style={{flex:1,overflowY:"auto",padding:14,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
                    {mlbAiLoading?<div style={{textAlign:"center",padding:30,color:C,letterSpacing:4,fontSize:14,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>ANALYZING MATCHUP···</div>
                    :mlbAiInsight?(
                      <div>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                          <div style={{fontSize:9,color:C,letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>🤖 AI PROP ANALYSIS</div>
                          <button onClick={()=>navigator.clipboard?.writeText(mlbAiInsight)} style={{fontSize:9,color:"#3a5070",background:"#0d1828",border:"1px solid #1a2a40",borderRadius:2,cursor:"pointer",padding:"3px 10px",fontFamily:"'Orbitron',monospace"}}>COPY</button>
                        </div>
                        <div style={{fontSize:13,color:"#b0c4d8",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"'Inter',sans-serif"}}>{mlbAiInsight}</div>
                      </div>
                    ):<div style={{color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:12,textAlign:"center",padding:20}}>Click "GET AI PROP ANALYSIS" for today's best prop picks for this matchup</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TODAY — NBA ── */}
        {section==="TODAY" && sport==="NBA" && (
          <div style={{flex:1,display:"flex",minHeight:0,overflow:"hidden"}}>
            <div style={{width:"40%",borderRight:"1px solid #0a1828",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
              {nbaLoading&&<div style={{padding:30,textAlign:"center",color:NBA_C,letterSpacing:4,fontSize:12,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>LOADING GAMES...</div>}
              {!nbaLoading&&nbaGames.length===0&&<div style={{padding:30,textAlign:"center",color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>No NBA games today.</div>}
              {nbaGames.map((game,i)=>{
                const comp=game.competitions?.[0];
                const away=comp?.competitors?.find(c=>c.homeAway==="away");
                const home=comp?.competitors?.find(c=>c.homeAway==="home");
                const isSelected=selectedNbaGame?.id===game.id;
                const isLive=comp?.status?.type?.state==="in";
                const isFinal=comp?.status?.type?.state==="post";
                const gameTime=comp?.date?new Date(comp.date).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"";
                return (
                  <div key={game.id} onClick={()=>{setSelectedNbaGame(game);setNbaAiInsight("");}}
                    style={{padding:"12px 14px",borderBottom:"1px solid #0a1828",cursor:"pointer",transition:"all 0.15s",background:isSelected?`${NBA_C}08`:"transparent",borderLeft:`3px solid ${isSelected?NBA_C:"transparent"}`}}
                    onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#0a1220";}}
                    onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="transparent";}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <span style={{fontSize:9,color:isLive?"#00ff88":isFinal?"#555":NBA_C,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{isLive?"🔴 LIVE":isFinal?"FINAL":gameTime}</span>
                      {isLive&&<span style={{fontSize:9,color:"#00ff88",fontFamily:"'Orbitron',monospace"}}>{comp?.status?.displayClock} · Q{comp?.status?.period}</span>}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                          {away?.team?.logo&&<img src={away.team.logo} style={{width:20,height:20,objectFit:"contain"}} alt=""/>}
                          <span style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{away?.team?.abbreviation}</span>
                          <span style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{away?.records?.[0]?.summary}</span>
                          {nbaB2B[away?.team?.abbreviation]&&<span style={{fontSize:7,color:"#ff6b35",background:"#ff6b3515",border:"1px solid #ff6b3530",padding:"1px 4px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>B2B</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          {home?.team?.logo&&<img src={home.team.logo} style={{width:20,height:20,objectFit:"contain"}} alt=""/>}
                          <span style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"500"}}>{home?.team?.abbreviation}</span>
                          <span style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{home?.records?.[0]?.summary}</span>
                          {nbaB2B[home?.team?.abbreviation]&&<span style={{fontSize:7,color:"#ff6b35",background:"#ff6b3515",border:"1px solid #ff6b3530",padding:"1px 4px",borderRadius:2,fontFamily:"'Orbitron',monospace"}}>B2B</span>}
                        </div>
                      </div>
                      {(isLive||isFinal)&&(
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:18,fontWeight:"bold",color:isLive?"#00ff88":"#c8d8f0",fontFamily:"'Orbitron',monospace"}}>{away?.score}</div>
                          <div style={{fontSize:18,fontWeight:"bold",color:isLive?"#00ff88":"#c8d8f0",fontFamily:"'Orbitron',monospace"}}>{home?.score}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {!selectedNbaGame?(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:20}}><div><div style={{fontSize:32,marginBottom:12}}>🏀</div><div style={{color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:13}}>Select a game to see details<br/>and get AI prop analysis</div></div></div>
              ):(()=>{
                const comp=selectedNbaGame.competitions?.[0];
                const away=comp?.competitors?.find(c=>c.homeAway==="away");
                const home=comp?.competitors?.find(c=>c.homeAway==="home");
                const isLive=comp?.status?.type?.state==="in";
                return (
                  <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                    <div style={{flexShrink:0,padding:14,borderBottom:"1px solid #0a1828",background:"#02040a"}}>
                      <div style={{display:"flex",gap:10,marginBottom:12}}>
                        {[away,home].map((team,i)=>(
                          <div key={i} style={{flex:1,background:"#0a1220",border:`1px solid ${NBA_C}20`,borderRadius:3,padding:10}}>
                            <div style={{fontSize:8,color:`${NBA_C}60`,letterSpacing:2,fontFamily:"'Orbitron',monospace",marginBottom:6}}>{i===0?"AWAY":"HOME"}</div>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              {team?.team?.logo&&<img src={team.team.logo} style={{width:24,height:24,objectFit:"contain"}} alt=""/>}
                              <div>
                                <div style={{fontSize:13,color:"#c8d8f0",fontFamily:"'Inter',sans-serif",fontWeight:"600"}}>{team?.team?.displayName}</div>
                                <div style={{fontSize:10,color:"#3a5070",fontFamily:"'Inter',sans-serif"}}>{team?.records?.[0]?.summary}</div>
                              </div>
                            </div>
                            {isLive&&<div style={{fontSize:22,fontWeight:"bold",color:"#00ff88",fontFamily:"'Orbitron',monospace"}}>{team?.score}</div>}
                          </div>
                        ))}
                      </div>
                      <button onClick={()=>getNbaAiInsight(selectedNbaGame)} disabled={nbaAiLoading} style={{width:"100%",padding:"10px",background:nbaAiLoading?"#0a1220":`${NBA_C}15`,border:`1px solid ${nbaAiLoading?"#1a2a40":NBA_C+"40"}`,borderRadius:3,color:nbaAiLoading?"#2a3a5a":NBA_C,fontSize:10,cursor:nbaAiLoading?"not-allowed":"pointer",fontFamily:"'Orbitron',monospace",letterSpacing:2,transition:"all 0.2s"}}>
                        {nbaAiLoading?"ANALYZING···":"🤖 GET AI PROP ANALYSIS"}
                      </button>
                    </div>
                    <div style={{flex:1,overflowY:"auto",padding:14,scrollbarWidth:"thin",scrollbarColor:"#0d2040 transparent"}}>
                      {nbaAiLoading?<div style={{textAlign:"center",padding:30,color:NBA_C,letterSpacing:4,fontSize:14,animation:"pulse 1s infinite",fontFamily:"'Orbitron',monospace"}}>ANALYZING MATCHUP···</div>
                      :nbaAiInsight?(
                        <div>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                            <div style={{fontSize:9,color:NBA_C,letterSpacing:3,fontFamily:"'Orbitron',monospace"}}>🤖 AI PROP ANALYSIS</div>
                            <button onClick={()=>navigator.clipboard?.writeText(nbaAiInsight)} style={{fontSize:9,color:"#3a5070",background:"#0d1828",border:"1px solid #1a2a40",borderRadius:2,cursor:"pointer",padding:"3px 10px",fontFamily:"'Orbitron',monospace"}}>COPY</button>
                          </div>
                          <div style={{fontSize:13,color:"#b0c4d8",lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"'Inter',sans-serif"}}>{nbaAiInsight}</div>
                        </div>
                      ):<div style={{color:"#2a3a55",fontFamily:"'Inter',sans-serif",fontSize:12,textAlign:"center",padding:20}}>Click "GET AI PROP ANALYSIS" for today's best prop picks</div>}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── PROPS ── */}
        {section==="PROPS" && <PropsPanel propsList={props} propLoading={propsLoading} color={C}/>}

        {/* ── TOP PICKS ── */}
        {section==="TOP PICKS" && sport==="MLB" && <TopPicksSection games={mlbGames} gamesLoading={mlbLoading} C={MLB_C}/>}
        {section==="CHEAT SHEET" && sport==="MLB" && <CheatSheet games={mlbGames} gamesLoading={mlbLoading} C={MLB_C}/>}
        {section==="TOP PICKS" && sport==="NBA" && <NBAPicksSection games={nbaGames} gamesLoading={nbaLoading} C={NBA_C}/>}

      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
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
  const [activeTab, setActiveTab] = useState("HOME");

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

      {/* NAV BAR */}
      <div style={{flexShrink:0,height:40,borderBottom:"1px solid #0a1828",display:"flex",alignItems:"stretch",background:"#02040a",zIndex:10,position:"relative"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,#0a1828,transparent)"}}/>
        {[
          {id:"HOME",  icon:"⊞", label:"HOME BASE"},
          {id:"FINANCE",icon:"💳", label:"FINANCE"},
          {id:"JOBS",  icon:"💼", label:"JOBS"},
          {id:"HEALTH",icon:"🏋️", label:"HEALTH"},
          {id:"TRAVEL",icon:"✈️", label:"TRAVEL"},
          {id:"SPORTS",icon:"⚾", label:"SPORTS"},
        ].map((tab,i)=>{
          const active = activeTab===tab.id;
          const colors = {HOME:"#00ff88",FINANCE:"#38bdf8",JOBS:"#c084fc",HEALTH:"#f472b6",TRAVEL:"#fbbf24",SPORTS:"#f97316"};
          const tc = colors[tab.id];
          return (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
              flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              background: active?`${tc}10`:"transparent",
              border:"none",
              borderBottom: active?`2px solid ${tc}`:"2px solid transparent",
              borderRight: i<5?"1px solid #0a1828":"none",
              color: active?tc:"#2a3a5a",
              cursor:"pointer",
              transition:"all 0.2s",
              padding:"0 8px",
            }}
            onMouseEnter={e=>{if(!active){e.currentTarget.style.background=`${tc}08`;e.currentTarget.style.color=`${tc}80`;}}}
            onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#2a3a5a";}}}>
              <span style={{fontSize:13}}>{tab.icon}</span>
              <span style={{fontSize:9,letterSpacing:2,fontFamily:"'Orbitron',monospace",fontWeight:active?"bold":"normal"}}>{tab.label}</span>
              {active && <div style={{width:4,height:4,borderRadius:"50%",background:tc,boxShadow:`0 0 6px ${tc}`,animation:"blink 2s infinite"}}/>}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      {activeTab==="HOME" && (
        <>
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
        </>
      )}

      {activeTab==="FINANCE" && <FinanceTab />}
      {activeTab==="JOBS" && <JobsTab />}
      {activeTab==="HEALTH" && <ComingSoon tab="HEALTH" color="#f472b6" icon="🏋️" features={["Workout Logger","Body Metrics","Sleep Tracker","Supplement Schedule"]}/>}
      {activeTab==="TRAVEL" && <ComingSoon tab="TRAVEL" color="#fbbf24" icon="✈️" features={["Deal Finder","Trip Planner","Saved Destinations","Flight Alerts"]}/>}
      {activeTab==="SPORTS" && <SportsTab />}

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
