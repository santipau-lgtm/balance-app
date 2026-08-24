/* Balance — standalone PWA, vanilla JS, IndexedDB storage, no backend. */
(function () {
"use strict";

/* ---------------------------- IndexedDB layer ---------------------------- */
const DB_NAME = "balance-db";
const STORE = "kv";
const KEY = "app-data";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* ------------------------------- constants ------------------------------- */
const DEFAULT_SPORTS = ["Caminar", "Correr", "Bicicleta", "Gimnasio/Fuerza", "Fútbol", "Pádel/Tenis", "Natación", "Otro"];
const LUNCH_OPTS = [{v:"ok",label:"OK",score:100},{v:"regular",label:"Regular",score:50},{v:"bad",label:"No adecuado",score:0}];
const DINNER_OPTS = [{v:"light",label:"Liviana",score:100},{v:"normal",label:"Normal",score:50},{v:"excessive",label:"Excesiva",score:0}];
const INTENSITY_OPTS = ["Baja","Media","Alta"];
const HYDRATION_OPTS = [{v:"good",label:"Buena",score:100},{v:"regular",label:"Regular",score:50},{v:"low",label:"Insuficiente",score:0}];
const SLEEP_OPTS = [{v:"good",label:"Bien",score:100},{v:"regular",label:"Regular",score:50},{v:"bad",label:"Mal",score:0}];
const PAIN_AREA_OPTS = ["Cabeza","Espalda","Cuello","Articulaciones","Muscular","Otro"].map(a=>({v:a,label:a}));
const COLORS = { food:"#E8A33D", sport:"#2FB8A0", physio:"#6C8CFF", weight:"#E8654A", bad:"#E05B4F", neutral:"#8B7FD6" };

/* -------------------------------- helpers -------------------------------- */
const pad = (n) => String(n).padStart(2,"0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());
const parseKey = (k) => { const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; };
const startOfWeek = (d) => { const nd=new Date(d); const day=(nd.getDay()+6)%7; nd.setDate(nd.getDate()-day); nd.setHours(0,0,0,0); return nd; };
const weekDates = (d) => { const s=startOfWeek(d); return Array.from({length:7},(_,i)=>addDays(s,i)); };
const fmtShort = (d) => d.toLocaleDateString("es-ES",{day:"2-digit",month:"short"});
function emptyEntry(){ return {lunch:null,dinner:null,sports:[],physio:null,weight:null,waist:null,hydration:null,sleep:{quality:null,hours:null},pain:{has:false,area:null,intensity:null,comment:""}}; }
function uid(){ return Math.random().toString(36).slice(2,9); }
function ageFromBirthDate(dateStr){
  if (!dateStr) return null;
  const b = new Date(dateStr+"T00:00:00");
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}
// General public-health reference bands for waist circumference by sex (WHO-style cutoffs).
// Informational only — not a diagnosis, and not personalized.
function waistReference(sex, waist){
  if (!sex || sex==="x" || waist==null) return null;
  const bands = sex==="m"
    ? [{max:94,label:"dentro del rango de referencia habitual"},{max:102,label:"por encima del rango de referencia habitual"},{max:Infinity,label:"considerablemente por encima del rango de referencia habitual"}]
    : [{max:80,label:"dentro del rango de referencia habitual"},{max:88,label:"por encima del rango de referencia habitual"},{max:Infinity,label:"considerablemente por encima del rango de referencia habitual"}];
  return bands.find(b => waist <= b.max).label;
}
function movingAvg(arr,w){ return arr.map((_,i)=>{ const s=Math.max(0,i-w+1); const slice=arr.slice(s,i+1).filter(v=>v!=null); if(!slice.length) return null; return slice.reduce((a,b)=>a+b,0)/slice.length; }); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -startOffset);
  const weeks = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) { row.push(cur); cur = addDays(cur, 1); }
    weeks.push(row);
    if (cur.getMonth() !== month && w >= 3 && cur.getDate() > 7) break;
  }
  return weeks;
}

/* ----------------------------- demo data ----------------------------- */
function generateDemoData(days=60){
  const entries = {};
  const today = new Date();
  let weight = 82.4, waist = 95.2;
  const sports = ["Caminar","Correr","Bicicleta","Gimnasio/Fuerza","Fútbol","Natación"];
  for (let i = days-1; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = dateKey(d);
    const dow = d.getDay();
    const lunchRoll = Math.random(), dinnerRoll = Math.random();
    const lunch = lunchRoll<0.55?"ok":lunchRoll<0.85?"regular":"bad";
    const dinner = dinnerRoll<0.5?"light":dinnerRoll<0.82?"normal":"excessive";
    const sportRoll = Math.random();
    const sportDone = dow===0 ? sportRoll<0.3 : sportRoll<0.55;
    const sportsArr = [];
    if (sportDone) {
      sportsArr.push({ id:uid(), type:sports[Math.floor(Math.random()*sports.length)], duration:[20,30,40,45,60][Math.floor(Math.random()*5)], calories:Math.round(150+Math.random()*400), intensity:INTENSITY_OPTS[Math.floor(Math.random()*3)], comment:"" });
      if (Math.random() < 0.12) {
        sportsArr.push({ id:uid(), type:sports[Math.floor(Math.random()*sports.length)], duration:[15,20,30][Math.floor(Math.random()*3)], calories:Math.round(80+Math.random()*200), intensity:INTENSITY_OPTS[Math.floor(Math.random()*3)], comment:"" });
      }
    }
    const physioDone = Math.random()<0.3;
    const physio = physioDone ? {done:true,duration:20,comment:""} : {done:false,duration:null,comment:""};
    const hydRoll = Math.random();
    const hydration = hydRoll<0.45?"good":hydRoll<0.8?"regular":"low";
    const sleepRoll = Math.random();
    const sleepQuality = sleepRoll<0.4?"good":sleepRoll<0.8?"regular":"bad";
    const sleepHours = i%2===0 ? Math.round((5.5+Math.random()*3)*2)/2 : null;
    const painRoll = Math.random();
    const pain = painRoll<0.12
      ? { has:true, area:PAIN_AREA_OPTS[Math.floor(Math.random()*(PAIN_AREA_OPTS.length-1))].v, intensity:INTENSITY_OPTS[Math.floor(Math.random()*3)], comment:"" }
      : { has:false, area:null, intensity:null, comment:"" };
    weight += (Math.random()-0.56)*0.15;
    waist += (Math.random()-0.54)*0.1;
    entries[k] = {
      lunch, dinner, sports: sportsArr, physio, hydration, sleep:{quality:sleepQuality, hours:sleepHours}, pain,
      weight: i%3===0 ? Math.round(weight*10)/10 : null,
      waist: i%9===0 ? Math.round(waist*10)/10 : null,
    };
  }
  return entries;
}
function defaultData(){
  return {
    isDemo: true,
    entries: generateDemoData(60),
    customSports: [],
    config: { weights:{food:50,sport:30,physio:20}, physioGoalEnabled:true, physioWeeklyGoal:2, theme:"system", goals:{weight:null, waist:null}, profile:{birthDate:null, sex:null} },
  };
}

/* -------------------------- migration (old data shapes) -------------------------- */
function migrateEntry(e){
  if (!e) return emptyEntry();
  const out = { ...emptyEntry(), ...e };
  if (!Array.isArray(e.sports)) {
    if (e.sport && e.sport.done) {
      out.sports = [{ id:uid(), type:e.sport.type||"", duration:e.sport.duration??null, calories:e.sport.calories??null, intensity:e.sport.intensity??null, comment:e.sport.comment||"" }];
    } else {
      out.sports = [];
    }
  }
  delete out.sport;
  return out;
}
function migrateData(data){
  if (!data) return defaultData();
  const entries = {};
  Object.keys(data.entries||{}).forEach((k) => { entries[k] = migrateEntry(data.entries[k]); });
  const config = { weights:{food:50,sport:30,physio:20}, physioGoalEnabled:true, physioWeeklyGoal:2, theme:"system", goals:{weight:null,waist:null}, profile:{birthDate:null,sex:null}, ...(data.config||{}) };
  config.goals = { weight:null, waist:null, ...(data.config?.goals||{}) };
  config.weights = { food:50, sport:30, physio:20, ...(data.config?.weights||{}) };
  config.profile = { birthDate:null, sex:null, ...(data.config?.profile||{}) };
  return { isDemo: !!data.isDemo, customSports: data.customSports||[], entries, config };
}

/* ---------------------------- adherence / stats ---------------------------- */
function computeWeekAdherence(entries, dates, config){
  const days = dates.map(d => entries[dateKey(d)] || null);
  const lunchScores = days.map(e => e&&e.lunch ? LUNCH_OPTS.find(o=>o.v===e.lunch).score : null).filter(v=>v!=null);
  const dinnerScores = days.map(e => e&&e.dinner ? DINNER_OPTS.find(o=>o.v===e.dinner).score : null).filter(v=>v!=null);
  const foodPool = [...lunchScores, ...dinnerScores];
  const foodScore = foodPool.length ? foodPool.reduce((a,b)=>a+b,0)/foodPool.length : null;
  const sportDoneDays = days.filter(e=>e&&e.sports&&e.sports.length>0).length;
  const sportScore = (sportDoneDays/7)*100;
  let physioScore = null;
  if (config.physioGoalEnabled) {
    const sessions = days.filter(e=>e&&e.physio&&e.physio.done).length;
    physioScore = Math.min(sessions/Math.max(1,config.physioWeeklyGoal),1)*100;
  }
  const parts = [];
  if (foodScore!=null) parts.push({score:foodScore, weight:config.weights.food});
  parts.push({score:sportScore, weight:config.weights.sport});
  if (physioScore!=null) parts.push({score:physioScore, weight:config.weights.physio});
  const totalWeight = parts.reduce((a,p)=>a+p.weight,0) || 1;
  const total = parts.reduce((a,p)=>a+(p.score*p.weight)/totalWeight,0);
  return { total: Math.round(total), foodScore, sportScore, physioScore, sportDoneDays };
}
function weekSummary(entries, dates){
  const days = dates.map(d => entries[dateKey(d)] || null);
  const lunchOk = days.filter(e=>e&&e.lunch==="ok").length;
  const dinnerLight = days.filter(e=>e&&e.dinner==="light").length;
  const sportDays = days.filter(e=>e&&e.sports&&e.sports.length>0).length;
  const minutes = days.reduce((a,e)=>a+((e&&e.sports)?e.sports.reduce((s,sp)=>s+(sp.duration||0),0):0),0);
  const calories = days.reduce((a,e)=>a+((e&&e.sports)?e.sports.reduce((s,sp)=>s+(sp.calories||0),0):0),0);
  const physioSessions = days.filter(e=>e&&e.physio&&e.physio.done).length;
  const weights = days.map(e=>e&&e.weight).filter(v=>v!=null);
  const waists = days.map(e=>e&&e.waist).filter(v=>v!=null);
  const hydrationGood = days.filter(e=>e&&e.hydration==="good").length;
  const sleepGood = days.filter(e=>e&&e.sleep&&e.sleep.quality==="good").length;
  const painDays = days.filter(e=>e&&e.pain&&e.pain.has).length;
  return { lunchOk, dinnerLight, sportDays, minutes, calories, physioSessions, hydrationGood, sleepGood, painDays,
    weightDelta: weights.length>=2 ? weights[weights.length-1]-weights[0] : null,
    waistDelta: waists.length>=2 ? waists[waists.length-1]-waists[0] : null,
  };
}
function computeStreaks(entries){
  const allKeys = Object.keys(entries).sort();
  if (!allKeys.length) return { current:0, best:0 };
  const sortedDates = allKeys.map(parseKey).sort((a,b)=>a-b);
  let bestStreak=0, run=0;
  for (const d of sortedDates){ const e=entries[dateKey(d)]; if(e&&e.sports&&e.sports.length>0){run++;bestStreak=Math.max(bestStreak,run);} else run=0; }
  let curStreak=0, cd=new Date();
  while(true){ const e=entries[dateKey(cd)]; if(e&&e.sports&&e.sports.length>0){curStreak++;cd=addDays(cd,-1);} else break; }
  return { current: curStreak, best: bestStreak };
}
function generateInsights(data){
  const insights = [];
  const entries = data.entries;
  const allKeys = Object.keys(entries).sort();
  if (allKeys.length < 7) return insights;
  const sortedDates = allKeys.map(parseKey).sort((a,b)=>a-b);
  const streaks = computeStreaks(entries);
  if (streaks.current>=3) insights.push(`Llevás ${streaks.current} días seguidos haciendo deporte.`);
  if (streaks.best>=4) insights.push(`Tu mejor racha de deporte fue de ${streaks.best} días consecutivos.`);
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const sumMin = (from,to) => sortedDates.filter(d=>d>=from&&d<to).reduce((a,d)=>{const e=entries[dateKey(d)]; return a+((e&&e.sports)?e.sports.reduce((s,sp)=>s+(sp.duration||0),0):0);},0);
  const thisM = sumMin(thisMonthStart, addDays(now,1));
  const lastM = sumMin(lastMonthStart, thisMonthStart);
  if (lastM>0){ const pct=Math.round(((thisM-lastM)/lastM)*100); if(Math.abs(pct)>=10) insights.push(`Tus minutos de actividad ${pct>0?"aumentaron":"disminuyeron"} un ${Math.abs(pct)}% respecto del mes anterior.`); }
  const knownWeights = sortedDates.map(d=>({d,w:entries[dateKey(d)]?.weight??null})).filter(x=>x.w!=null);
  if (knownWeights.length>=4){ const last6w=knownWeights.filter(x=>x.d>=addDays(now,-42)); if(last6w.length>=2){ const delta=last6w[last6w.length-1].w-last6w[0].w; if(Math.abs(delta)>=0.3) insights.push(`Tu peso ${delta<0?"descendió":"aumentó"} ${Math.abs(delta).toFixed(1)} kg en las últimas semanas.`); } }
  let withSport=[], withoutSport=[];
  for (let i=0;i<6;i++){ const wd=weekDates(addDays(now,-7*i)); const adh=computeWeekAdherence(entries,wd,data.config); if(adh.foodScore==null) continue; if(adh.sportDoneDays>=3) withSport.push(adh.foodScore); else withoutSport.push(adh.foodScore); }
  if (withSport.length>=2 && withoutSport.length>=2){ const avg=a=>a.reduce((x,y)=>x+y,0)/a.length; if(avg(withSport)-avg(withoutSport)>=10) insights.push("En las semanas en las que hiciste deporte al menos tres veces también registraste mayor adherencia alimentaria."); }
  return insights.slice(0,4);
}

/* --------------------------------- state --------------------------------- */
let DATA = null;
let VIEW = "today";
let CAL_CURSOR = new Date();
let CAL_MODE = "month";
let EVO_RANGE = 30;
let MODAL_DATE = null;
let saveTimer = null;

let pendingSave = false;
function persist(){
  pendingSave = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
}
function flushSave(){
  if (!pendingSave) return;
  clearTimeout(saveTimer);
  pendingSave = false;
  idbSet(KEY, DATA).catch((e) => console.error("save failed", e));
}
// Safety net: if the app is backgrounded, closed, or loses focus before the
// debounce timer fires, flush immediately so nothing typed gets lost.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
window.addEventListener("pagehide", flushSave);
window.addEventListener("blur", flushSave);
function updateEntry(key, patch){
  const cur = DATA.entries[key] || emptyEntry();
  DATA.entries[key] = { ...emptyEntry(), ...cur, ...patch };
  persist();
}
function applyTheme(){
  const theme = DATA.config.theme;
  const dark = theme==="dark" || (theme==="system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name=theme-color]:not([media])');
}

/* ---------------------------------- boot ---------------------------------- */
async function boot(){
  let stored = null;
  try { stored = await idbGet(KEY); } catch(e){ console.error(e); }
  DATA = migrateData(stored || defaultData());
  if (!stored) await idbSet(KEY, DATA);
  applyTheme();
  render();
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { applyTheme(); });
  }
}

/* --------------------------------- render --------------------------------- */
const app = document.getElementById("app");

function render(){
  applyTheme();
  const sportsList = [...DEFAULT_SPORTS.slice(0,-1), ...DATA.customSports, "Otro"];
  let html = `<div class="page">`;
  if (VIEW === "today") html += renderToday(sportsList);
  else if (VIEW === "calendar") html += renderCalendar();
  else if (VIEW === "evolution") html += renderEvolution();
  else if (VIEW === "settings") html += renderSettings();
  html += `</div>`;
  html += renderNav();
  app.innerHTML = html;
  if (MODAL_DATE) renderModal(sportsList);
  attachHandlers(sportsList);
  if (VIEW === "evolution") drawCharts();
}

function ringSVG(score, size=56){
  const r = size/2-5, c=2*Math.PI*r, offset = c - (Math.max(0,Math.min(100,score))/100)*c;
  const color = score>=70?COLORS.sport:score>=40?COLORS.food:COLORS.bad;
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="#8883" stroke-width="5" fill="none"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="${color}" stroke-width="5" fill="none"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
        transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg><div class="num">${score}</div></div>`;
}

function tripleRingSVG(adh, size=64){
  const sw = size*0.095;
  const rings = [
    { score: adh.foodScore, color: COLORS.food, r: size/2 - sw*0.9 },
    { score: adh.sportScore, color: COLORS.sport, r: size/2 - sw*2.3 },
    { score: adh.physioScore, color: COLORS.physio, r: size/2 - sw*3.7 },
  ];
  const circles = rings.map((ring) => {
    const c = 2*Math.PI*ring.r;
    const track = `<circle cx="${size/2}" cy="${size/2}" r="${ring.r}" stroke="#8883" stroke-width="${sw}" fill="none"/>`;
    if (ring.score == null) return track;
    const offset = c - (Math.max(0,Math.min(100,ring.score))/100)*c;
    return track + `<circle cx="${size/2}" cy="${size/2}" r="${ring.r}" stroke="${ring.color}" stroke-width="${sw}" fill="none"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>`;
  }).join("");
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}">${circles}</svg>
    <div class="num">${adh.total}</div></div>`;
}

function chipRowHTML(options, value, group, colorFn, includeUnset){
  let inner = options.map(o => {
    const active = value===o.v;
    const c = colorFn(o.v);
    return `<button class="chip${active?" active":""}" data-chip="${group}" data-val="${o.v}" style="${active?`background:${c};border-color:${c};`:""}">${o.label}</button>`;
  }).join("");
  if (includeUnset) {
    const active = value==null;
    inner += `<button class="chip${active?" active":""}" data-chip="${group}" data-val="__unset__" style="${active?"background:#8886;border-color:transparent;":""}">Sin registrar</button>`;
  }
  return `<div class="chip-row">${inner}</div>`;
}

function sportSessionHTML(sp, idx, sportsList, prefix){
  const base = `${prefix}.sports.${idx}`;
  return `
    <div style="background:var(--card-alt);border-radius:16px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:flex-end;margin-bottom:2px;">
        <button data-remove-sport-idx="${prefix}|${idx}" style="background:none;border:none;color:var(--sub);font-size:12px;padding:2px 4px;">Quitar ✕</button>
      </div>
      <select data-field="${base}.type">${sportsList.map(s=>`<option value="${esc(s)}" ${sp.type===s?"selected":""}>${esc(s)}</option>`).join("")}</select>
      <div class="row-gap">
        <div class="num-field"><input type="number" inputmode="numeric" data-field="${base}.duration" value="${sp.duration??""}" placeholder="0"/><span>min</span></div>
        <div class="num-field"><input type="number" inputmode="numeric" data-field="${base}.calories" value="${sp.calories??""}" placeholder="0"/><span>kcal</span></div>
      </div>
      <div class="intensity-row">${INTENSITY_OPTS.map(i=>`<button class="intensity-chip${sp.intensity===i?" active":""}" data-intensity="${base}" data-val="${i}">${i}</button>`).join("")}</div>
      <input class="text-field" style="margin-top:8px;" data-field="${base}.comment" value="${esc(sp.comment||"")}" placeholder="Comentario (opcional)"/>
    </div>
  `;
}
function physioFieldsHTML(physio, prefix){
  return `<div class="row-gap" style="align-items:center;">
    <div class="num-field" style="max-width:100px;"><input type="number" inputmode="numeric" data-field="${prefix}.duration" value="${physio.duration??""}" placeholder="0"/><span>min</span></div>
    <input class="text-field" data-field="${prefix}.comment" value="${esc(physio.comment||"")}" placeholder="Comentario (opcional)"/>
  </div>`;
}

function healthCardsHTML(entry, prefix){
  const sleep = entry.sleep || { quality:null, hours:null };
  const pain = entry.pain || { has:false, area:null, intensity:null, comment:"" };
  return `
    <div class="card">
      <div class="card-head"><h3>Hidratación</h3></div>
      ${chipRowHTML(HYDRATION_OPTS, entry.hydration, prefix+".hydration", v => v==="good"?COLORS.sport:v==="regular"?COLORS.food:COLORS.bad, true)}
    </div>
    <div class="card">
      <div class="card-head"><h3>Sueño</h3></div>
      ${chipRowHTML(SLEEP_OPTS, sleep.quality, prefix+".sleep.quality", v => v==="good"?COLORS.sport:v==="regular"?COLORS.food:COLORS.bad, true)}
      <div class="num-field" style="max-width:130px;margin-top:8px;"><input type="number" inputmode="decimal" step="0.5" data-field="${prefix}.sleep.hours" value="${sleep.hours??""}" placeholder="0"/><span>hs dormidas</span></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Dolor</h3><button class="mark-btn${pain.has?" active":""}" style="${pain.has?`background:${COLORS.neutral};border-color:${COLORS.neutral};`:`border-color:${COLORS.neutral};color:${COLORS.neutral};`}" data-toggle-pain="${prefix}">${pain.has?"Sí":"Marcar"}</button></div>
      ${pain.has ? `
        ${chipRowHTML(PAIN_AREA_OPTS, pain.area, prefix+".pain.area", () => COLORS.neutral, false)}
        <div class="intensity-row" style="margin-top:8px;">${INTENSITY_OPTS.map(i=>`<button class="intensity-chip${pain.intensity===i?" active":""}" data-intensity="${prefix}.pain" data-val="${i}">${i}</button>`).join("")}</div>
        <input class="text-field" style="margin-top:8px;" data-field="${prefix}.pain.comment" value="${esc(pain.comment||"")}" placeholder="Comentario (opcional)"/>
      ` : `<p class="small">Sin dolor registrado.</p>`}
    </div>
  `;
}

function dayFormHTML(entry, sportsList, prefix){
  const sports = entry.sports || [];
  const physio = entry.physio || {done:false,duration:null,comment:""};
  return `
    <div class="card">
      <div class="card-head"><h3>Almuerzo</h3></div>
      ${chipRowHTML(LUNCH_OPTS, entry.lunch, prefix+".lunch", v => v==="ok"?COLORS.sport:v==="regular"?COLORS.food:COLORS.bad, true)}
    </div>
    <div class="card">
      <div class="card-head"><h3>Cena</h3></div>
      ${chipRowHTML(DINNER_OPTS, entry.dinner, prefix+".dinner", v => v==="light"?COLORS.sport:v==="normal"?COLORS.food:COLORS.bad, true)}
    </div>
    <div class="card">
      <div class="card-head"><h3>Deporte${sports.length?` (${sports.length})`:""}</h3><button class="mark-btn active" data-add-sport="${prefix}">+ Agregar</button></div>
      ${sports.length ? sports.map((sp,idx)=>sportSessionHTML(sp,idx,sportsList,prefix)).join("") : `<p class="small">Sin actividad registrada.</p>`}
    </div>
    <div class="card">
      <div class="card-head"><h3>Fisioterapia</h3><button class="mark-btn physio${physio.done?" active":""}" data-toggle-physio="${prefix}">${physio.done?"Hecho":"Marcar"}</button></div>
      ${physio.done ? physioFieldsHTML(physio, prefix+".physio") : ""}
    </div>
    ${healthCardsHTML(entry, prefix)}
    <div class="card">
      <div class="card-head"><h3>Mediciones</h3></div>
      <div class="meas-grid">
        <div><label class="field-label">Peso (kg)</label><input class="big-input" type="number" inputmode="decimal" step="0.1" data-field="${prefix}.weight" value="${entry.weight??""}" placeholder="—"/></div>
        <div><label class="field-label">Cintura (cm)</label><input class="big-input" type="number" inputmode="decimal" step="0.1" data-field="${prefix}.waist" value="${entry.waist??""}" placeholder="—"/></div>
      </div>
    </div>
  `;
}

function renderToday(sportsList){
  const k = todayKey();
  const entry = DATA.entries[k] || emptyEntry();
  const dates = weekDates(new Date());
  const adh = computeWeekAdherence(DATA.entries, dates, DATA.config);
  const s = weekSummary(DATA.entries, dates);
  const prev = weekSummary(DATA.entries, weekDates(addDays(new Date(),-7)));
  const insights = generateInsights(DATA);
  const streaks = computeStreaks(DATA.entries);

  return `
    <div class="head-row">
      <div><h1 class="title">Hoy</h1><p class="subtitle">${new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"})}</p></div>
      ${tripleRingSVG(adh, 64)}
    </div>
    <div class="ring-legend">
      <span><i style="background:${COLORS.food}"></i>Alimentación</span>
      <span><i style="background:${COLORS.sport}"></i>Deporte</span>
      <span><i style="background:${COLORS.physio}"></i>Fisioterapia</span>
    </div>
    ${streaks.current>0 ? `<div class="streak-badge">🔥 ${streaks.current} día${streaks.current===1?"":"s"} seguido${streaks.current===1?"":"s"} con deporte</div>` : ""}
    ${DATA.isDemo ? `<div class="demo-banner">Estás viendo datos de demostración. Andá a Ajustes para borrarlos y empezar con los tuyos.</div>` : ""}
    ${dayFormHTML(entry, sportsList, "today")}
    <div class="card">
      <div class="card-head"><h3>Esta semana</h3></div>
      <div class="summary-row"><span>Almuerzos OK</span><span><b>${s.lunchOk}/7</b><span class="prev">(sem. ant. ${prev.lunchOk}/7)</span></span></div>
      <div class="summary-row"><span>Cenas livianas</span><span><b>${s.dinnerLight}/7</b><span class="prev">(sem. ant. ${prev.dinnerLight}/7)</span></span></div>
      <div class="summary-row"><span>Deporte</span><span><b>${s.sportDays} días</b><span class="prev">(sem. ant. ${prev.sportDays})</span></span></div>
      <div class="summary-row"><span>Actividad</span><span><b>${s.minutes} min</b><span class="prev">(sem. ant. ${prev.minutes})</span></span></div>
      <div class="summary-row"><span>Calorías</span><span><b>${s.calories} kcal</b><span class="prev">(sem. ant. ${prev.calories})</span></span></div>
      <div class="summary-row"><span>Fisioterapia</span><span><b>${s.physioSessions} ses.</b><span class="prev">(sem. ant. ${prev.physioSessions})</span></span></div>
      ${s.weightDelta!=null ? `<div class="summary-row"><span>Peso</span><span><b>${s.weightDelta>=0?"+":""}${s.weightDelta.toFixed(1)} kg</b></span></div>`:""}
      ${s.waistDelta!=null ? `<div class="summary-row"><span>Cintura</span><span><b>${s.waistDelta>=0?"+":""}${s.waistDelta.toFixed(1)} cm</b></span></div>`:""}
      <div class="summary-row"><span>Hidratación buena</span><span><b>${s.hydrationGood}/7</b><span class="prev">(sem. ant. ${prev.hydrationGood}/7)</span></span></div>
      <div class="summary-row"><span>Sueño bueno</span><span><b>${s.sleepGood}/7</b><span class="prev">(sem. ant. ${prev.sleepGood}/7)</span></span></div>
      ${s.painDays>0 ? `<div class="summary-row"><span>Días con dolor</span><span><b>${s.painDays}/7</b></span></div>`:""}
    </div>
    ${insights.length ? `<div class="card"><div class="card-head"><h3>Observaciones</h3></div>${insights.map(i=>`<div class="insight-item"><span class="dot">•</span><span>${esc(i)}</span></div>`).join("")}</div>` : ""}
  `;
}

function renderCalendar(){
  const toggle = `<div class="range-toggle" style="margin-bottom:12px;">${[["month","Mes"],["week","Semana"]].map(([v,l])=>`<button data-cal-mode="${v}" class="${CAL_MODE===v?"active":""}">${l}</button>`).join("")}</div>`;
  return toggle + (CAL_MODE === "week" ? renderCalendarWeek() : renderCalendarMonth());
}

function renderCalendarMonth(){
  const weeks = monthMatrix(CAL_CURSOR.getFullYear(), CAL_CURSOR.getMonth());
  const monthLabel = CAL_CURSOR.toLocaleDateString("es-ES",{month:"long",year:"numeric"});
  const dows = ["L","M","X","J","V","S","D"];
  let grid = `<div class="cal-grid">` + dows.map(d=>`<div class="cal-dow">${d}</div>`).join("");
  weeks.forEach(row => {
    row.forEach(d => {
      const k = dateKey(d);
      const inMonth = d.getMonth()===CAL_CURSOR.getMonth();
      const e = DATA.entries[k];
      const isToday = k===todayKey();
      let dots = "";
      if (e?.lunch) dots += `<div class="dot-sm" style="background:${e.lunch==="ok"?COLORS.sport:e.lunch==="regular"?COLORS.food:COLORS.bad}"></div>`;
      if (e?.dinner) dots += `<div class="dot-sm" style="background:${e.dinner==="light"?COLORS.sport:e.dinner==="normal"?COLORS.food:COLORS.bad}"></div>`;
      if (e?.sports?.length) dots += `<div class="dot-sm" style="background:${COLORS.sport}"></div>`;
      if (e?.physio?.done) dots += `<div class="dot-sm" style="background:${COLORS.physio}"></div>`;
      if (e?.weight!=null || e?.waist!=null) dots += `<div class="dot-sm" style="background:${COLORS.weight}"></div>`;
      if (e?.pain?.has) dots += `<div class="dot-sm" style="background:${COLORS.neutral}"></div>`;
      grid += `<button class="cal-day${inMonth?"":" out"}${isToday?" today":""}" data-day="${k}"><span class="n">${d.getDate()}</span><div class="dots">${dots}</div></button>`;
    });
  });
  grid += `</div>`;
  return `
    <div class="cal-head"><button data-cal-nav="-1">‹</button><h2 style="text-transform:capitalize;font-size:17px;font-weight:700;">${monthLabel}</h2><button data-cal-nav="1">›</button></div>
    <div class="card">${grid}</div>
    <div class="legend">
      <div class="li"><div class="sw" style="background:${COLORS.sport}"></div>Deporte</div>
      <div class="li"><div class="sw" style="background:${COLORS.physio}"></div>Fisio</div>
      <div class="li"><div class="sw" style="background:${COLORS.weight}"></div>Medición</div>
      <div class="li"><div class="sw" style="background:${COLORS.neutral}"></div>Dolor</div>
    </div>
  `;
}

function renderCalendarWeek(){
  const dates = weekDates(CAL_CURSOR);
  const label = `${fmtShort(dates[0])} – ${fmtShort(dates[6])}`;
  const dayNames = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const rows = dates.map((d,i) => {
    const k = dateKey(d);
    const e = DATA.entries[k];
    const isToday = k === todayKey();
    const lunchLabel = e?.lunch ? LUNCH_OPTS.find(o=>o.v===e.lunch)?.label : "—";
    const dinnerLabel = e?.dinner ? DINNER_OPTS.find(o=>o.v===e.dinner)?.label : "—";
    const sportLabel = e?.sports?.length ? e.sports.map(sp=>sp.type).join(", ") : "—";
    const physioLabel = e?.physio?.done ? `${e.physio.duration??"?"} min` : "—";
    const measParts = [e?.weight!=null?`${e.weight} kg`:null, e?.waist!=null?`${e.waist} cm`:null].filter(Boolean);
    const measLabel = measParts.length ? measParts.join(" · ") : "—";
    return `
      <button class="week-day-row${isToday?" today":""}" data-day="${k}">
        <div class="week-day-head"><span class="wd-name">${dayNames[i]}</span><span class="wd-date">${d.getDate()}</span></div>
        <div class="wd-line"><span class="wd-label">Almuerzo</span><span>${lunchLabel}</span></div>
        <div class="wd-line"><span class="wd-label">Cena</span><span>${dinnerLabel}</span></div>
        <div class="wd-line"><span class="wd-label">Deporte</span><span>${esc(sportLabel)}</span></div>
        <div class="wd-line"><span class="wd-label">Fisio</span><span>${physioLabel}</span></div>
        <div class="wd-line"><span class="wd-label">Mediciones</span><span>${measLabel}</span></div>
      </button>`;
  }).join("");
  return `
    <div class="cal-head"><button data-cal-nav="-1">‹</button><h2 style="font-size:15px;font-weight:700;">${label}</h2><button data-cal-nav="1">›</button></div>
    <div class="week-list">${rows}</div>
  `;
}

function renderModal(sportsList){
  const entry = DATA.entries[MODAL_DATE] || emptyEntry();
  const label = parseKey(MODAL_DATE).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <div class="modal-sheet">
      <div class="modal-head"><h2 style="text-transform:capitalize;font-size:17px;font-weight:700;">${label}</h2><button id="modal-close">✕</button></div>
      ${dayFormHTML(entry, sportsList, "modal")}
    </div>`;
  app.appendChild(wrap);
}

function sportDistributionHTML(dates, entries){
  const counts = {};
  dates.forEach((d) => { (entries[dateKey(d)]?.sports||[]).forEach((sp) => { counts[sp.type] = (counts[sp.type]||0)+1; }); });
  const items = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!items.length) return `<p class="small">Todavía no hay actividades registradas en este período.</p>`;
  const max = items[0][1];
  const palette = ["#2FB8A0","#E8A33D","#6C8CFF","#E05B4F","#8B7FD6","#4FC1E9","#B8A398"];
  return `<div style="margin-top:10px;">${items.map(([name,count],i) => `
    <div class="dist-row">
      <span class="dist-label">${esc(name)}</span>
      <div class="dist-bar-track"><div class="dist-bar-fill" style="width:${(count/max)*100}%;background:${palette[i%palette.length]}"></div></div>
      <span class="dist-count">${count}</span>
    </div>`).join("")}</div>`;
}

function renderEvolution(){
  const dates = [];
  for (let i=EVO_RANGE-1;i>=0;i--) dates.push(addDays(new Date(),-i));
  const weightSeries = dates.map(d=>DATA.entries[dateKey(d)]?.weight ?? null);
  const waistSeries = dates.map(d=>DATA.entries[dateKey(d)]?.waist ?? null);
  const knownW = weightSeries.filter(v=>v!=null);
  const knownC = waistSeries.filter(v=>v!=null);
  const lastW = knownW[knownW.length-1] ?? null, firstW = knownW[0] ?? null;
  const lastC = knownC[knownC.length-1] ?? null, firstC = knownC[0] ?? null;

  const weeksInRange = Math.max(1, Math.round(EVO_RANGE/7));
  const sportDaysInRange = dates.filter(d=>(DATA.entries[dateKey(d)]?.sports||[]).length>0).length;
  const totalMinutes = dates.reduce((a,d)=>a+((DATA.entries[dateKey(d)]?.sports||[]).reduce((s,sp)=>s+(sp.duration||0),0)),0);
  const totalCalories = dates.reduce((a,d)=>a+((DATA.entries[dateKey(d)]?.sports||[]).reduce((s,sp)=>s+(sp.calories||0),0)),0);
  const physioSessions = dates.filter(d=>DATA.entries[dateKey(d)]?.physio?.done).length;
  const physioMinutes = dates.reduce((a,d)=>a+(DATA.entries[dateKey(d)]?.physio?.done?(DATA.entries[dateKey(d)].physio.duration||0):0),0);
  const physioGoalTotal = DATA.config.physioGoalEnabled ? DATA.config.physioWeeklyGoal*weeksInRange : null;
  const goals = DATA.config.goals || {};
  const weightGoalNote = (goals.weight!=null && lastW!=null) ? `Meta: ${goals.weight} kg (${Math.abs(lastW-goals.weight).toFixed(1)} kg ${lastW>goals.weight?"por encima":lastW<goals.weight?"por debajo":"— ¡cumplida!"})` : (goals.weight!=null ? `Meta: ${goals.weight} kg` : "");
  const waistGoalNote = (goals.waist!=null && lastC!=null) ? `Meta: ${goals.waist} cm (${Math.abs(lastC-goals.waist).toFixed(1)} cm ${lastC>goals.waist?"por encima":lastC<goals.waist?"por debajo":"— ¡cumplida!"})` : (goals.waist!=null ? `Meta: ${goals.waist} cm` : "");
  const profile = DATA.config.profile || {};
  const waistRef = waistReference(profile.sex, lastC);

  const hydGoodDays = dates.filter(d=>DATA.entries[dateKey(d)]?.hydration==="good").length;
  const sleepGoodDays = dates.filter(d=>DATA.entries[dateKey(d)]?.sleep?.quality==="good").length;
  const sleepHoursKnown = dates.map(d=>DATA.entries[dateKey(d)]?.sleep?.hours).filter(v=>v!=null);
  const avgSleepHours = sleepHoursKnown.length ? (sleepHoursKnown.reduce((a,b)=>a+b,0)/sleepHoursKnown.length) : null;
  const painDaysInRange = dates.filter(d=>DATA.entries[dateKey(d)]?.pain?.has).length;

  return `
    <div class="head-row"><h1 class="title" style="margin-bottom:0;">Evolución</h1>
      <div class="range-toggle">${[7,30,90].map(r=>`<button data-range="${r}" class="${EVO_RANGE===r?"active":""}">${r}d</button>`).join("")}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Peso</h3></div>
      <div class="weight-row"><span>Último: <b>${lastW!=null?lastW+" kg":"—"}</b></span><span>Variación: <b>${(firstW!=null&&lastW!=null)?((lastW-firstW>=0?"+":"")+(lastW-firstW).toFixed(1)+" kg"):"—"}</b></span></div>
      ${weightGoalNote?`<p class="legend-note" style="margin-top:-4px;">${weightGoalNote}</p>`:""}
      <canvas class="chart" id="chart-weight" height="160"></canvas>
      <p class="legend-note">Línea sólida: peso · línea punteada: promedio móvil de 7 días</p>
    </div>
    <div class="card">
      <div class="card-head"><h3>Cintura</h3></div>
      <div class="weight-row"><span>Última: <b>${lastC!=null?lastC+" cm":"—"}</b></span><span>Variación: <b>${(firstC!=null&&lastC!=null)?((lastC-firstC>=0?"+":"")+(lastC-firstC).toFixed(1)+" cm"):"—"}</b></span></div>
      ${waistGoalNote?`<p class="legend-note" style="margin-top:-4px;">${waistGoalNote}</p>`:""}
      ${waistRef?`<p class="legend-note">Referencia general por sexo: ${waistRef}. No es un diagnóstico.</p>`:""}
      <canvas class="chart" id="chart-waist" height="140"></canvas>
    </div>
    <div class="card">
      <div class="card-head"><h3>Adherencia semanal (últimas 8 semanas)</h3></div>
      <canvas class="chart" id="chart-adh" height="140"></canvas>
    </div>
    <div class="card">
      <div class="card-head"><h3>Deporte</h3></div>
      <div class="stat-grid">
        <div class="stat-box"><div class="l">Días activos</div><div class="v">${sportDaysInRange}</div></div>
        <div class="stat-box"><div class="l">Min. totales</div><div class="v">${totalMinutes}</div></div>
        <div class="stat-box"><div class="l">Calorías</div><div class="v">${totalCalories}</div></div>
        <div class="stat-box"><div class="l">Días/semana</div><div class="v">${(sportDaysInRange/weeksInRange).toFixed(1)}</div></div>
      </div>
      ${sportDistributionHTML(dates, DATA.entries)}
    </div>
    <div class="card">
      <div class="card-head"><h3>Bienestar</h3></div>
      <div class="stat-grid">
        <div class="stat-box"><div class="l">Hidratación buena</div><div class="v">${hydGoodDays}/${dates.length}</div></div>
        <div class="stat-box"><div class="l">Sueño bueno</div><div class="v">${sleepGoodDays}/${dates.length}</div></div>
        <div class="stat-box"><div class="l">Prom. horas sueño</div><div class="v">${avgSleepHours!=null?avgSleepHours.toFixed(1):"—"}</div></div>
        <div class="stat-box"><div class="l">Días con dolor</div><div class="v">${painDaysInRange}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Fisioterapia</h3></div>
      <div class="stat-grid">
        <div class="stat-box"><div class="l">Sesiones</div><div class="v">${physioSessions}</div></div>
        <div class="stat-box"><div class="l">Minutos</div><div class="v">${physioMinutes}</div></div>
        ${physioGoalTotal!=null?`<div class="stat-box"><div class="l">Objetivo periodo</div><div class="v">${physioSessions}/${physioGoalTotal}</div></div>`:""}
      </div>
    </div>
  `;
}

function drawLineChart(canvas, series, opts){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight || parseInt(canvas.getAttribute("height"));
  canvas.width = w*dpr; canvas.height = h*dpr;
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  const allVals = series.flatMap(s=>s.data.filter(v=>v!=null));
  if (opts.refLine!=null) allVals.push(opts.refLine);
  if (!allVals.length){ ctx.fillStyle = opts.sub||"#999"; ctx.font="12px sans-serif"; ctx.fillText("Sin datos suficientes", 8, h/2); return; }
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const pad = (max-min)*0.15 || 1;
  const yMin = min-pad, yMax = max+pad;
  const n = series[0].data.length;
  const left=30, right=6, top=8, bottom=8;
  const x = (i) => left + (i/(n-1||1))*(w-left-right);
  const y = (v) => top + (1-((v-yMin)/((yMax-yMin)||1)))*(h-top-bottom);
  ctx.strokeStyle = opts.grid || "#eee"; ctx.lineWidth=1;
  for (let g=0; g<=3; g++){ const gy = top + (g/3)*(h-top-bottom); ctx.beginPath(); ctx.moveTo(left,gy); ctx.lineTo(w-right,gy); ctx.stroke(); }
  ctx.fillStyle = opts.axis || "#999"; ctx.font="10px -apple-system,sans-serif"; ctx.textAlign="right";
  ctx.fillText(yMax.toFixed(1), left-4, top+8);
  ctx.fillText(yMin.toFixed(1), left-4, h-bottom);
  if (opts.refLine!=null) {
    const ry = y(opts.refLine);
    ctx.strokeStyle = opts.refColor || "#8B7FD6"; ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(w-right, ry); ctx.stroke();
    ctx.setLineDash([]);
  }
  series.forEach(s => {
    ctx.beginPath();
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width||2;
    if (s.dashed) ctx.setLineDash([4,3]); else ctx.setLineDash([]);
    let started=false;
    s.data.forEach((v,i) => { if(v==null) return; const px=x(i), py=y(v); if(!started){ctx.moveTo(px,py);started=true;} else ctx.lineTo(px,py); });
    ctx.stroke();
    ctx.setLineDash([]);
  });
}
function drawBarChart(canvas, labels, values, colorFn, opts){
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight || parseInt(canvas.getAttribute("height"));
  canvas.width = w*dpr; canvas.height = h*dpr; ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,w,h);
  const left=26, right=6, top=8, bottom=18;
  const bw = (w-left-right)/values.length;
  ctx.fillStyle = opts.axis||"#999"; ctx.font="10px -apple-system,sans-serif"; ctx.textAlign="center";
  values.forEach((v,i) => {
    const bh = ((h-top-bottom)*Math.max(0,Math.min(100,v)))/100;
    const bx = left + i*bw + bw*0.15, bw2 = bw*0.7;
    ctx.fillStyle = colorFn(v);
    const by = h-bottom-bh;
    const r = Math.min(6, bw2/2);
    ctx.beginPath();
    ctx.moveTo(bx, h-bottom);
    ctx.lineTo(bx, by+r);
    ctx.arcTo(bx, by, bx+r, by, r);
    ctx.lineTo(bx+bw2-r, by);
    ctx.arcTo(bx+bw2, by, bx+bw2, by+r, r);
    ctx.lineTo(bx+bw2, h-bottom);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = opts.axis||"#999";
    ctx.fillText(labels[i], bx+bw2/2, h-4);
  });
}
function drawCharts(){
  const dates = [];
  for (let i=EVO_RANGE-1;i>=0;i--) dates.push(addDays(new Date(),-i));
  const weightSeries = dates.map(d=>DATA.entries[dateKey(d)]?.weight ?? null);
  const waistSeries = dates.map(d=>DATA.entries[dateKey(d)]?.waist ?? null);
  const weightMA = movingAvg(weightSeries,7);
  const dark = document.documentElement.classList.contains("dark");
  const grid = dark?"#2a2a2a":"#eee", axis = dark?"#888":"#999";

  const wc = document.getElementById("chart-weight");
  if (wc) drawLineChart(wc, [
    {data:weightSeries, color:COLORS.weight, width:1.5},
    {data:weightMA, color:COLORS.sport, width:2, dashed:false},
  ], {grid,axis,refLine:DATA.config.goals?.weight ?? null});

  const cc = document.getElementById("chart-waist");
  if (cc) drawLineChart(cc, [{data:waistSeries, color:COLORS.physio, width:2}], {grid,axis,refLine:DATA.config.goals?.waist ?? null});

  const ac = document.getElementById("chart-adh");
  if (ac) {
    const weeks = []; const labels=[];
    for (let i=7;i>=0;i--){ const wd=weekDates(addDays(new Date(),-7*i)); const adh=computeWeekAdherence(DATA.entries,wd,DATA.config); weeks.push(adh.total); labels.push(fmtShort(wd[0])); }
    drawBarChart(ac, labels, weeks, v => v>=70?COLORS.sport:v>=40?COLORS.food:COLORS.bad, {axis});
  }
}

function renderSettings(){
  const cfg = DATA.config;
  const age = ageFromBirthDate(cfg.profile?.birthDate);
  return `
    <h1 class="title">Ajustes</h1>
    ${DATA.isDemo ? `
    <div class="card">
      <div class="card-head"><h3>Datos de demostración</h3></div>
      <p class="small" style="margin-bottom:10px;">Estás usando datos ficticios para explorar la app.</p>
      <button class="btn primary" id="clear-demo">Borrar datos demo y comenzar</button>
    </div>`:""}
    <div class="card">
      <div class="card-head"><h3>Perfil</h3></div>
      <p class="small" style="margin-bottom:10px;">Opcional. La edad es solo informativa; el sexo habilita una referencia general de cintura en Evolución — no cambia tu puntaje de adherencia ni es un diagnóstico.</p>
      <label class="field-label">Fecha de nacimiento</label>
      <input class="big-input" style="font-size:15px;margin-bottom:4px;" type="date" id="profile-birthdate" value="${cfg.profile?.birthDate||""}"/>
      ${age!=null?`<p class="small" style="margin-bottom:10px;">Edad: ${age} años</p>`:`<div style="margin-bottom:10px;"></div>`}
      <label class="field-label">Sexo</label>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;margin-top:4px;">
        ${[["f","Femenino"],["m","Masculino"],["x","Prefiero no decir"]].map(([v,l])=>`<button class="chip${cfg.profile?.sex===v?" active":""}" data-sex="${v}" style="${cfg.profile?.sex===v?`background:${COLORS.physio};border-color:${COLORS.physio};`:""}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Apariencia</h3></div>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;">
        ${[["system","Sistema"],["light","Claro"],["dark","Oscuro"]].map(([v,l])=>`<button class="chip${cfg.theme===v?" active":""}" data-theme="${v}" style="${cfg.theme===v?`background:${COLORS.sport};border-color:${COLORS.sport};`:""}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Ponderación de adherencia</h3></div>
      ${["food","sport","physio"].map(k=>`
        <div class="weight-slider" style="margin-bottom:12px;">
          <div class="summary-row" style="padding:0 0 4px;"><span>${k==="food"?"Alimentación":k==="sport"?"Deporte":"Fisioterapia"}</span><span><b>${cfg.weights[k]}%</b></span></div>
          <input type="range" min="0" max="100" value="${cfg.weights[k]}" data-weight="${k}"/>
        </div>`).join("")}
      <p class="small">Fórmula: puntaje semanal = (alimentación × peso_alim + deporte × peso_dep + fisio × peso_fisio) / suma de pesos activos. Alimentación promedia el puntaje de almuerzos y cenas registrados (OK/liviana=100, regular/normal=50, no adecuado/excesiva=0; sin registrar no cuenta). Deporte = (días con deporte / 7) × 100. Fisioterapia = (sesiones de la semana / objetivo semanal) × 100, tope 100. Si una categoría no tiene objetivo o datos esa semana, su peso se redistribuye entre las demás. Peso y cintura nunca afectan este puntaje.</p>
    </div>
    <div class="card">
      <div class="card-head"><h3>Fisioterapia — objetivo</h3></div>
      <div class="summary-row"><span>Incluir en el puntaje</span><button class="toggle${cfg.physioGoalEnabled?" on":""}" id="physio-toggle"><div class="knob"></div></button></div>
      ${cfg.physioGoalEnabled?`<div class="summary-row"><span>Sesiones por semana</span><input class="pill-input" type="number" min="1" max="14" id="physio-goal" value="${cfg.physioWeeklyGoal}"/></div>`:""}
    </div>
    <div class="card">
      <div class="card-head"><h3>Metas (informativas)</h3></div>
      <p class="small" style="margin-bottom:8px;">No afectan el puntaje de adherencia — solo se muestran como referencia en Evolución.</p>
      <div class="meas-grid">
        <div><label class="field-label">Peso objetivo (kg)</label><input class="big-input" type="number" inputmode="decimal" step="0.1" id="goal-weight" value="${cfg.goals?.weight??""}" placeholder="—"/></div>
        <div><label class="field-label">Cintura objetivo (cm)</label><input class="big-input" type="number" inputmode="decimal" step="0.1" id="goal-waist" value="${cfg.goals?.waist??""}" placeholder="—"/></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Deportes personalizados</h3></div>
      <div>${DATA.customSports.map(s=>`<span class="tag">${esc(s)}<button data-remove-sport="${esc(s)}">✕</button></span>`).join("")}</div>
      <div class="row-gap">
        <input class="text-field" id="new-sport" placeholder="Nuevo deporte"/>
        <button class="btn primary" style="width:auto;padding:10px 16px;" id="add-sport">+</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Datos</h3></div>
      <div class="grid2">
        <button class="btn ghost" id="export-json">Backup JSON</button>
        <button class="btn ghost" id="export-csv">Exportar CSV</button>
      </div>
      <div id="export-area"></div>
      <button class="btn ghost" style="margin-top:8px;" id="show-import">Importar / restaurar backup JSON</button>
      <div id="import-area"></div>
      <button class="btn danger-text" style="margin-top:8px;" id="show-delete">Borrar todos los datos</button>
      <div id="delete-area"></div>
    </div>
    <p class="footer-note">Balance — todos los datos se guardan solo en este dispositivo (IndexedDB), nunca se envían a un servidor.</p>
  `;
}

function renderNav(){
  const items = [
    {id:"today",label:"Hoy",icon:'<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'},
    {id:"calendar",label:"Calendario",icon:'<rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8"/>'},
    {id:"evolution",label:"Evolución",icon:'<path d="M3 17l6-6 4 4 8-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'},
    {id:"settings",label:"Ajustes",icon:'<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z" fill="none" stroke="currentColor" stroke-width="1.4"/>'},
  ];
  return `<nav class="bottom"><div class="inner">${items.map(it=>`
    <button data-nav="${it.id}" class="${VIEW===it.id?"active":""}">
      <svg viewBox="0 0 24 24">${it.icon}</svg>${it.label}
    </button>`).join("")}</div></nav>`;
}

/* -------------------------------- handlers -------------------------------- */
function setDeepField(obj, parts, value){
  if (parts.length === 1) { obj[parts[0]] = value; return; }
  const [head, ...rest] = parts;
  if (Array.isArray(obj[head]) && /^\d+$/.test(rest[0])) {
    const idx = parseInt(rest[0], 10);
    const arr = obj[head].slice();
    const item = { ...(arr[idx] || {}) };
    setDeepField(item, rest.slice(1), value);
    arr[idx] = item;
    obj[head] = arr;
    return;
  }
  obj[head] = { ...(obj[head] || {}) };
  setDeepField(obj[head], rest, value);
}
function setField(prefix, path, value){
  const key = prefix==="today" ? todayKey() : MODAL_DATE;
  const entry = { ...emptyEntry(), ...(DATA.entries[key]||{}) };
  setDeepField(entry, path.split("."), value);
  DATA.entries[key] = entry;
  persist();
}

function attachHandlers(sportsList){
  // nav
  app.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { VIEW = b.dataset.nav; render(); });
  // chips (lunch/dinner/hydration/sleep/pain-area)
  app.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => {
    const [prefix, ...rest] = b.dataset.chip.split(".");
    const field = rest.join(".");
    const val = b.dataset.val === "__unset__" ? null : b.dataset.val;
    setField(prefix, field, val);
    render();
  });
  // add a sport session
  app.querySelectorAll("[data-add-sport]").forEach(b => b.onclick = () => {
    const prefix = b.dataset.addSport;
    const key = prefix==="today"?todayKey():MODAL_DATE;
    const entry = { ...emptyEntry(), ...(DATA.entries[key]||{}) };
    entry.sports = [...(entry.sports||[]), { id:uid(), type:sportsList[0], duration:30, calories:null, intensity:null, comment:"" }];
    DATA.entries[key] = entry;
    persist();
    render();
  });
  // remove a sport session
  app.querySelectorAll("[data-remove-sport-idx]").forEach(b => b.onclick = () => {
    const [prefix, idxStr] = b.dataset.removeSportIdx.split("|");
    const idx = parseInt(idxStr, 10);
    const key = prefix==="today"?todayKey():MODAL_DATE;
    const entry = { ...emptyEntry(), ...(DATA.entries[key]||{}) };
    entry.sports = (entry.sports||[]).filter((_,i)=>i!==idx);
    DATA.entries[key] = entry;
    persist();
    render();
  });
  // physio toggle
  app.querySelectorAll("[data-toggle-physio]").forEach(b => b.onclick = () => {
    const prefix = b.dataset.togglePhysio;
    const key = prefix==="today"?todayKey():MODAL_DATE;
    const cur = DATA.entries[key]?.physio;
    setField(prefix, "physio", cur?.done ? {done:false,duration:null,comment:""} : {done:true,duration:20,comment:""});
    render();
  });
  // pain toggle
  app.querySelectorAll("[data-toggle-pain]").forEach(b => b.onclick = () => {
    const prefix = b.dataset.togglePain;
    const key = prefix==="today"?todayKey():MODAL_DATE;
    const cur = DATA.entries[key]?.pain;
    setField(prefix, "pain", cur?.has ? {has:false,area:null,intensity:null,comment:""} : {has:true,area:null,intensity:null,comment:""});
    render();
  });
  // intensity (sport sessions) — data-intensity is a path like "today.sports.0"
  app.querySelectorAll("[data-intensity]").forEach(b => b.onclick = () => {
    const pathParts = b.dataset.intensity.split(".");
    const prefix = pathParts[0];
    const key = prefix==="today"?todayKey():MODAL_DATE;
    let cur = DATA.entries[key] || {};
    for (const p of pathParts.slice(1)) cur = cur?.[p];
    const newIntensity = cur?.intensity===b.dataset.val ? null : b.dataset.val;
    setField(prefix, [...pathParts.slice(1), "intensity"].join("."), newIntensity);
    render();
  });
  // generic text/number/select fields (no full re-render, to keep focus while typing)
  app.querySelectorAll("[data-field]").forEach(inp => {
    const handler = () => {
      const path = inp.dataset.field; // e.g. "today.weight" or "today.sports.0.duration"
      const [prefix, ...rest] = path.split(".");
      const field = rest.join(".");
      let val = inp.value;
      if (inp.type==="number") val = val===""?null:parseFloat(val);
      setField(prefix, field, val);
    };
    inp.oninput = handler;
    inp.onchange = handler; // fallback: some mobile browsers don't fire "input" reliably on <select>
  });
  // calendar
  app.querySelectorAll("[data-cal-nav]").forEach(b => b.onclick = () => {
    const d = parseInt(b.dataset.calNav);
    if (CAL_MODE === "week") CAL_CURSOR = addDays(CAL_CURSOR, d*7);
    else CAL_CURSOR = new Date(CAL_CURSOR.getFullYear(), CAL_CURSOR.getMonth()+d, 1);
    render();
  });
  app.querySelectorAll("[data-cal-mode]").forEach(b => b.onclick = () => { CAL_MODE = b.dataset.calMode; render(); });
  app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { MODAL_DATE = b.dataset.day; render(); });
  // evolution range
  app.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { EVO_RANGE = parseInt(b.dataset.range); render(); });
  // modal close
  const closeBtn = document.getElementById("modal-close");
  const backdrop = document.getElementById("modal-backdrop");
  if (closeBtn) closeBtn.onclick = () => { MODAL_DATE = null; render(); };
  if (backdrop) backdrop.onclick = () => { MODAL_DATE = null; render(); };

  // settings
  const clearDemo = document.getElementById("clear-demo");
  if (clearDemo) clearDemo.onclick = () => { DATA.isDemo=false; DATA.entries={}; persist(); render(); };
  app.querySelectorAll("[data-theme]").forEach(b => b.onclick = () => { DATA.config.theme=b.dataset.theme; persist(); render(); });
  app.querySelectorAll("[data-weight]").forEach(inp => inp.oninput = () => {
    const k = inp.dataset.weight; const val = parseInt(inp.value);
    const others = ["food","sport","physio"].filter(x=>x!==k);
    const remaining = 100-val;
    const othersTotal = others.reduce((a,o)=>a+DATA.config.weights[o],0) || 1;
    const nw = {...DATA.config.weights, [k]:val};
    others.forEach(o => { nw[o] = Math.round((DATA.config.weights[o]/othersTotal)*remaining); });
    DATA.config.weights = nw; persist(); render();
  });
  const physioToggle = document.getElementById("physio-toggle");
  if (physioToggle) physioToggle.onclick = () => { DATA.config.physioGoalEnabled = !DATA.config.physioGoalEnabled; persist(); render(); };
  const physioGoal = document.getElementById("physio-goal");
  if (physioGoal) physioGoal.oninput = () => { DATA.config.physioWeeklyGoal = parseInt(physioGoal.value)||1; persist(); };
  const goalWeight = document.getElementById("goal-weight");
  if (goalWeight) { const h = () => { DATA.config.goals = {...DATA.config.goals, weight: goalWeight.value===""?null:parseFloat(goalWeight.value)}; persist(); }; goalWeight.oninput = h; goalWeight.onchange = h; }
  const goalWaist = document.getElementById("goal-waist");
  if (goalWaist) { const h = () => { DATA.config.goals = {...DATA.config.goals, waist: goalWaist.value===""?null:parseFloat(goalWaist.value)}; persist(); }; goalWaist.oninput = h; goalWaist.onchange = h; }
  const birthdateInput = document.getElementById("profile-birthdate");
  if (birthdateInput) { const h = () => { DATA.config.profile = {...DATA.config.profile, birthDate: birthdateInput.value||null}; persist(); render(); }; birthdateInput.onchange = h; }
  app.querySelectorAll("[data-sex]").forEach(b => b.onclick = () => {
    DATA.config.profile = {...DATA.config.profile, sex: DATA.config.profile?.sex===b.dataset.sex ? null : b.dataset.sex};
    persist(); render();
  });
  const addSportBtn = document.getElementById("add-sport");
  if (addSportBtn) addSportBtn.onclick = () => {
    const inp = document.getElementById("new-sport");
    if (inp.value.trim()){ DATA.customSports.push(inp.value.trim()); persist(); render(); }
  };
  app.querySelectorAll("[data-remove-sport]").forEach(b => b.onclick = () => {
    DATA.customSports = DATA.customSports.filter(s => s!==b.dataset.removeSport); persist(); render();
  });

  const exportJsonBtn = document.getElementById("export-json");
  if (exportJsonBtn) exportJsonBtn.onclick = () => {
    const json = JSON.stringify(DATA, null, 2);
    downloadFile(`balance-backup-${todayKey()}.json`, json, "application/json");
    document.getElementById("export-area").innerHTML = `<p class="small" style="margin-top:6px;">Si la descarga no se abrió, copiá el texto:</p><textarea readonly style="height:96px;font-family:monospace;font-size:10px;">${esc(json)}</textarea>`;
  };
  const exportCsvBtn = document.getElementById("export-csv");
  if (exportCsvBtn) exportCsvBtn.onclick = () => {
    const rows = [["fecha","almuerzo","cena","hidratacion","sueno_calidad","sueno_horas","dolor","dolor_zona","dolor_intensidad","deporte_tipo","deporte_min","deporte_kcal","deporte_intensidad","deporte_comentario","fisio_hecho","fisio_min","peso","cintura"]];
    Object.keys(DATA.entries).sort().forEach(k => {
      const e = DATA.entries[k];
      const sessions = (e.sports && e.sports.length) ? e.sports : [null];
      sessions.forEach((sp) => {
        rows.push([k, e.lunch||"", e.dinner||"", e.hydration||"", e.sleep?.quality||"", e.sleep?.hours??"", e.pain?.has?"si":"no", e.pain?.area||"", e.pain?.intensity||"",
          sp?.type||"", sp?.duration??"", sp?.calories??"", sp?.intensity||"", sp?.comment||"",
          e.physio?.done?"si":"no", e.physio?.duration??"", e.weight??"", e.waist??""]);
      });
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    downloadFile(`balance-export-${todayKey()}.csv`, csv, "text/csv");
    document.getElementById("export-area").innerHTML = `<p class="small" style="margin-top:6px;">Si la descarga no se abrió, copiá el texto:</p><textarea readonly style="height:96px;font-family:monospace;font-size:10px;">${esc(csv)}</textarea>`;
  };
  const showImportBtn = document.getElementById("show-import");
  if (showImportBtn) showImportBtn.onclick = () => {
    document.getElementById("import-area").innerHTML = `
      <input type="file" accept="application/json" id="import-file"/>
      <textarea id="import-text" placeholder="O pegá aquí el contenido del JSON…" style="height:96px;font-family:monospace;font-size:10px;margin-top:6px;"></textarea>
      <button class="btn primary" style="margin-top:6px;" id="do-import">Restaurar</button>`;
    document.getElementById("import-file").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => { document.getElementById("import-text").value = String(r.result); };
      r.readAsText(f);
    };
    document.getElementById("do-import").onclick = () => {
      try {
        const parsed = JSON.parse(document.getElementById("import-text").value);
        if (!parsed.entries || !parsed.config) throw new Error("bad format");
        DATA = migrateData(parsed); persist(); render();
      } catch(err) { alert("El JSON no tiene el formato esperado de un backup de Balance."); }
    };
  };
  const showDeleteBtn = document.getElementById("show-delete");
  if (showDeleteBtn) showDeleteBtn.onclick = () => {
    document.getElementById("delete-area").innerHTML = `
      <div class="card" style="background:var(--card-alt);margin-top:8px;">
        <p class="small" style="margin-bottom:8px;">Esto borra todo permanentemente. ¿Confirmás?</p>
        <div class="row-gap"><button class="btn ghost" id="cancel-delete">Cancelar</button><button class="btn" style="background:${COLORS.bad};color:#fff;" id="confirm-delete">Borrar</button></div>
      </div>`;
    document.getElementById("cancel-delete").onclick = () => { document.getElementById("delete-area").innerHTML = ""; };
    document.getElementById("confirm-delete").onclick = () => { DATA = defaultData(); persist(); render(); };
  };
}

function downloadFile(filename, content, mime){
  try {
    const blob = new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  } catch(e){ console.error(e); }
}

/* ------------------------------ service worker ------------------------------ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}

boot();
})();
