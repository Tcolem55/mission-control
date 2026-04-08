import { useState, useEffect, useRef } from "react";

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const POLYGON_KEY = "Zn9k51V6lQSR7rBGPs8LwmR68x3NZVxy";
const NEWS_KEY = "b574c48c4b3d4493942884dbf452ca87";
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

const SECTOR_COLORS = { AI:"#bf80ff", TECH:"#00c8ff", ENERGY:"#ffaa00", HEALTH:"#ff6b9d" };

const PANELS_CFG = [
  {
    id:"fitness", label:"FITNESS", icon:"⚡", color:"#00ff88",
    system:`You are an elite fitness and nutrition coach for ${NAME}. He runs MWF, lifts 5-6 days/week, weighs 216 lbs, body recomp goal. Split: legs/push/pull/shoulders/pull/push. Targets: 3300 kcal, 200g protein, 380g carbs, 90g fat. Proteins: chicken, fish, steak, shrimp (no eggs). Carbs: rice, potatoes, protein pasta. Snacks: Greek yogurt, peanut butter. Supplements: creatine 5g/day, D3+K2, magnesium glycinate. Be concise, expert, personalized.`,
    quickPrompts:["Today's nutrition plan","Recovery tips","Pre-workout fuel","Supplement timing"],
    placeholder:"Ask about training, nutrition, recovery...",
  },
  {
    id:"markets", label:"MARKETS", icon:"📈", color:"#00c8ff",
    system:`You are a sharp financial analyst advising ${NAME}. His watchlist: NVDA, TSM, PLTR, AMD, MSFT (AI/Tech), GEV, VRT, BE (Energy), UNH, ISRG, LLY, AXSM (Health). Give concise actionable insights. Not financial advice.`,
    quickPrompts:["Analyze my watchlist","Best opportunity now?","Market outlook","Biggest risks?"],
    placeholder:"Ask about stocks, markets, strategy...",
  },
  {
    id:"news", label:"WORLD NEWS", icon:"🌐", color:"#ff6b35",
    system:`You are a world news analyst briefing ${NAME}. Give concise, balanced, factual summaries of current events and how they affect markets and everyday life. Use any provided news context to give real-time relevant answers.`,
    quickPrompts:["Top stories now","Market-moving news","Tech headlines","How does this affect me?"],
    placeholder:"Ask about world events, news...",
  },
  {
    id:"command", label:"COMMAND AI", icon:"◈", color:"#bf80ff",
    system:`You are the personal AI command center for ${NAME} (Tris). He is into fitness (runs MWF, lifts 5-6 days, 216 lbs, body recomp), tech, investing (watchlist: NVDA, TSM, PLTR, AMD, MSFT, GEV, VRT, BE, UNH, ISRG, LLY, AXSM), and world news. Be sharp, concise, highly personalized. Help him plan his day, connect dots, and give elite advice.`,
    quickPrompts:["Daily briefing","Plan my day","Connect the dots","What should I focus on?"],
    placeholder:"Ask me anything, Tris...",
  },
];

// ── Utils ────────────────────────────────────────────────────────────────────
const fmt  = n => n >= 1000 ? `$${(n/1000).toFixed(1)}K` : `$${n?.toFixed(2) ?? "--"}`;
const fmtP = n => `${n >= 0 ? "+" : ""}${n?.toFixed(2) ?? "--"}%`;
const getTodayKey  = () => new Date().toISOString().split("T")[0];
const getGreeting  = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };
const loadMacros   = () => { try { const r=localStorage.getItem(`macros_${getTodayKey()}`); return r?JSON.parse(r):{kcal:0,protein:0,carbs:0,fat:0}; } catch { return {kcal:0,protein:0,carbs:0,fat:0}; }};
const saveMacros   = m => { try { localStorage.setItem(`macros_${getTodayKey()}`,JSON.stringify(m)); } catch {} };
const loadHistory  = id => { try { const r=localStorage.getItem(`chat_${id}`); return r?JSON.parse(r):[]; } catch { return []; }};
const saveHistory  = (id,msgs) => { try { localStorage.setItem(`chat_${id}`,JSON.stringify(msgs.slice(-20))); } catch {} };

async function askClaude(messages, system) {
  const res = await fetch(CLAUDE_API, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:800, system, messages }),
  });
  const data = await res.json();
  return data.content?.map(b=>b.text||"").join("") || "No response.";
}

async function fetchStock(ticker) {
  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`);
    const d = await r.json();
    if (d.results?.[0]) {
      const s = d.results[0];
      return { price:s.c, change:s.c-s.o, changePct:((s.c-s.o)/s.o)*100, high:s.h, low:s.l, volume:s.v };
    }
    return null;
  } catch { return null; }
}

async function fetchAllStocks() {
  const out = {};
  await Promise.all(WATCHLIST.map(async s => {
    const d = await fetchStock(s.ticker);
    if (d) out[s.ticker] = d;
  }));
  return out;
}

async function fetchNews(query="technology business finance") {
  try {
    const r = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=15&language=en&apiKey=${NEWS_KEY}`);
    const d = await r.json();
    return d.articles?.filter(a=>a.title&&a.title!=="[Removed]").slice(0,12) || [];
  } catch { return []; }
}

async function fetchTopNews() {
  try {
    const r = await fetch(`https://newsapi.org/v2/top-headlines?language=en&pageSize=12&apiKey=${NEWS_KEY}`);
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

// ── Macro Modal ──────────────────────────────────────────────────────────────
function MacroModal({ onClose }) {
  const [macros, setMacros] = useState(loadMacros());
  const [form, setForm]     = useState({ kcal:"", protein:"", carbs:"", fat:"" });
  const c = "#00ff88";

  const add = () => {
    const u = { kcal:macros.kcal+(Number(form.kcal)||0), protein:macros.protein+(Number(form.protein)||0), carbs:macros.carbs+(Number(form.carbs)||0), fat:macros.fat+(Number(form.fat)||0) };
    setMacros(u); saveMacros(u); setForm({kcal:"",protein:"",carbs:"",fat:""});
  };
  const reset = () => { const e={kcal:0,protein:0,carbs:0,fat:0}; setMacros(e); saveMacros(e); };

  const Bar = ({ label, cur, goal, color }) => {
    const pct = Math.min((cur/goal)*100,100); const over = cur>goal;
    return (
      <div style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:10,color:"#555",letterSpacing:2}}>{label}</span>
          <span style={{fontSize:10,color:over?"#ff4444":color}}>{cur}<span style={{color:"#333"}}>/{goal}</span></span>
        </div>
        <div style={{height:4,background:"#0d0d1a",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:over?"#ff4444":color,borderRadius:2,transition:"width 0.4s",boxShadow:`0 0 8px ${over?"#ff444450":color+"50"}`}} />
        </div>
      </div>
    );
  };

  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#08081a",border:`1px solid ${c}30`,borderRadius:4,padding:24,width:320,boxShadow:`0 0 40px ${c}15`,position:"relative"}} onClick={e=>e.stopPropagation()}>
        <div style={{position:"absolute",top:0,left:0,width:10,height:10,borderTop:`2px solid ${c}`,borderLeft:`2px solid ${c}`}} />
        <div style={{position:"absolute",top:0,right:0,width:10,height:10,borderTop:`2px solid ${c}`,borderRight:`2px solid ${c}`}} />
        <div style={{position:"absolute",bottom:0,left:0,width:10,height:10,borderBottom:`2px solid ${c}`,borderLeft:`2px solid ${c}`}} />
        <div style={{position:"absolute",bottom:0,right:0,width:10,height:10,borderBottom:`2px solid ${c}`,borderRight:`2px solid ${c}`}} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:9,letterSpacing:4,color:c}}>⚡ MACRO TRACKER</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:14}}>✕</button>
        </div>
        <Bar label="CALORIES" cur={macros.kcal} goal={MACROS_GOAL.kcal} color={c} />
        <Bar label="PROTEIN"  cur={macros.protein} goal={MACROS_GOAL.protein} color="#ff6b9d" />
        <Bar label="CARBS"    cur={macros.carbs} goal={MACROS_GOAL.carbs} color="#ffaa00" />
        <Bar label="FAT"      cur={macros.fat} goal={MACROS_GOAL.fat} color="#00c8ff" />
        <div style={{borderTop:"1px solid #ffffff08",marginTop:16,paddingTop:16}}>
          <div style={{fontSize:9,letterSpacing:3,color:"#444",marginBottom:8}}>LOG MEAL</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            {["kcal","protein","carbs","fat"].map(k=>(
              <input key={k} type="number" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={k.toUpperCase()}
                style={{background:"#0d0d1a",border:"1px solid #1a1a2e",borderRadius:2,padding:"6px 8px",color:"#ccc",fontSize:11,fontFamily:"'Courier New',monospace",outline:"none"}} />
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={add} style={{flex:1,padding:"8px",background:`${c}15`,border:`1px solid ${c}40`,borderRadius:2,color:c,fontSize:11,cursor:"pointer",fontFamily:"'Courier New',monospace",letterSpacing:2}}>+ ADD</button>
            <button onClick={reset} style={{padding:"8px 12px",background:"#ff444410",border:"1px solid #ff444430",borderRadius:2,color:"#ff4444",fontSize:11,cursor:"pointer",fontFamily:"'Courier New',monospace"}}>RESET</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stock Ticker ─────────────────────────────────────────────────────────────
function StockTicker({ stocks, loading, lastUpdated, onRefresh }) {
  const [filter, setFilter] = useState("ALL");
  const sectors = ["ALL","AI","TECH","ENERGY","HEALTH"];
  const filtered = filter==="ALL" ? WATCHLIST : WATCHLIST.filter(s=>s.sector===filter);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",gap:4,padding:"6px 8px",borderBottom:"1px solid #ffffff06",flexShrink:0,alignItems:"center"}}>
        {sectors.map(s=>(
          <button key={s} onClick={()=>setFilter(s)} style={{padding:"2px 7px",fontSize:8,letterSpacing:2,cursor:"pointer",background:filter===s?`${s==="ALL"?"#ffffff":SECTOR_COLORS[s]}15`:"transparent",border:filter===s?`1px solid ${s==="ALL"?"#ffffff30":SECTOR_COLORS[s]+"40"}`:"1px solid transparent",borderRadius:2,color:filter===s?(s==="ALL"?"#ccc":SECTOR_COLORS[s]):"#333",fontFamily:"'Courier New',monospace",transition:"all 0.15s"}}>
            {s}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={onRefresh} style={{fontSize:8,color:"#2a2a3a",background:"none",border:"none",cursor:"pointer",letterSpacing:1,fontFamily:"'Courier New',monospace"}}>
          {loading?"···":"↻"}
        </button>
      </div>
      <div style={{flex:1,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#1a1a2e transparent"}}>
        {filtered.map(s=>{
          const d=stocks[s.ticker]; const up=d?d.changePct>=0:null; const sc=SECTOR_COLORS[s.sector];
          return (
            <div key={s.ticker} style={{display:"grid",gridTemplateColumns:"6px 1fr auto auto",alignItems:"center",gap:8,padding:"6px 10px",borderBottom:"1px solid #ffffff04"}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:sc}}/>
              <div>
                <div style={{fontSize:11,fontWeight:"bold",color:"#ccc",letterSpacing:1}}>{s.ticker}</div>
                <div style={{fontSize:8,color:"#333",letterSpacing:0.5}}>{s.name}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#bbb",letterSpacing:1}}>{d?fmt(d.price):"--"}</div>
                <div style={{fontSize:8,color:"#2a2a3a"}}>{d?`H:${fmt(d.high)}`:"--"}</div>
              </div>
              <div style={{padding:"2px 6px",borderRadius:2,minWidth:52,textAlign:"center",background:d?(up?"#00ff8810":"#ff444410"):"#0d0d1a",border:d?`1px solid ${up?"#00ff8825":"#ff444425"}`:"1px solid #1a1a2e"}}>
                <div style={{fontSize:9,fontWeight:"bold",color:d?(up?"#00ff88":"#ff4444"):"#2a2a3a"}}>{d?fmtP(d.changePct):"--"}</div>
              </div>
            </div>
          );
        })}
      </div>
      {lastUpdated&&<div style={{padding:"3px 10px",fontSize:7,color:"#1a1a2e",letterSpacing:2,borderTop:"1px solid #ffffff03",flexShrink:0}}>UPDATED {lastUpdated}</div>}
    </div>
  );
}

// ── News Feed ────────────────────────────────────────────────────────────────
function NewsFeed({ articles, loading, onRefresh, onArticleClick }) {
  const categories = ["TOP","TECH","MARKETS","HEALTH"];
  const [cat, setCat] = useState("TOP");

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{display:"flex",gap:4,padding:"6px 8px",borderBottom:"1px solid #ffffff06",flexShrink:0,alignItems:"center"}}>
        {categories.map(c=>(
          <button key={c} onClick={()=>{setCat(c);onRefresh(c);}} style={{padding:"2px 7px",fontSize:8,letterSpacing:2,cursor:"pointer",background:cat===c?"#ff6b3515":"transparent",border:cat===c?"1px solid #ff6b3540":"1px solid transparent",borderRadius:2,color:cat===c?"#ff6b35":"#333",fontFamily:"'Courier New',monospace",transition:"all 0.15s"}}>
            {c}
          </button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>onRefresh(cat)} style={{fontSize:8,color:"#2a2a3a",background:"none",border:"none",cursor:"pointer",letterSpacing:1,fontFamily:"'Courier New',monospace"}}>{loading?"···":"↻"}</button>
      </div>
      <div style={{flex:1,overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"#1a1a2e transparent"}}>
        {loading&&articles.length===0&&(
          <div style={{padding:20,textAlign:"center",color:"#2a2a3a",fontSize:10,letterSpacing:3}}>LOADING FEED...</div>
        )}
        {articles.map((a,i)=>(
          <div key={i} onClick={()=>onArticleClick(a)} style={{padding:"8px 10px",borderBottom:"1px solid #ffffff04",cursor:"pointer",transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="#ff6b3508"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{fontSize:10,color:"#bbb",lineHeight:1.4,marginBottom:3}}>{a.title}</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:8,color:"#333",letterSpacing:1}}>{a.source?.name}</span>
              <span style={{fontSize:7,color:"#222"}}>·</span>
              <span style={{fontSize:8,color:"#2a2a3a"}}>{new Date(a.publishedAt).toLocaleDateString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
          </div>
        ))}
        {!loading&&articles.length===0&&(
          <div style={{padding:20,textAlign:"center",color:"#2a2a3a",fontSize:10,letterSpacing:3}}>NO ARTICLES FOUND</div>
        )}
      </div>
    </div>
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────
function Chat({ panel, contextStr }) {
  const [messages, setMessages] = useState(()=>loadHistory(panel.id));
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showQ, setShowQ]       = useState(true);
  const endRef = useRef(null);
  const c = panel.color;

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  const fullSystem = panel.system + (contextStr?`\n\nLIVE CONTEXT:\n${contextStr}`:"");

  const send = async txt => {
    const msg = txt||input.trim(); if(!msg||loading) return;
    setInput(""); setShowQ(false);
    const userMsg = {role:"user",content:msg};
    const newMsgs = [...messages,userMsg];
    setMessages(newMsgs); saveHistory(panel.id,newMsgs);
    setLoading(true);
    try {
      const reply = await askClaude(newMsgs,fullSystem);
      const final = [...newMsgs,{role:"assistant",content:reply}];
      setMessages(final); saveHistory(panel.id,final);
    } catch {
      const final=[...newMsgs,{role:"assistant",content:"Connection error. Try again."}];
      setMessages(final);
    }
    setLoading(false);
  };

  const clear = () => { setMessages([]); setShowQ(true); saveHistory(panel.id,[]); };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{padding:"4px 10px",borderBottom:`1px solid ${c}10`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:8,color:c,opacity:0.4,letterSpacing:3}}>AI ASSISTANT</span>
        {messages.length>0&&<button onClick={clear} style={{background:"none",border:"none",color:"#222",cursor:"pointer",fontSize:8,letterSpacing:1,fontFamily:"'Courier New',monospace"}}>CLR</button>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 10px",display:"flex",flexDirection:"column",gap:7,scrollbarWidth:"thin",scrollbarColor:`${c}15 transparent`,minHeight:0}}>
        {messages.length===0&&showQ&&(
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:8,color:c,opacity:0.35,letterSpacing:3,marginBottom:2}}>QUICK ACCESS</div>
            {panel.quickPrompts.map(q=>(
              <button key={q} onClick={()=>send(q)} style={{textAlign:"left",padding:"6px 10px",background:`${c}07`,border:`1px solid ${c}15`,borderRadius:2,color:"#666",fontSize:11,cursor:"pointer",fontFamily:"'Courier New',monospace"}}
                onMouseEnter={e=>{e.target.style.color=c;e.target.style.background=`${c}12`;}}
                onMouseLeave={e=>{e.target.style.color="#666";e.target.style.background=`${c}07`;}}>
                <span style={{color:c,marginRight:6}}>›</span>{q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:6,animation:"slideIn 0.25s ease"}}>
            <div style={{width:18,height:18,borderRadius:2,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:"bold",background:m.role==="user"?`${c}20`:"#111122",border:`1px solid ${m.role==="user"?c+"40":"#1e1e2e"}`,color:m.role==="user"?c:"#444",marginTop:2}}>{m.role==="user"?"U":"AI"}</div>
            <div style={{maxWidth:"85%",padding:"7px 10px",borderRadius:m.role==="user"?"2px 8px 8px 8px":"8px 2px 8px 8px",background:m.role==="user"?`${c}10`:"#0c0c1a",border:`1px solid ${m.role==="user"?c+"20":"#1a1a2e"}`,fontSize:11,lineHeight:1.6,color:m.role==="user"?"#ccc":"#b0b0c8",whiteSpace:"pre-wrap"}}>{m.content}</div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",gap:6}}>
            <div style={{width:18,height:18,borderRadius:2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,background:"#111122",border:"1px solid #1e1e2e",color:"#444"}}>AI</div>
            <div style={{padding:"7px 12px",borderRadius:"8px 2px 8px 8px",background:"#0c0c1a",border:"1px solid #1a1a2e"}}>
              <span style={{color:c,letterSpacing:3,animation:"pulse 1s infinite"}}>···</span>
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"6px 8px",borderTop:`1px solid ${c}10`,display:"flex",gap:6,background:"#04040c",flexShrink:0}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} placeholder={panel.placeholder}
          style={{flex:1,background:`${c}07`,border:`1px solid ${c}18`,borderRadius:2,padding:"6px 10px",color:"#ddd",fontSize:11,fontFamily:"'Courier New',monospace",outline:"none"}}/>
        <button onClick={()=>send()} disabled={loading||!input.trim()} style={{padding:"6px 12px",background:loading||!input.trim()?"#0a0a12":`${c}15`,border:`1px solid ${loading||!input.trim()?"#1a1a2e":c+"35"}`,borderRadius:2,color:loading||!input.trim()?"#222":c,cursor:loading||!input.trim()?"not-allowed":"pointer",fontSize:12,fontFamily:"'Courier New',monospace",transition:"all 0.15s"}}>→</button>
      </div>
    </div>
  );
}

// ── Panel Wrapper ────────────────────────────────────────────────────────────
function Panel({ cfg, isExpanded, onExpand, onCollapse, extraProps }) {
  const c = cfg.color;
  return (
    <div style={{position:"relative",background:"#07070f",border:`1px solid ${c}18`,display:"flex",flexDirection:"column",overflow:"hidden",transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",boxShadow:isExpanded?`0 0 40px ${c}15`:"none",cursor:isExpanded?"default":"pointer",minHeight:0}}
      onClick={!isExpanded?onExpand:undefined}>
      {/* Corner accents */}
      <div style={{position:"absolute",top:0,left:0,width:10,height:10,borderTop:`2px solid ${c}`,borderLeft:`2px solid ${c}`,zIndex:5}}/>
      <div style={{position:"absolute",top:0,right:0,width:10,height:10,borderTop:`2px solid ${c}`,borderRight:`2px solid ${c}`,zIndex:5}}/>
      <div style={{position:"absolute",bottom:0,left:0,width:10,height:10,borderBottom:`2px solid ${c}`,borderLeft:`2px solid ${c}`,zIndex:5}}/>
      <div style={{position:"absolute",bottom:0,right:0,width:10,height:10,borderBottom:`2px solid ${c}`,borderRight:`2px solid ${c}`,zIndex:5}}/>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",background:`radial-gradient(ellipse 80% 50% at 50% 0%, ${c}04 0%, transparent 70%)`}}/>

      {/* Header */}
      <div style={{padding:"8px 12px",borderBottom:`1px solid ${c}12`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:`${c}03`,zIndex:2}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12}}>{cfg.icon}</span>
          <span style={{fontSize:9,letterSpacing:4,color:c,fontWeight:"bold"}}>{cfg.label}</span>
          {cfg.id==="markets"&&extraProps.stockLoading&&<span style={{fontSize:8,color:"#ffaa0060",letterSpacing:2}}>UPDATING</span>}
          {cfg.id==="news"&&extraProps.newsLoading&&<span style={{fontSize:8,color:"#ff6b3560",letterSpacing:2}}>FETCHING</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <div style={{width:4,height:4,borderRadius:"50%",background:c,animation:"blink 2s infinite"}}/>
          <span style={{fontSize:7,color:c,opacity:0.35,letterSpacing:2}}>LIVE</span>
          {isExpanded
            ?<button onClick={e=>{e.stopPropagation();onCollapse();}} style={{background:`${c}15`,border:`1px solid ${c}25`,color:c,width:18,height:18,borderRadius:2,cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            :<button onClick={e=>{e.stopPropagation();onExpand();}} style={{background:`${c}15`,border:`1px solid ${c}25`,color:c,width:18,height:18,borderRadius:2,cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>⤢</button>
          }
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,zIndex:2,overflow:"hidden"}}>
        {cfg.id==="markets" ? (
          <div style={{flex:1,display:"grid",gridTemplateRows:"55% 45%",minHeight:0}}>
            <div style={{borderBottom:"1px solid #ffffff06",overflow:"hidden"}}>
              <StockTicker stocks={extraProps.stocks} loading={extraProps.stockLoading} lastUpdated={extraProps.stockUpdated} onRefresh={extraProps.onRefreshStocks}/>
            </div>
            <div style={{overflow:"hidden"}}>
              <Chat panel={cfg} contextStr={extraProps.stockContext}/>
            </div>
          </div>
        ) : cfg.id==="news" ? (
          <div style={{flex:1,display:"grid",gridTemplateRows:"55% 45%",minHeight:0}}>
            <div style={{borderBottom:"1px solid #ffffff06",overflow:"hidden"}}>
              <NewsFeed articles={extraProps.articles} loading={extraProps.newsLoading} onRefresh={extraProps.onRefreshNews} onArticleClick={extraProps.onArticleClick}/>
            </div>
            <div style={{overflow:"hidden"}}>
              <Chat panel={cfg} contextStr={extraProps.newsContext}/>
            </div>
          </div>
        ) : (
          <Chat panel={cfg} contextStr=""  />
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [time, setTime]           = useState(new Date());
  const [uptime, setUptime]       = useState(0);
  const [expanded, setExpanded]   = useState(null);
  const [weather, setWeather]     = useState(null);
  const [showMacros, setShowMacros] = useState(false);
  const [macroSnap, setMacroSnap] = useState(loadMacros());

  // Stocks
  const [stocks, setStocks]           = useState({});
  const [stockLoading, setStockLoading] = useState(false);
  const [stockUpdated, setStockUpdated] = useState(null);

  // News
  const [articles, setArticles]       = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsContext, setNewsContext] = useState("");
  const [selectedArticle, setSelectedArticle] = useState(null);

  // Build stock context string for AI
  const stockContext = Object.entries(stocks).map(([t,d])=>`${t}: $${d.price?.toFixed(2)} (${fmtP(d.changePct)})`).join(", ");

  useEffect(()=>{
    const t=setInterval(()=>{ setTime(new Date()); setUptime(u=>u+1); setMacroSnap(loadMacros()); },1000);
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
    if (cat==="TOP") arts = await fetchTopNews();
    else if (cat==="TECH") arts = await fetchNews("technology AI software");
    else if (cat==="MARKETS") arts = await fetchNews("stock market investing finance");
    else if (cat==="HEALTH") arts = await fetchNews("health medical biotech");
    setArticles(arts);
    const ctx = arts.slice(0,6).map(a=>`- ${a.title} (${a.source?.name})`).join("\n");
    setNewsContext(ctx);
    setNewsLoading(false);
  };

  const handleArticleClick = (article) => setSelectedArticle(article);

  const getGreetingFull = () => {
    const h=new Date().getHours();
    return h<12?"Good morning":h<17?"Good afternoon":"Good evening";
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
    onRefreshStocks: refreshStocks,
    articles, newsLoading, newsContext,
    onRefreshNews: refreshNews,
    onArticleClick: handleArticleClick,
  };

  return (
    <div style={{height:"100vh",width:"100vw",background:"#030308",color:"#e8e8f0",fontFamily:"'Courier New',monospace",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Scanlines */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:100,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px)"}}/>

      {/* TOP BAR */}
      <div style={{flexShrink:0,padding:"6px 14px",borderBottom:"1px solid #0d0d1a",display:"flex",alignItems:"center",gap:12,background:"#03030c",zIndex:10,flexWrap:"nowrap",overflowX:"auto"}}>
        {/* Identity */}
        <div style={{flexShrink:0}}>
          <div style={{fontSize:8,letterSpacing:4,color:"#1a1a2e"}}>OPERATOR</div>
          <div style={{fontSize:13,letterSpacing:2,fontWeight:"bold",whiteSpace:"nowrap"}}>
            <span style={{color:"#333"}}>{getGreetingFull()}, </span>
            <span style={{color:"#00ff88"}}>{NAME}</span>
          </div>
        </div>
        <div style={{width:1,height:24,background:"#0d0d1a",flexShrink:0}}/>
        {/* Uptime */}
        <div style={{flexShrink:0}}>
          <div style={{fontSize:7,letterSpacing:3,color:"#1a1a2e"}}>UPTIME</div>
          <div style={{fontSize:11,color:"#00ff8880",letterSpacing:2,fontVariantNumeric:"tabular-nums"}}>{formatUptime(uptime)}</div>
        </div>
        <div style={{width:1,height:24,background:"#0d0d1a",flexShrink:0}}/>
        {/* Macro mini */}
        <button onClick={()=>setShowMacros(true)} style={{background:"#00ff8806",border:"1px solid #00ff8815",borderRadius:2,padding:"3px 10px",cursor:"pointer",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:3}}>
            <span style={{fontSize:7,letterSpacing:2,color:"#00ff8870"}}>⚡ MACROS</span>
            <span style={{fontSize:7,color:"#1a1a2e"}}>{kcalPct}% kcal · {protPct}% PRO</span>
          </div>
          <div style={{display:"flex",gap:3}}>
            {[{c:"#00ff88",v:macroSnap.kcal,g:MACROS_GOAL.kcal},{c:"#ff6b9d",v:macroSnap.protein,g:MACROS_GOAL.protein},{c:"#ffaa00",v:macroSnap.carbs,g:MACROS_GOAL.carbs},{c:"#00c8ff",v:macroSnap.fat,g:MACROS_GOAL.fat}].map(({c,v,g},i)=>(
              <div key={i} style={{width:28,height:3,background:"#0d0d1a",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min((v/g)*100,100)}%`,background:c,borderRadius:2}}/>
              </div>
            ))}
          </div>
        </button>
        <div style={{width:1,height:24,background:"#0d0d1a",flexShrink:0}}/>
        {/* Panel status */}
        <div style={{display:"flex",gap:14,flex:1,justifyContent:"center"}}>
          {PANELS_CFG.map(p=>(
            <div key={p.id} style={{textAlign:"center",flexShrink:0}}>
              <div style={{fontSize:8,color:p.color,opacity:0.5,letterSpacing:1,whiteSpace:"nowrap"}}>{p.icon} {p.label}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3,marginTop:1}}>
                <div style={{width:3,height:3,borderRadius:"50%",background:p.color,animation:"blink 2s infinite"}}/>
                <span style={{fontSize:7,color:"#1a1a2e",letterSpacing:1}}>LIVE</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{width:1,height:24,background:"#0d0d1a",flexShrink:0}}/>
        {/* Weather */}
        {weather?(
          <div style={{textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:15}}>{weather.icon}</div>
            <div style={{fontSize:9,color:"#555",letterSpacing:1}}>{weather.temp}°F</div>
          </div>
        ):(
          <div style={{fontSize:7,color:"#1a1a2e",letterSpacing:2,flexShrink:0}}>WEATHER<br/>--</div>
        )}
        <div style={{width:1,height:24,background:"#0d0d1a",flexShrink:0}}/>
        {/* Clock */}
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:15,fontWeight:"bold",letterSpacing:2,color:"#ccc",fontVariantNumeric:"tabular-nums"}}>{time.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div>
          <div style={{fontSize:7,color:"#222",letterSpacing:2}}>{time.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}).toUpperCase()}</div>
        </div>
      </div>

      {/* GRID */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:expanded?"1fr":"1fr 1fr",gridTemplateRows:expanded?"1fr":"1fr 1fr",gap:1,padding:1,background:"#08081a",minHeight:0,overflow:"hidden"}}>
        {PANELS_CFG.map(cfg=>{
          if(expanded&&expanded!==cfg.id) return null;
          return (
            <Panel key={cfg.id} cfg={cfg} isExpanded={expanded===cfg.id} onExpand={()=>setExpanded(cfg.id)} onCollapse={()=>setExpanded(null)} extraProps={extraProps}/>
          );
        })}
      </div>

      {/* BOTTOM BAR */}
      <div style={{flexShrink:0,padding:"4px 14px",borderTop:"1px solid #0a0a14",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#03030c"}}>
        <div style={{fontSize:7,color:"#111",letterSpacing:3}}>{expanded?`◈ FOCUSED: ${expanded.toUpperCase()} — ✕ TO RETURN`:"◈ CLICK PANEL TO FOCUS · ⤢ EXPAND · MACROS BAR TO LOG"}</div>
        <div style={{display:"flex",gap:10}}>
          {["SYS OK","AI READY","STOCKS LIVE","NEWS LIVE"].map(s=><span key={s} style={{fontSize:7,color:"#111",letterSpacing:2}}>{s}</span>)}
        </div>
      </div>

      {/* Article Modal */}
      {selectedArticle&&(
        <div style={{position:"fixed",inset:0,background:"#000000dd",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setSelectedArticle(null)}>
          <div style={{background:"#08081a",border:"1px solid #ff6b3530",borderRadius:4,padding:24,width:420,maxWidth:"90vw",maxHeight:"70vh",overflow:"auto",boxShadow:"0 0 40px #ff6b3515"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:8,color:"#ff6b35",letterSpacing:3,marginBottom:10}}>🌐 ARTICLE</div>
            <div style={{fontSize:13,color:"#ddd",lineHeight:1.5,marginBottom:12}}>{selectedArticle.title}</div>
            <div style={{fontSize:11,color:"#666",lineHeight:1.6,marginBottom:16}}>{selectedArticle.description}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:8,color:"#333"}}>{selectedArticle.source?.name}</span>
              <a href={selectedArticle.url} target="_blank" rel="noreferrer" style={{fontSize:9,color:"#ff6b35",textDecoration:"none",letterSpacing:2,border:"1px solid #ff6b3530",padding:"4px 10px",borderRadius:2}}>READ FULL →</a>
            </div>
          </div>
        </div>
      )}

      {showMacros&&<MacroModal onClose={()=>setShowMacros(false)}/>}

      <style>{`
        @keyframes blink{0%,100%{opacity:0.2}50%{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:0.2}50%{opacity:1}}
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:2px;height:2px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#111;border-radius:2px;}
        input::placeholder{color:#222;}
        a{color:inherit;}
      `}</style>
    </div>
  );
}
