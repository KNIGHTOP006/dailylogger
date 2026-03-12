import { useState, useRef, useEffect } from "react";

// ─── AI NUTRITION ANALYSER ────────────────────────────────────────────────────
async function analyseFood(text) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `You are a nutrition expert. Analyse this food log and return ONLY a JSON object, no markdown, no explanation.

Food: "${text}"

Return this exact structure:
{
  "items": [
    { "name": "food item", "calories": 123, "protein": 12, "carbs": 15, "fat": 5 }
  ],
  "totals": { "calories": 456, "protein": 30, "carbs": 45, "fat": 15 }
}

Rules:
- Break into individual food items
- Use realistic average estimates
- All values are numbers (no strings)
- protein/carbs/fat in grams
- If quantity not specified, assume 1 standard serving`
      }]
    })
  });
  const data = await response.json();
  const raw = data.content?.[0]?.text || "";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function NutritionLogger({ onSave, isDark = true, accentColor = "#f97316" }) {
  const [mode, setMode]         = useState("text"); // "text" | "voice"
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [saved, setSaved]       = useState(false);

  const recognitionRef = useRef(null);
  const textareaRef    = useRef(null);

  const text   = isDark ? "#f0f0ff" : "#12122a";
  const muted  = isDark ? "rgba(240,240,255,0.38)" : "rgba(0,0,0,0.38)";
  const card   = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.92)";
  const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
  const bg     = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)";

  // ── VOICE SETUP ─────────────────────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      setTranscript(final);
      setInput(final);
    };
    rec.onerror = () => { setRecording(false); setError("Microphone error. Try typing instead."); };
    recognitionRef.current = rec;
  }, []);

  const toggleRecording = () => {
    const rec = recognitionRef.current;
    if (!rec) { setError("Voice not supported in this browser. Use Chrome."); return; }
    if (recording) {
      rec.stop();
      setRecording(false);
    } else {
      setTranscript(""); setInput(""); setResult(null); setError(null);
      rec.start();
      setRecording(true);
    }
  };

  // ── ANALYSE ─────────────────────────────────────────────────────────────
async function analyseFood(text) {
  const response = await fetch("/api/analyse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ food: text }),
  });
  if (!response.ok) throw new Error("API error");
  return await response.json();
}
    
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

  const reset = () => {
    setInput(""); setResult(null); setError(null); setTranscript(""); setSaved(false);
  };

  const macroBar = (result) => {
    const p = result.totals.protein * 4;
    const c = result.totals.carbs   * 4;
    const f = result.totals.fat     * 9;
    const t = p + c + f || 1;
    return [
      { label:"Protein", val:result.totals.protein, color:"#60a5fa", flex: p/t },
      { label:"Carbs",   val:result.totals.carbs,   color:"#fbbf24", flex: c/t },
      { label:"Fat",     val:result.totals.fat,      color:"#f87171", flex: f/t },
    ];
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, animation:"fadeUp .3s ease" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        .food-item:not(:last-child){border-bottom:1px solid ${border}}
        textarea:focus{outline:none;border-color:${accentColor} !important;box-shadow:0 0 0 3px ${accentColor}22}
      `}</style>

      {/* MODE TOGGLE */}
      <div style={{ display:"flex", background:bg, borderRadius:12, padding:4, gap:3 }}>
        {[["text","✏️ Type food"],["voice","🎙️ Speak food"]].map(([m,label]) => (
          <button key={m} onClick={() => { setMode(m); reset(); }} style={{
            flex:1, padding:"10px 0", border:"none", borderRadius:9,
            background: mode===m ? `linear-gradient(135deg,#c2410c,${accentColor})` : "transparent",
            color: mode===m ? "#fff" : muted,
            fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:14,
            letterSpacing:.5, cursor:"pointer", transition:"all .2s",
          }}>{label}</button>
        ))}
      </div>

      {/* INPUT AREA */}
      <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>

        {mode === "text" ? (
          <>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:accentColor, letterSpacing:1, marginBottom:8 }}>
              🍽️ WHAT DID YOU EAT?
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); setSaved(false); }}
              placeholder={"e.g. 3 idlis with sambar, 1 cup black coffee, 2 boiled eggs\n\nBe as specific as you like — quantities, cooking method, brand names all help!"}
              style={{
                width:"100%", minHeight:110, padding:"12px 14px",
                background: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.04)",
                border:`1px solid ${border}`, borderRadius:10,
                color:text, fontFamily:"'Barlow',sans-serif", fontSize:13, lineHeight:1.6,
                resize:"vertical", boxSizing:"border-box", transition:"border-color .2s",
              }}
            />
            <div style={{ fontSize:10, color:muted, marginTop:6 }}>
              💡 Try: "masala oats 1 bowl", "chicken breast 150g grilled", "2 chapatis with dal"
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:accentColor, letterSpacing:1, marginBottom:12 }}>
              🎙️ SPEAK YOUR MEAL
            </div>

            {/* Mic button */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"8px 0" }}>
              <button onClick={toggleRecording} style={{
                width:80, height:80, borderRadius:"50%", border:"none", cursor:"pointer",
                background: recording
                  ? "linear-gradient(135deg,#dc2626,#f87171)"
                  : `linear-gradient(135deg,#c2410c,${accentColor})`,
                boxShadow: recording
                  ? "0 0 0 12px rgba(248,113,113,.15), 0 0 0 24px rgba(248,113,113,.06)"
                  : `0 0 0 8px ${accentColor}18`,
                transition:"all .3s", fontSize:32,
                animation: recording ? "pulse 1.5s ease infinite" : "none",
              }}>
                {recording ? "⏹️" : "🎤"}
              </button>
              <div style={{ fontSize:12, color: recording ? "#f87171" : muted, fontWeight: recording ? 700 : 400, fontFamily:"'Barlow Condensed',sans-serif", letterSpacing:.5 }}>
                {recording ? "● RECORDING — TAP TO STOP" : "TAP TO START RECORDING"}
              </div>
            </div>

            {/* Transcript */}
            {input && (
              <div style={{ marginTop:12, padding:"12px 14px", background: isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)", border:`1px solid ${border}`, borderRadius:10 }}>
                <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Heard:</div>
                <div style={{ fontSize:13, color:text, lineHeight:1.6, fontStyle:"italic" }}>"{input}"</div>
                <button onClick={reset} style={{ marginTop:8, fontSize:10, color:"#f87171", background:"none", border:"none", cursor:"pointer", padding:0 }}>✕ Clear & retry</button>
              </div>
            )}

            {!window.SpeechRecognition && !window.webkitSpeechRecognition && (
              <div style={{ marginTop:10, padding:"10px 14px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.2)", borderRadius:10, fontSize:12, color:"#f87171" }}>
                ⚠️ Voice not supported in this browser. Please use Chrome or Edge.
              </div>
            )}
          </>
        )}

        {/* Analyse button */}
        <button onClick={handleAnalyse} disabled={!input.trim() || loading} style={{
          width:"100%", marginTop:14, padding:"13px", border:"none", borderRadius:12,
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
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ padding:"12px 16px", background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:12, fontSize:12, color:"#f87171", display:"flex", gap:10, alignItems:"flex-start" }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* RESULTS */}
      {result && (
        <div style={{ animation:"fadeUp .35s ease", display:"flex", flexDirection:"column", gap:10 }}>

          {/* Totals */}
          <div style={{ background:card, border:`1px solid ${accentColor}33`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:13, color:accentColor, letterSpacing:1, marginBottom:12 }}>📊 NUTRITION SUMMARY</div>

            {/* Calories big display */}
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:1 }}>Total Calories</div>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:56, color:accentColor, lineHeight:1 }}>{result.totals.calories}</div>
              <div style={{ fontSize:11, color:muted }}>kcal</div>
            </div>

            {/* Macro bar */}
            <div style={{ height:10, borderRadius:99, overflow:"hidden", display:"flex", gap:2, marginBottom:10 }}>
              {macroBar(result).map((m,i) => (
                <div key={i} style={{ flex:m.flex, background:m.color, transition:"flex .5s ease", borderRadius:99 }}/>
              ))}
            </div>

            {/* Macro values */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              {macroBar(result).map((m,i) => (
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
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:18, color:accentColor, flexShrink:0 }}>{item.calories} <span style={{ fontSize:10, color:muted, fontWeight:400 }}>kcal</span></div>
                </div>
                <div style={{ display:"flex", gap:12, fontSize:11, color:muted }}>
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
              flex:1, padding:"13px", border:"none", borderRadius:12,
              background: saved ? "rgba(52,211,153,.15)" : "linear-gradient(135deg,#059669,#34d399)",
              color: saved ? "#34d399" : "#000",
              fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:17, letterSpacing:1.5,
              cursor: saved ? "default" : "pointer", transition:"all .3s",
              border: saved ? "1px solid rgba(52,211,153,.3)" : "none",
            }}>
              {saved ? "✅ SAVED TO TODAY'S LOG" : "💾 SAVE TO LOG"}
            </button>
            <button onClick={reset} style={{
              padding:"13px 16px", border:`1px solid ${border}`, borderRadius:12,
              background:"transparent", color:muted, cursor:"pointer", fontSize:13, fontWeight:700,
            }}>↩ Reset</button>
          </div>

          {saved && (
            <div style={{ textAlign:"center", fontSize:11, color:"#34d399", padding:"4px 0" }}>
              Calories & macros saved — check your 🍎 Nutrition tab
            </div>
          )}
        </div>
      )}
    </div>
  );
}