import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import NutritionLogger from "./NutritionLogger";
import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, deleteDoc, onSnapshot } from "firebase/firestore";

const CORRECT_PIN = "1234";
const USER_ID     = "harshith";

const calcNavyBF = (waistCm, neckCm, heightCm) => {
  if (!waistCm || !neckCm || !heightCm) return null;
  const w = parseFloat(waistCm), n = parseFloat(neckCm), h = parseFloat(heightCm);
  if (w <= n || w <= 0 || n <= 0 || h <= 0) return null;
  const bf = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
  if (bf < 2 || bf > 60) return null;
  return Math.round(bf * 10) / 10;
};

const getBFCategory = (bf) => {
  if (bf < 6)  return { label: "Essential Fat", color: "#60a5fa", bar: 5 };
  if (bf < 14) return { label: "Athlete",        color: "#34d399", bar: 25 };
  if (bf < 18) return { label: "Fitness",         color: "#a78bfa", bar: 50 };
  if (bf < 25) return { label: "Acceptable",      color: "#fbbf24", bar: 75 };
  return              { label: "Obese",            color: "#f87171", bar: 95 };
};

const getBMICat = (bmi) => {
  const b = parseFloat(bmi);
  if (b < 18.5) return { label: "Underweight", color: "#60a5fa" };
  if (b < 25)   return { label: "Healthy ✓",   color: "#34d399" };
  if (b < 30)   return { label: "Overweight",  color: "#fbbf24" };
  return              { label: "Obese",         color: "#f87171" };
};

const computeStreak = (logs) => {
  if (!logs.length) return 0;
  const dates = [...new Set(logs.map(l => l.date))].sort().reverse();
  let streak = 0, cur = new Date(); cur.setHours(0,0,0,0);
  for (let d of dates) {
    const ld = new Date(d + "T12:00:00"); ld.setHours(0,0,0,0);
    const diff = Math.round((cur - ld) / 86400000);
    if (diff === 0 || diff === 1) { streak++; cur = ld; } else break;
  }
  return streak;
};

const estimateTDEE = (weightKg, heightCm, age = 30, activity = 1.375) => {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  return Math.round(bmr * activity);
};

const buildPrediction = (logs, profile, weeks = 12) => {
  const withCal = [...logs].filter(l => l.calories && l.weight).sort((a,b) => new Date(a.date)-new Date(b.date));
  if (!withCal.length) return null;
  const latestAll = [...logs].sort((a,b) => new Date(b.date)-new Date(a.date))[0];
  if (!latestAll) return null;
  const startWeight = latestAll.weight;
  const startBF = latestAll.bodyFat ?? null;
  const hCm = profile.height ? (profile.unit === "cm" ? parseFloat(profile.height) : parseFloat(profile.height)*2.54) : 175;
  const recentCal = withCal.slice(-7);
  const avgCal = recentCal.reduce((s,l) => s + parseFloat(l.calories), 0) / recentCal.length;
  const tdee = estimateTDEE(startWeight, hCm);
  const dailyDeficit = tdee - avgCal;
  const weeklyFatLossKg = Math.min(1.0, Math.max(-0.5, (dailyDeficit * 7) / 7700));
  const startDate = new Date(latestAll.date + "T12:00:00");
  const points = [];
  for (let w = 0; w <= weeks; w++) {
    const d = new Date(startDate); d.setDate(d.getDate() + w * 7);
    const label = d.toISOString().slice(5,10);
    const predWeight = Math.max(40, startWeight - weeklyFatLossKg * w);
    let predBF = null;
    if (startBF !== null) {
      const fatMass = startWeight * (startBF / 100);
      const leanMass = startWeight - fatMass;
      const newFat = Math.max(fatMass * 0.02, fatMass - weeklyFatLossKg * w);
      predBF = Math.max(4, Math.round(((newFat / (newFat + leanMass)) * 100) * 10) / 10);
    }
    points.push({ date: label, predWeight: Math.round(predWeight*10)/10, predBF });
  }
  return { points, tdee, avgCal: Math.round(avgCal), dailyDeficit, weeklyFatLossKg, startWeight, startBF };
};

const QUOTES = [
  "Measure it. Track it. Destroy it. 💪",
  "Your body fat doesn't lie — neither should you. 🔥",
  "Data beats excuses every single time. 📊",
  "Every check-in is a vote for the body you want. 🏆",
  "Consistency is the only shortcut. ⚡",
  "The scale shows weight. The tape shows truth. 📏",
];

const MILESTONES = [
  { id: "first_log",    icon: "🏁", label: "First Step",      desc: "Completed first check-in" },
  { id: "streak_3",     icon: "🔥", label: "3-Day Streak",    desc: "Logged 3 days in a row" },
  { id: "streak_7",     icon: "⚡", label: "Week Warrior",    desc: "Logged 7 days in a row" },
  { id: "streak_30",    icon: "🏆", label: "Iron Discipline", desc: "Logged 30 days in a row" },
  { id: "lost_1",       icon: "📉", label: "First Drop",      desc: "Lost your first kg" },
  { id: "lost_5",       icon: "✋", label: "High Five!",      desc: "Lost 5 kg total" },
  { id: "lost_10",      icon: "💎", label: "Double Digits",   desc: "Lost 10 kg total" },
  { id: "bf_athlete",   icon: "🏅", label: "Athlete Zone",    desc: "Reached athlete body fat (<14%)" },
  { id: "bf_fitness",   icon: "💪", label: "Fitness Zone",    desc: "Reached fitness body fat (<18%)" },
  { id: "full_checkin", icon: "✅", label: "Complete Day",    desc: "Photo + weight logged together" },
  { id: "logs_10",      icon: "📋", label: "Consistent",      desc: "10 total check-ins logged" },
];

const checkMilestones = (logs, prevEarned) => {
  const e = new Set(prevEarned);
  const streak = computeStreak(logs);
  const s = [...logs].sort((a,b) => new Date(a.date)-new Date(b.date));
  const loss = s.length > 1 ? s[0].weight - s[s.length-1].weight : 0;
  if (logs.length >= 1) e.add("first_log");
  if (streak >= 3) e.add("streak_3");
  if (streak >= 7) e.add("streak_7");
  if (streak >= 30) e.add("streak_30");
  if (logs.length >= 10) e.add("logs_10");
  if (loss >= 1) e.add("lost_1");
  if (loss >= 5) e.add("lost_5");
  if (loss >= 10) e.add("lost_10");
  const bfLogs = logs.filter(l => l.bodyFat);
  if (bfLogs.some(l => l.bodyFat < 14)) e.add("bf_athlete");
  if (bfLogs.some(l => l.bodyFat < 18)) e.add("bf_fitness");
  if (logs.some(l => l.weight && l.photo)) e.add("full_checkin");
  return [...e];
};

const BFTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#1a0a2e", border:"1px solid rgba(167,139,250,.3)", borderRadius:10, padding:"8px 14px", fontSize:12 }}>
      <div style={{ color:"rgba(255,255,255,.45)", marginBottom:2 }}>{label}</div>
      <div style={{ color:"#a78bfa", fontWeight:700 }}>{payload[0].value}% body fat</div>
    </div>
  );
};

const PredictTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0f0a1e", border:"1px solid rgba(52,211,153,.3)", borderRadius:10, padding:"8px 14px", fontSize:12 }}>
      <div style={{ color:"rgba(255,255,255,.4)", marginBottom:3 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color, fontWeight:700 }}>
          {p.name === "predWeight" ? `⚖️ ${p.value} kg` : `📏 ${p.value}% BF`}
        </div>
      ))}
    </div>
  );
};

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleKey = (k) => {
    if (k === "del") { setPin(p => p.slice(0,-1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      if (next === CORRECT_PIN) {
        onUnlock();
      } else {
        setShake(true);
        setAttempts(a => a+1);
        setTimeout(() => { setShake(false); setPin(""); }, 600);
      }
    }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"radial-gradient(ellipse at 20% 0%, #1a0808 0%, #080810 70%)", fontFamily:"'Barlow',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-10px)}40%,80%{transform:translateX(10px)}}
        @keyframes fadeInPin{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{ animation:"fadeInPin .5s ease", textAlign:"center", width:"100%", maxWidth:320, padding:"0 24px" }}>
        <div style={{ fontSize:52, marginBottom:12 }}>🔒</div>
        <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:28, color:"#f97316", letterSpacing:3, marginBottom:4 }}>DAILY LOG</div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,.35)", marginBottom:36, letterSpacing:1 }}>ENTER YOUR PIN</div>
        <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:36, animation: shake ? "shake .5s ease" : "none" }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width:16, height:16, borderRadius:"50%", background: pin.length > i ? "#f97316" : "rgba(255,255,255,.12)", border: pin.length > i ? "none" : "2px solid rgba(255,255,255,.2)", transition:"background .15s", boxShadow: pin.length > i ? "0 0 10px rgba(249,115,22,.6)" : "none" }}/>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {["1","2","3","4","5","6","7","8","9","","0","del"].map((k,i) => (
            <button key={i} onClick={() => k && handleKey(k)}
              style={{ padding:"18px 0", border:"none", borderRadius:12, background: k ? "rgba(255,255,255,.07)" : "transparent", color: k === "del" ? "#f87171" : "#fff", fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize: k === "del" ? 18 : 24, cursor: k ? "pointer" : "default", transition:"background .1s" }}
              onMouseDown={e => { if(k) e.currentTarget.style.background = "rgba(249,115,22,.25)"; }}
              onMouseUp={e => { if(k) e.currentTarget.style.background = "rgba(255,255,255,.07)"; }}>
              {k === "del" ? "⌫" : k}
            </button>
          ))}
        </div>
        {attempts > 0 && <div style={{ marginTop:20, fontSize:11, color:"#f87171" }}>Incorrect PIN — {attempts} attempt{attempts > 1 ? "s" : ""}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const today = new Date().toISOString().split("T")[0];
  const quoteIdx = useRef(Math.floor(Math.random() * QUOTES.length)).current;

  const [unlocked,     setUnlocked]     = useState(() => sessionStorage.getItem("wt_unlocked") === "1");
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [theme,        setTheme]        = useState("dark");
  const [logs,         setLogs]         = useState([]);
  const [earned,       setEarned]       = useState([]);
  const [profile,      setProfile]      = useState({ height:"", goal:"", unit:"cm", calTarget:"" });
  const [tab,          setTab]          = useState("checkin");
  const [newBadge,     setNewBadge]     = useState(null);
  const [predWeeks,    setPredWeeks]    = useState(12);
  const [toast,        setToast]        = useState(null);
  const [weight,       setWeight]       = useState("");
  const [waist,        setWaist]        = useState("");
  const [neck,         setNeck]         = useState("");
  const [calories,     setCalories]     = useState("");
  const [photoSrc,     setPhotoSrc]     = useState(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [submitted,    setSubmitted]    = useState(false);
  const fileRef = useRef();

  const showToast = (msg, icon = "✅", color = "#34d399") => {
    setToast({ msg, icon, color });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!unlocked) { setLoading(false); return; }
    const unsubLogs = onSnapshot(
      collection(db, "users", USER_ID, "logs"),
      (snap) => {
        const data = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        setLogs(data.sort((a,b) => new Date(b.date)-new Date(a.date)));
        setLoading(false);
      },
      () => setLoading(false)
    );
    getDoc(doc(db, "users", USER_ID, "meta", "profile")).then(d => { if (d.exists()) setProfile(d.data()); });
    getDoc(doc(db, "users", USER_ID, "meta", "earned")).then(d => { if (d.exists()) setEarned(d.data().list || []); });
    getDoc(doc(db, "users", USER_ID, "meta", "theme")).then(d => { if (d.exists()) setTheme(d.data().value || "dark"); });
    return () => unsubLogs();
  }, [unlocked]);

  useEffect(() => {
    const ex = logs.find(l => l.date === today);
    if (ex) {
      setWeight(ex.weight || ""); setWaist(ex.waist || ""); setNeck(ex.neck || "");
      setCalories(ex.calories || ""); setPhotoSrc(ex.photo || null);
      setPhotoCaption(ex.photoCaption || ""); setSubmitted(true);
    }
  }, [logs]);

  const saveLog = async (entry) => {
    setSyncing(true);
    await setDoc(doc(db, "users", USER_ID, "logs", entry.date), entry);
    setSyncing(false);
  };

  const deleteLog = async (date) => {
    setSyncing(true);
    await deleteDoc(doc(db, "users", USER_ID, "logs", date));
    setSyncing(false);
  };

  const saveProfile = async (p) => {
    setProfile(p);
    await setDoc(doc(db, "users", USER_ID, "meta", "profile"), p);
  };

  const saveEarned = async (list) => {
    setEarned(list);
    await setDoc(doc(db, "users", USER_ID, "meta", "earned"), { list });
  };

  const saveTheme = async (t) => {
    setTheme(t);
    await setDoc(doc(db, "users", USER_ID, "meta", "theme"), { value: t });
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhotoSrc(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!weight) return;
    const hCm = profile.height ? (profile.unit === "cm" ? parseFloat(profile.height) : parseFloat(profile.height)*2.54) : null;
    const bf   = hCm && waist && neck ? calcNavyBF(waist, neck, hCm) : null;
    const entry = {
      date: today, weight: parseFloat(weight),
      waist: waist || null, neck: neck || null, bodyFat: bf,
      calories: calories || null,
      photo: photoSrc || null, photoCaption: photoCaption || null,
    };
    await saveLog(entry);
    const newLogs = [...logs.filter(l => l.date !== today), entry].sort((a,b) => new Date(b.date)-new Date(a.date));
    const ne = checkMilestones(newLogs, earned);
    if (ne.length > earned.length) {
      const badge = MILESTONES.find(m => !earned.includes(m.id) && ne.includes(m.id));
      if (badge) { setNewBadge(badge); setTimeout(() => setNewBadge(null), 3500); }
      await saveEarned(ne);
    }
    setSubmitted(true);
    showToast("Check-in saved! 💪", "✅", "#34d399");
  };

  const handleSaveNutrition = async () => {
    const existing = logs.find(l => l.date === today);
    if (!existing) { showToast("Save your check-in first!", "⚠️", "#f87171"); return; }
    const updated = { ...existing, calories: calories || null };
    await saveLog(updated);
    showToast("Nutrition saved! 🔥", "🔥", "#fbbf24");
  };

  const exportCSV = () => {
    const rows = [["Date","Weight(kg)","Waist(cm)","Neck(cm)","BodyFat%","Calories"],
      ...sorted.map(l => [l.date, l.weight, l.waist||"", l.neck||"", l.bodyFat||"", l.calories||""])];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map(r=>r.join(",")).join("\n")], {type:"text/csv"}));
    a.download = "daily-log.csv"; a.click();
  };

  const sorted        = [...logs].sort((a,b) => new Date(b.date)-new Date(a.date));
  const chronological = [...logs].sort((a,b) => new Date(a.date)-new Date(b.date));
  const latest        = sorted[0];
  const streak        = computeStreak(logs);
  const totalChange   = logs.length > 1 ? (sorted[0].weight - sorted[sorted.length-1].weight).toFixed(1) : null;
  const heightCm      = profile.height ? (profile.unit === "cm" ? parseFloat(profile.height) : parseFloat(profile.height)*2.54) : null;
  const liveBF        = heightCm && waist && neck ? calcNavyBF(waist, neck, heightCm) : null;
  const liveBFCat     = liveBF ? getBFCategory(liveBF) : null;
  const latestBF      = latest?.bodyFat ?? null;
  const latestBFCat   = latestBF ? getBFCategory(latestBF) : null;
  const bmi           = latest && heightCm ? (latest.weight / ((heightCm/100) ** 2)).toFixed(1) : null;
  const bmiCat        = bmi ? getBMICat(bmi) : null;
  const bfChartData   = chronological.filter(l => l.bodyFat).map(l => ({ date: l.date.slice(5), bf: l.bodyFat }));
  const prediction    = buildPrediction(logs, profile, predWeeks);
  const todayComplete = weight && photoSrc;

  const isDark = theme === "dark";
  const text   = isDark ? "#f0f0ff" : "#12122a";
  const muted  = isDark ? "rgba(240,240,255,0.38)" : "rgba(0,0,0,0.38)";
  const card   = isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.9)";
  const border = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
  const accent = "#f97316";

  const inp = {
    width:"100%", padding:"11px 14px",
    background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
    border:`1px solid ${border}`, borderRadius:10,
    color:text, fontFamily:"'Barlow',sans-serif", fontSize:14,
    outline:"none", boxSizing:"border-box", transition:"border-color .2s",
  };

  const TABS = [
    {id:"checkin",    icon:"📋", label:"Check-In"},
    {id:"nutrition",  icon:"🍎", label:"Nutrition"},
    {id:"predict",    icon:"🔮", label:"Predict"},
    {id:"bodyfat",    icon:"📊", label:"Body Fat"},
    {id:"history",    icon:"🗓",  label:"History"},
    {id:"milestones", icon:"🏆", label:"Badges"},
    {id:"settings",   icon:"⚙️", label:"Settings"},
  ];

  if (!unlocked) {
    return <PinScreen onUnlock={() => { sessionStorage.setItem("wt_unlocked","1"); setUnlocked(true); }}/>;
  }

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"radial-gradient(ellipse at 20% 0%, #1a0808 0%, #080810 70%)", fontFamily:"'Barlow Condensed',sans-serif", color:"#f97316", fontSize:20, letterSpacing:2, flexDirection:"column", gap:14 }}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&display=swap" rel="stylesheet"/>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:40, animation:"spin 1s linear infinite" }}>⚡</div>
        LOADING YOUR DATA...
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background: isDark ? "radial-gradient(ellipse at 20% 0%, #1a0808 0%, #080810 70%)" : "radial-gradient(ellipse at 20% 0%, #fff0e8 0%, #f0f4ff 70%)", fontFamily:"'Barlow',sans-serif", color:text, transition:"background .3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Barlow+Condensed:wght@700;800&display=swap" rel="stylesheet"/>
      <style>{`
        input[type=date]{color-scheme:${isDark?"dark":"light"}}
        input:focus{border-color:#f97316 !important;box-shadow:0 0 0 3px rgba(249,115,22,.12)}
        @keyframes slideDown{from{transform:translateY(-80px) scale(.9);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bfPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
        .row-item:not(:last-child){border-bottom:1px solid ${border}}
        .tab-btn:active{transform:scale(.95)}
      `}</style>

      {/* CONFIRMATION TOAST */}
      {toast && (
        <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", zIndex:999, animation:"slideUp .35s cubic-bezier(.34,1.56,.64,1)", background: isDark ? "rgba(20,20,32,.97)" : "rgba(255,255,255,.97)", border:`1px solid ${toast.color}55`, borderRadius:14, padding:"13px 22px", display:"flex", alignItems:"center", gap:10, boxShadow:"0 8px 32px rgba(0,0,0,.35)", minWidth:220 }}>
          <div style={{ fontSize:22 }}>{toast.icon}</div>
          <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:16, color:toast.color, letterSpacing:.5 }}>{toast.msg}</div>
        </div>
      )}

      {/* BADGE TOAST */}
      {newBadge && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", zIndex:998, animation:"slideDown .45s cubic-bezier(.34,1.56,.64,1)", background:"linear-gradient(135deg,#c2410c,#f97316)", borderRadius:20, padding:"16px 30px", textAlign:"center", boxShadow:"0 16px 50px rgba(249,115,22,.55)", minWidth:250 }}>
          <div style={{ fontSize:38 }}>{newBadge.icon}</div>
          <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:20, color:"#fff", letterSpacing:2, marginTop:4 }}>BADGE UNLOCKED</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.85)", marginTop:3 }}>{newBadge.label} — {newBadge.desc}</div>
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: isDark ? "rgba(8,8,16,.9)" : "rgba(255,255,255,.88)", borderBottom:`1px solid ${border}`, backdropFilter:"blur(20px)", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:520, margin:"0 auto", padding:"13px 16px 11px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:27, letterSpacing:3, color:accent, lineHeight:1 }}>DAILY LOG</div>
              <div style={{ fontSize:10, color:muted, letterSpacing:2 }}>YOUR PERSONAL TRAINER</div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {syncing && <div style={{ fontSize:10, color:"#34d399", background:"rgba(52,211,153,.1)", border:"1px solid rgba(52,211,153,.2)", padding:"4px 10px", borderRadius:99 }}>⚡ Syncing...</div>}
              {streak > 0 && !syncing && (
                <div style={{ background: isDark ? "rgba(251,191,36,.12)" : "rgba(251,191,36,.2)", border:"1px solid rgba(251,191,36,.35)", borderRadius:99, padding:"5px 11px", fontSize:12, color:"#fbbf24", fontWeight:700 }}>🔥 {streak}d</div>
              )}
              <button onClick={() => saveTheme(theme === "dark" ? "light" : "dark")} style={{ background: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)", border:"none", borderRadius:99, width:36, height:36, cursor:"pointer", fontSize:16 }}>
                {isDark ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
          <div style={{ marginTop:9, padding:"7px 12px", background: isDark ? "rgba(249,115,22,.08)" : "rgba(249,115,22,.07)", borderLeft:"3px solid #f97316", borderRadius:"0 8px 8px 0", fontSize:11, color:muted, fontStyle:"italic" }}>
            {QUOTES[quoteIdx]}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:520, margin:"0 auto", padding:"12px 13px 90px" }}>

        {/* STATS ROW */}
        {latest && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:13 }}>
            {[
              { label:"Weight",   val:`${latest.weight}`,                                                                    sub:"kg",    icon:"⚖️", col:accent },
              { label:"Body Fat", val:latestBF ? `${latestBF}%` : "—",                                                      sub:latestBFCat?.label||"measure", icon:"📏", col:"#a78bfa" },
              { label:"Change",   val:totalChange ? (parseFloat(totalChange)>0?`+${totalChange}`:totalChange) : "—",         sub:"kg",    icon:parseFloat(totalChange)<0?"📉":"📈", col:parseFloat(totalChange)<0?"#34d399":"#fbbf24" },
              { label:"Streak",   val:streak,                                                                                 sub:"days",  icon:"🔥", col:"#fbbf24" },
            ].map((s,i) => (
              <div key={i} style={{ background:card, border:`1px solid ${s.col}28`, borderRadius:12, padding:"10px 5px", textAlign:"center", backdropFilter:"blur(10px)" }}>
                <div style={{ fontSize:15 }}>{s.icon}</div>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:19, color:s.col, lineHeight:1.1 }}>{s.val}</div>
                <div style={{ fontSize:8, color:muted, marginTop:2, textTransform:"uppercase", letterSpacing:.4, lineHeight:1.3 }}>{s.label}<br/><span style={{opacity:.7}}>{s.sub}</span></div>
              </div>
            ))}
          </div>
        )}

        {/* TABS */}
        <div style={{ display:"flex", gap:3, background: isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)", borderRadius:14, padding:4, marginBottom:15 }}>
          {TABS.map(t => (
            <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{ flex:1, padding:"9px 2px", border:"none", borderRadius:10, background: tab===t.id ? "linear-gradient(135deg,#c2410c,#f97316)" : "transparent", color: tab===t.id ? "#fff" : muted, fontSize:18, cursor:"pointer", transition:"all .2s" }} title={t.label}>{t.icon}</button>
          ))}
        </div>

        {/* CHECK-IN */}
        {tab === "checkin" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            {submitted && todayComplete && (
              <div style={{ marginBottom:13, padding:"13px 16px", background:"linear-gradient(135deg,rgba(52,211,153,.12),rgba(16,185,129,.08))", border:"1px solid rgba(52,211,153,.28)", borderRadius:14, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:26 }}>✅</div>
                <div>
                  <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:16, color:"#34d399", letterSpacing:1 }}>TODAY'S CHECK-IN COMPLETE!</div>
                  <div style={{ fontSize:11, color:muted }}>Log calories in the 🍎 Nutrition tab</div>
                </div>
              </div>
            )}
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:17, marginBottom:11, backdropFilter:"blur(10px)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:11 }}>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:13, color:accent, letterSpacing:1 }}>📸 TODAY'S PHOTO</div>
                {!photoSrc ? <div style={{ fontSize:10, color:"#f87171", fontWeight:700, background:"rgba(248,113,113,.1)", padding:"3px 8px", borderRadius:99 }}>REQUIRED</div>
                           : <div style={{ fontSize:10, color:"#34d399", fontWeight:700, background:"rgba(52,211,153,.1)", padding:"3px 8px", borderRadius:99 }}>✓ DONE</div>}
              </div>
              {photoSrc ? (
                <div>
                  <img src={photoSrc} alt="Today" style={{ width:"100%", height:200, objectFit:"cover", borderRadius:11, display:"block" }}/>
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <input type="text" placeholder="Caption (optional)" value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} style={{ ...inp, flex:1 }}/>
                    <button onClick={() => { setPhotoSrc(null); setSubmitted(false); }} style={{ padding:"0 14px", background:"rgba(248,113,113,.12)", border:"1px solid rgba(248,113,113,.2)", borderRadius:10, color:"#f87171", cursor:"pointer", fontSize:12, fontWeight:700 }}>Change</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => fileRef.current.click()} style={{ width:"100%", height:130, border:`2px dashed ${accent}44`, borderRadius:12, background: isDark ? "rgba(249,115,22,.04)" : "rgba(249,115,22,.03)", color:accent, cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:7 }}>
                  <span style={{ fontSize:32 }}>📷</span>
                  <span>Tap to upload today's photo</span>
                  <span style={{ fontSize:10, color:muted, fontWeight:400 }}>Front or side pose works best</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display:"none" }}/>
            </div>
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:17, marginBottom:11, backdropFilter:"blur(10px)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:11 }}>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:13, color:accent, letterSpacing:1 }}>⚖️ WEIGHT</div>
                {!weight && <div style={{ fontSize:10, color:"#f87171", fontWeight:700, background:"rgba(248,113,113,.1)", padding:"3px 8px", borderRadius:99 }}>REQUIRED</div>}
              </div>
              <input type="number" placeholder="e.g. 82.5" value={weight}
                onChange={e => { setWeight(e.target.value); setSubmitted(false); }}
                style={{ ...inp, fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:30, letterSpacing:1, borderColor:weight?accent:border, textAlign:"center" }}/>
              <div style={{ fontSize:10, color:muted, textAlign:"center", marginTop:6 }}>in kilograms (kg)</div>
            </div>
            <div style={{ background:card, border:"1px solid rgba(167,139,250,.25)", borderRadius:16, padding:17, marginBottom:11, backdropFilter:"blur(10px)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:13, color:"#a78bfa", letterSpacing:1 }}>📏 BODY FAT CALCULATOR</div>
                <div style={{ fontSize:9, color:muted, background: isDark ? "rgba(167,139,250,.1)" : "rgba(167,139,250,.12)", padding:"3px 8px", borderRadius:99 }}>U.S. NAVY METHOD</div>
              </div>
              <div style={{ fontSize:11, color:muted, marginBottom:12 }}>Measure around the <b style={{ color:text }}>widest part of your belly</b> and <b style={{ color:text }}>neck below Adam's apple</b></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <label style={{ fontSize:10, color:muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Waist (cm)</label>
                  <input type="number" placeholder="e.g. 88" value={waist} onChange={e => { setWaist(e.target.value); setSubmitted(false); }} style={{ ...inp, borderColor:waist?"#a78bfa":border, textAlign:"center", fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:22 }}/>
                </div>
                <div>
                  <label style={{ fontSize:10, color:muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Neck (cm)</label>
                  <input type="number" placeholder="e.g. 38" value={neck} onChange={e => { setNeck(e.target.value); setSubmitted(false); }} style={{ ...inp, borderColor:neck?"#a78bfa":border, textAlign:"center", fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:22 }}/>
                </div>
              </div>
              {liveBF ? (
                <div style={{ padding:"14px 16px", borderRadius:12, textAlign:"center", background:`${liveBFCat.color}12`, border:`1px solid ${liveBFCat.color}35`, animation:"bfPulse .3s ease" }}>
                  <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>YOUR BODY FAT</div>
                  <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:44, color:liveBFCat.color, lineHeight:1 }}>{liveBF}<span style={{ fontSize:20 }}>%</span></div>
                  <div style={{ fontSize:13, color:liveBFCat.color, fontWeight:600, marginTop:3 }}>{liveBFCat.label}</div>
                  <div style={{ marginTop:10, height:6, borderRadius:99, overflow:"hidden", background: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)" }}>
                    <div style={{ height:"100%", width:`${liveBFCat.bar}%`, background:liveBFCat.color, borderRadius:99, transition:"width .5s ease" }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:muted, marginTop:4 }}>
                    <span>Essential</span><span>Athlete</span><span>Fitness</span><span>Accept.</span><span>Obese</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding:"12px", borderRadius:10, background: isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)", textAlign:"center", fontSize:12, color:muted }}>
                  {!profile.height ? "⚠️ Set your height in Settings first"
                    : (!waist && !neck) ? "Enter waist & neck to auto-calculate body fat %"
                    : waist && !neck ? "Now enter your neck measurement"
                    : !waist && neck ? "Now enter your waist measurement"
                    : "Waist must be greater than neck"}
                </div>
              )}
            </div>
            <button onClick={handleSubmit} disabled={!weight} style={{ width:"100%", padding:"15px", border:"none", borderRadius:14, background: weight ? "linear-gradient(135deg,#c2410c,#f97316)" : isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.07)", color: weight ? "#fff" : muted, fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:22, letterSpacing:3, cursor: weight ? "pointer" : "not-allowed", transition:"all .2s", boxShadow: weight ? "0 6px 24px rgba(249,115,22,.35)" : "none" }}>
              {submitted ? "✓ UPDATE CHECK-IN" : "SAVE CHECK-IN"}
            </button>
            {!todayComplete && (
              <div style={{ marginTop:8, textAlign:"center", fontSize:11, color:muted }}>
                Still needed: {[!photoSrc && "📷 Photo", !weight && "⚖️ Weight"].filter(Boolean).join(" • ")}
              </div>
            )}
          </div>
        )}

        {/* NUTRITION */}
{tab === "nutrition" && (
  <div style={{ animation:"fadeUp .3s ease" }}>
    <NutritionLogger
      isDark={isDark}
      accentColor="#f97316"
      onSave={async (data) => {
        const existing = logs.find(l => l.date === today);
        if (!existing) { showToast("Save your check-in first!", "⚠️", "#f87171"); return; }
        const updated = {
          ...existing,
          calories: data.calories,
          protein: data.protein,
          carbs: data.carbs,
          fat: data.fat,
          foodLog: data.foodLog,
        };
        await saveLog(updated);
        showToast("Nutrition saved! 🔥", "🔥", "#fbbf24");
      }}
    />
  </div>
)}
        {/* PREDICT */}
        {tab === "predict" && (
          <div style={{ animation:"fadeUp .3s ease", display:"flex", flexDirection:"column", gap:12 }}>
            {!prediction ? (
              <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:24, backdropFilter:"blur(10px)", textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>🔮</div>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:18, color:"#34d399", letterSpacing:1, marginBottom:8 }}>PREDICTION NOT READY YET</div>
                <div style={{ fontSize:12, color:muted, lineHeight:1.7 }}>Log at least <b style={{ color:text }}>1 check-in</b> with weight<br/>and <b style={{ color:text }}>1 calorie entry</b> in the 🍎 Nutrition tab</div>
              </div>
            ) : (() => {
              const { points, tdee, avgCal, dailyDeficit, weeklyFatLossKg, startWeight, startBF } = prediction;
              const isDeficit = dailyDeficit > 0;
              const goalWeight = profile.goal ? parseFloat(profile.goal) : null;
              const weeksToGoal = goalWeight && weeklyFatLossKg > 0 ? Math.ceil((startWeight - goalWeight) / weeklyFatLossKg) : null;
              const goalDate = weeksToGoal ? (() => { const d = new Date(); d.setDate(d.getDate() + weeksToGoal*7); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); })() : null;
              return (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    {[
                      { label:"Your TDEE",     val:`${tdee}`,                                sub:"kcal/day",     icon:"⚡", col:"#60a5fa" },
                      { label:"Avg Intake",    val:`${avgCal}`,                             sub:"kcal/day",     icon:"🍽️", col:"#fbbf24" },
                      { label:"Daily Deficit", val:`${Math.abs(Math.round(dailyDeficit))}`, sub:isDeficit?"deficit":"surplus", icon:isDeficit?"📉":"📈", col:isDeficit?"#34d399":"#f87171" },
                      { label:"Weekly Loss",   val:weeklyFatLossKg>0?`${weeklyFatLossKg.toFixed(2)}`:"0", sub:"kg/week", icon:"🔥", col:isDeficit?"#34d399":"#f87171" },
                    ].map((s,i) => (
                      <div key={i} style={{ background:card, border:`1px solid ${s.col}28`, borderRadius:12, padding:"13px 14px", backdropFilter:"blur(10px)" }}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                        <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:24, color:s.col, lineHeight:1 }}>{s.val}</div>
                        <div style={{ fontSize:10, color:muted, marginTop:3, textTransform:"uppercase", letterSpacing:.4 }}>{s.label}</div>
                        <div style={{ fontSize:9, color:muted, opacity:.7 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  {goalDate && weeklyFatLossKg > 0 && (
                    <div style={{ background:"linear-gradient(135deg,rgba(52,211,153,.12),rgba(16,185,129,.07))", border:"1px solid rgba(52,211,153,.3)", borderRadius:14, padding:"16px 18px", display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ fontSize:32 }}>🎯</div>
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:16, color:"#34d399", letterSpacing:1 }}>GOAL WEIGHT ESTIMATED BY</div>
                        <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:24, color:"#fff", marginTop:2 }}>{goalDate}</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginTop:2 }}>~{weeksToGoal} weeks • {goalWeight} kg goal</div>
                      </div>
                    </div>
                  )}
                  {!isDeficit && (
                    <div style={{ background:"rgba(248,113,113,.08)", border:"1px solid rgba(248,113,113,.25)", borderRadius:14, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ fontSize:28 }}>⚠️</div>
                      <div>
                        <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:"#f87171", letterSpacing:1 }}>YOU'RE IN A CALORIE SURPLUS</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginTop:2 }}>Eating {Math.abs(Math.round(dailyDeficit))} kcal above maintenance.</div>
                      </div>
                    </div>
                  )}
                  <div style={{ background:card, border:"1px solid rgba(52,211,153,.2)", borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:"#34d399", letterSpacing:1 }}>📈 PROJECTION</div>
                      <div style={{ display:"flex", gap:4 }}>
                        {[4,8,12,16].map(w => (
                          <button key={w} onClick={() => setPredWeeks(w)} style={{ padding:"3px 9px", border:"none", borderRadius:99, fontSize:10, fontWeight:700, cursor:"pointer", background: predWeeks===w ? "#34d399" : isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)", color: predWeeks===w ? "#000" : muted }}>{w}w</button>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={points} margin={{top:5,right:5,bottom:5,left:-20}}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark?"rgba(255,255,255,.04)":"rgba(0,0,0,.05)"}/>
                        <XAxis dataKey="date" tick={{fontSize:9,fill:muted}} tickLine={false} axisLine={false}/>
                        <YAxis tick={{fontSize:9,fill:muted}} tickLine={false} axisLine={false} domain={["auto","auto"]}/>
                        <Tooltip content={<PredictTooltip/>}/>
                        {goalWeight && <ReferenceLine y={goalWeight} stroke="#34d399" strokeDasharray="4 4" label={{value:"Goal",fill:"#34d399",fontSize:9,position:"right"}}/>}
                        <Line type="monotone" dataKey="predWeight" stroke="#34d399" strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="predWeight"/>
                        {startBF && <Line type="monotone" dataKey="predBF" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 4" dot={false} name="predBF"/>}
                      </LineChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop:8, padding:"8px 12px", background: isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)", borderRadius:8, fontSize:10, color:muted, textAlign:"center" }}>
                      ⚠️ Estimates only — actual results depend on metabolism & adherence
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* BODY FAT */}
        {tab === "bodyfat" && (
          <div style={{ animation:"fadeUp .3s ease", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:card, border:"1px solid rgba(167,139,250,.2)", borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:"#a78bfa", letterSpacing:1, marginBottom:3 }}>📊 BODY FAT % TREND</div>
              <div style={{ fontSize:11, color:muted, marginBottom:14 }}>Calculated daily via U.S. Navy Method</div>
              {bfChartData.length < 2 ? (
                <div style={{ textAlign:"center", padding:"40px 0", color:muted }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>📏</div>
                  <div style={{ fontSize:13 }}>Enter waist & neck in at least 2 check-ins</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={bfChartData} margin={{top:5,right:5,bottom:5,left:-22}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark?"rgba(255,255,255,.04)":"rgba(0,0,0,.05)"}/>
                    <XAxis dataKey="date" tick={{fontSize:9,fill:muted}} tickLine={false} axisLine={false}/>
                    <YAxis tick={{fontSize:9,fill:muted}} tickLine={false} axisLine={false} domain={["auto","auto"]} unit="%"/>
                    <Tooltip content={<BFTooltip/>}/>
                    <Line type="monotone" dataKey="bf" stroke="#a78bfa" strokeWidth={2.5} dot={{fill:"#a78bfa",r:3}} activeDot={{r:5}}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            {latestBF && (
              <div style={{ background:card, border:`1px solid ${latestBFCat.color}30`, borderRadius:16, padding:18, backdropFilter:"blur(10px)", textAlign:"center" }}>
                <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:1 }}>Latest Reading</div>
                <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:52, color:latestBFCat.color, lineHeight:1, marginTop:4 }}>{latestBF}<span style={{ fontSize:24 }}>%</span></div>
                <div style={{ fontSize:14, color:latestBFCat.color, fontWeight:600, marginTop:4 }}>{latestBFCat.label}</div>
                <div style={{ marginTop:12, height:8, borderRadius:99, overflow:"hidden", background: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)" }}>
                  <div style={{ height:"100%", width:`${latestBFCat.bar}%`, background:latestBFCat.color, borderRadius:99 }}/>
                </div>
              </div>
            )}
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:13, color:"#a78bfa", letterSpacing:1, marginBottom:10 }}>MALE BODY FAT REFERENCE</div>
              {[["Essential Fat","2–5%","#60a5fa"],["Athlete","6–13%","#34d399"],["Fitness","14–17%","#a78bfa"],["Acceptable","18–24%","#fbbf24"],["Obese","25%+","#f87171"]].map(([cat,range,col]) => (
                <div key={cat} className="row-item" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", fontSize:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:99, background:col, flexShrink:0 }}/>
                    <span style={{ fontWeight:600, color:col }}>{cat}</span>
                  </div>
                  <span style={{ color:muted }}>{range}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:accent, letterSpacing:1 }}>🗓 ALL CHECK-INS</div>
              {logs.length > 0 && <button onClick={exportCSV} style={{ padding:"6px 14px", background:"linear-gradient(135deg,#c2410c,#f97316)", border:"none", borderRadius:99, color:"#fff", fontSize:11, cursor:"pointer", fontWeight:700 }}>⬇ CSV</button>}
            </div>
            {sorted.length === 0 ? (
              <div style={{ textAlign:"center", padding:"50px 20px", color:muted }}>
                <div style={{ fontSize:40, marginBottom:10 }}>🗓</div>
                <div>No entries yet!</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {sorted.map((entry,i) => {
                  const prev = sorted[i+1];
                  const diff = prev ? (entry.weight - prev.weight).toFixed(1) : null;
                  return (
                    <div key={entry.date} style={{ background:card, border:`1px solid ${border}`, borderRadius:14, overflow:"hidden", backdropFilter:"blur(10px)" }}>
                      <div style={{ display:"flex" }}>
                        {entry.photo && <img src={entry.photo} alt="" style={{ width:78, objectFit:"cover", flexShrink:0 }}/>}
                        <div style={{ flex:1, padding:"12px 13px" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:20, color:accent, lineHeight:1 }}>
                                {entry.weight}<span style={{ fontSize:11, color:muted }}> kg</span>
                                {entry.bodyFat && <span style={{ fontSize:13, color:"#a78bfa", marginLeft:7 }}>{entry.bodyFat}%</span>}
                              </div>
                              <div style={{ fontSize:10, color:muted, marginTop:2 }}>{new Date(entry.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                              {entry.calories && <div style={{ fontSize:11, color:"#fbbf24", marginTop:3 }}>🔥 {entry.calories} kcal</div>}
                              {entry.photoCaption && <div style={{ fontSize:10, color:muted, fontStyle:"italic", marginTop:2 }}>"{entry.photoCaption}"</div>}
                            </div>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:5 }}>
                              {diff !== null && (
                                <div style={{ fontSize:11, fontWeight:700, color:parseFloat(diff)<0?"#34d399":"#fbbf24", background:parseFloat(diff)<0?"rgba(52,211,153,.1)":"rgba(251,191,36,.1)", padding:"3px 8px", borderRadius:99 }}>
                                  {parseFloat(diff) > 0 ? "+" : ""}{diff}
                                </div>
                              )}
                              <button onClick={() => deleteLog(entry.date)} style={{ background:"rgba(248,113,113,.1)", border:"1px solid rgba(248,113,113,.2)", borderRadius:8, color:"#f87171", padding:"4px 8px", cursor:"pointer", fontSize:11 }}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MILESTONES */}
        {tab === "milestones" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:accent, letterSpacing:1, marginBottom:12 }}>
              🏆 ACHIEVEMENTS — {earned.length}/{MILESTONES.length} EARNED
            </div>
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, overflow:"hidden", backdropFilter:"blur(10px)" }}>
              {MILESTONES.map(m => {
                const has = earned.includes(m.id);
                return (
                  <div key={m.id} className="row-item" style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px", opacity:has?1:.35, transition:"opacity .3s" }}>
                    <div style={{ width:44, height:44, borderRadius:12, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, background: has ? "linear-gradient(135deg,#c2410c,#f97316)" : isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.05)" }}>{m.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{m.label}</div>
                      <div style={{ fontSize:11, color:muted }}>{m.desc}</div>
                    </div>
                    {has && <div style={{ fontSize:16 }}>✅</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <div style={{ animation:"fadeUp .3s ease", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:accent, letterSpacing:1, marginBottom:14 }}>⚙️ YOUR PROFILE</div>
              <div style={{ marginBottom:12, padding:"11px 14px", background:"rgba(167,139,250,.08)", border:"1px solid rgba(167,139,250,.2)", borderRadius:10, fontSize:12, color:"#a78bfa" }}>
                <b>📏 Important:</b> Your height is needed to calculate body fat.
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, color:muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Height</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input type="number" placeholder={profile.unit==="cm"?"e.g. 178":"e.g. 70"} value={profile.height} onChange={e => saveProfile({...profile, height:e.target.value})} style={{ ...inp, flex:1 }}/>
                  <div style={{ display:"flex", gap:4 }}>
                    {["cm","in"].map(u => (
                      <button key={u} onClick={() => saveProfile({...profile, unit:u})} style={{ padding:"0 12px", border:"none", borderRadius:9, background: profile.unit===u ? "linear-gradient(135deg,#c2410c,#f97316)" : isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)", color: profile.unit===u ? "#fff" : muted, fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, cursor:"pointer" }}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:10, color:muted, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Goal Weight (kg)</label>
                <input type="number" placeholder="e.g. 75" value={profile.goal} onChange={e => saveProfile({...profile, goal:e.target.value})} style={inp}/>
              </div>
              {bmi && (
                <div style={{ marginTop:4, padding:"12px 16px", borderRadius:10, background:`${bmiCat.color}11`, border:`1px solid ${bmiCat.color}33` }}>
                  <div style={{ fontSize:10, color:muted, textTransform:"uppercase", letterSpacing:.5 }}>Current BMI</div>
                  <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:38, color:bmiCat.color, lineHeight:1 }}>{bmi}</div>
                  <div style={{ fontSize:12, color:bmiCat.color, marginTop:2 }}>{bmiCat.label}</div>
                </div>
              )}
            </div>
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:"#a78bfa", letterSpacing:1, marginBottom:8 }}>🔒 PIN</div>
              <div style={{ fontSize:12, color:muted }}>To change your PIN, update <code style={{ color:"#a78bfa", background:"rgba(167,139,250,.1)", padding:"2px 6px", borderRadius:4 }}>CORRECT_PIN</code> at the top of App.jsx and redeploy.</div>
            </div>
            <div style={{ background:card, border:`1px solid ${border}`, borderRadius:16, padding:18, backdropFilter:"blur(10px)" }}>
              <div style={{ fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:14, color:"#34d399", letterSpacing:1, marginBottom:12 }}>📤 EXPORT DATA</div>
              <button onClick={exportCSV} style={{ width:"100%", padding:"13px", border:"none", borderRadius:10, background:"linear-gradient(135deg,#059669,#34d399)", color:"#fff", fontFamily:"'Barlow Condensed'", fontWeight:800, fontSize:18, letterSpacing:2, cursor:"pointer" }}>⬇ DOWNLOAD CSV</button>
              <div style={{ marginTop:8, fontSize:11, color:muted, textAlign:"center" }}>{logs.length} entries synced to cloud ☁️</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}