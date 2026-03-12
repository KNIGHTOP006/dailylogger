import { useState } from "react";

async function analyseFood(text) {
  const response = await fetch("/api/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ food: text }),
  });
  if (!response.ok) throw new Error("API error");
  return await response.json();
}

const QUICK_ADDS = [
  "2 boiled eggs",
  "1 cup rice",
  "1 banana",
  "Chicken breast 150g",
  "1 cup oats with milk",
  "2 chapatis with dal",
  "3 idlis with sambar",
  "1 scoop whey protein",
  "Black coffee",
  "1 cup whole milk",
];

export default function NutritionLogger({ onSave, isDark = true, accentColor = "#f97316" }) {
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);
  const [saved,   setSaved]   = useState(false);

  const text   = isDark ? "#f0f0ff" : "#12122a";
  const muted  = isDark ? "rgba(240,240,255,0.38)" : "rgba(0,0,0,0.38)";
  const card   = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.92)";
  const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";

  const appendQuick = (item) => {
    setInput(prev => prev ? `${prev}, ${item}` : item);
    setResult(null); setSaved(false);
  };

  const handleAnalyse = async () => {
    const query = input.trim();
    if (!query) return;
    setLoading(true); setError(null); setResult(null); setSaved(false);
    try {
      const data = await analyseFood(query);
      if (!data.items || !data.totals) throw new Error("Bad response");
      setResult(data);
    } catch (e) {
      setError("Couldn't analyse food. Try being specific — e.g. '2 boiled eggs, 1 cup rice'");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    onSave?.({
      calories: result.totals.calories,
      protein:  result.totals.protein,
      carbs:    result.totals.carbs,
      fat:      result.totals.fat,
      foodLog:  input,
      items:    result.items,
    });
    setSaved(true);
  };

  const reset = () => { setInput(""); setResult(null); setError(null); setSaved(false); };

  const macros = result ? [
    { label:"Protein", val:result.totals.protein, color:"#60a5fa", cal: result.totals.protein * 4 },
    { label:"Carbs",   val:result.totals.carbs,   color:"#fbbf24", cal: result.totals.carbs * 4 },
    { label:"Fat",     val:result.totals.fat,      color:"#f87171", cal: result.totals.fat * 9 },
  ] : [];
  const macroTotal = macros.reduce((s,m) => s + m.cal, 0) || 1;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .food-item:not(:last-child){border-bottom:1px solid ${border}}
        .nut-ta:focus{outline:none;border-color:${accentColor} !important;box-shadow:0 0 0 3px ${accentColor}22}
        .quick-chip:active{transform:scale(.95)}
      `}</style>

      {/* INPUT CARD */}
      <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
        <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:accentColor, letterSpacing:1, marginBottom:8 }}>
          🍽️ WHAT DID YOU EAT TODAY?
        </div>

        <textarea
          className="nut-ta"
          value={input}
          onChange={e => { setInput(e.target.value); setResult(null); setSaved(false); }}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAnalyse(); }}
          placeholder={"e.g. 3 idlis with sambar, 2 boiled eggs, black coffee, banana\n\nList everything — quantities help accuracy!"}
          style={{
            width:"100%", minHeight:100, padding:"12px 14px",
            background: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)",
            border:`1px solid ${border}`, borderRadius:10,
            color:text, fontFamily:"'Barlow',sans-serif", fontSize:13, lineHeight:1.6,
            resize:"vertical", boxSizing:"border-box", transition:"border-color .2s",
          }}
        />

        {/* QUICK ADD CHIPS */}
        <div style={{ marginTop:10, marginBottom:14 }}>
          <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:.5, marginBottom:7 }}>⚡ Quick add</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {QUICK_ADDS.map((item, i) => (
              <button key={i} className="quick-chip" onClick={() => appendQuick(item)} style={{
                padding:"5px 11px", border:`1px solid ${border}`, borderRadius:99,
                background: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)",
                color:muted, fontSize:11, cursor:"pointer", transition:"all .15s",
                fontFamily:"'Barlow',sans-serif",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = muted; }}>
                {item}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleAnalyse} disabled={!input.trim() || loading} style={{
          width:"100%", padding:"13px", border:"none", borderRadius:12,
          background: input.trim() && !loading ? `linear-gradient(135deg,#c2410c,${accentColor})` : isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)",
          color: input.trim() && !loading ? "#fff" : muted,
          fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, letterSpacing:2,
          cursor: input.trim() && !loading ? "pointer" : "not-allowed", transition:"all .2s",
          boxShadow: input.trim() && !loading ? `0 6px 20px ${accentColor}35` : "none",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          {loading
            ? <><span style={{ fontSize:18, animation:"spin 1s linear infinite", display:"inline-block" }}>⚡</span> ANALYSING...</>
            : "🔍 ANALYSE CALORIES"}
        </button>
        <div style={{ marginTop:6, fontSize:10, color:muted, textAlign:"center" }}>Ctrl+Enter to analyse</div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ padding:"12px 16px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:12, fontSize:12, color:"#f87171", display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:18, flexShrink:0 }}>⚠️</span><span>{error}</span>
        </div>
      )}

      {/* RESULTS */}
      {result && (
        <div style={{ animation:"fadeUp .35s ease", display:"flex", flexDirection:"column", gap:10 }}>

          {/* Totals */}
          <div style={{ background:card, border:`1px solid ${accentColor}33`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:accentColor, letterSpacing:1, marginBottom:12 }}>📊 NUTRITION SUMMARY</div>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:1 }}>Total Calories</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:56, color:accentColor, lineHeight:1 }}>{result.totals.calories}</div>
              <div style={{ fontSize:11, color:muted }}>kcal</div>
            </div>
            <div style={{ height:10, borderRadius:99, overflow:"hidden", display:"flex", gap:2, marginBottom:12 }}>
              {macros.map((m,i) => (
                <div key={i} style={{ flex: m.cal / macroTotal, background:m.color, borderRadius:99, minWidth:4 }}/>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {macros.map((m,i) => (
                <div key={i} style={{ textAlign:"center", padding:"10px 6px", background: isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)", borderRadius:10, border:`1px solid ${m.color}22` }}>
                  <div style={{ width:8, height:8, borderRadius:99, background:m.color, margin:"0 auto 5px" }}/>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:22, color:m.color, lineHeight:1 }}>{m.val}g</div>
                  <div style={{ fontSize:9, color:muted, textTransform:"uppercase", letterSpacing:.5, marginTop:2 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-item breakdown */}
          <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, overflow:"hidden", backdropFilter:"blur(10px)" }}>
            <div style={{ padding:"14px 16px", borderBottom:`1px solid ${border}` }}>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:text, letterSpacing:1 }}>🍱 ITEM BREAKDOWN</div>
            </div>
            {result.items.map((item, i) => (
              <div key={i} className="food-item" style={{ padding:"13px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:text, flex:1, paddingRight:10 }}>{item.name}</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:accentColor, flexShrink:0 }}>
                    {item.calories} <span style={{ fontSize:10, color:muted, fontWeight:400 }}>kcal</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, fontSize:11 }}>
                  <span style={{ color:"#60a5fa" }}>P: {item.protein}g</span>
                  <span style={{ color:"#fbbf24" }}>C: {item.carbs}g</span>
                  <span style={{ color:"#f87171" }}>F: {item.fat}g</span>
                </div>
              </div>
            ))}
          </div>

          {/* Save / Reset */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={handleSave} disabled={saved} style={{
              flex:1, padding:"13px",
              border: saved ? "1px solid rgba(52,211,153,.3)" : "none",
              borderRadius:12,
              background: saved ? "rgba(52,211,153,.15)" : "linear-gradient(135deg,#059669,#34d399)",
              color: saved ? "#34d399" : "#000",
              fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:17, letterSpacing:1.5,
              cursor: saved ? "default" : "pointer", transition:"all .3s",
            }}>
              {saved ? "✅ SAVED TO TODAY'S LOG" : "💾 SAVE TO LOG"}
            </button>
            <button onClick={reset} style={{
              padding:"13px 16px", border:`1px solid ${border}`, borderRadius:12,
              background:"transparent", color:muted, cursor:"pointer", fontSize:13, fontWeight:700,
            }}>↩ Reset</button>
          </div>

          {saved && <div style={{ textAlign:"center", fontSize:11, color:"#34d399" }}>Calories & macros saved to today's log ✓</div>}
        </div>
      )}
    </div>
  );
}