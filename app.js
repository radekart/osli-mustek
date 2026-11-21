(function(){
'use strict';
const APP_VER=7;
const KEY='osli-mustek.v2', DAY=864e5;
const INT=[0,0,DAY,3*DAY,7*DAY,21*DAY];
const LEVELS=['A2','B1','B2','C1','C2'];
const PRO='STAVBA';
const TRACKS=[...LEVELS,PRO];
const TRACK_NAME={A2:'A2',B1:'B1',B2:'B2',C1:'C1',C2:'C2',STAVBA:'Statika'};
const CATS=['Zvířata','Příroda','Doma','Věci','Jídlo','Vlastnosti','Tělo','Slovesa','Pocity','Lidé','Abstraktní','Práce','Cestování','Společnost','Věda','Stavba'];
const HUE={'Zvířata':32,'Příroda':150,'Doma':255,'Věci':200,'Jídlo':95,'Vlastnosti':330,'Tělo':8,'Slovesa':50,'Pocity':300,'Lidé':20,'Abstraktní':175,'Práce':225,'Cestování':185,'Společnost':345,'Věda':270,'Stavba':40};
const PRO_MIX=[{v:0,t:'Žádná'},{v:0.2,t:'Trochu'},{v:0.5,t:'Půl na půl'},{v:1,t:'Jen obor'}];

// ---------- words ----------
let WORDS=[];
const BYID=new Map();
let ALL=[];
function rebuildIndex(){ALL=WORDS.concat(S.custom);BYID.clear();for(const w of ALL)BYID.set(w.id,w);}
const all=()=>ALL;
const byId=id=>BYID.get(id);
async function loadWords(){
  const res=await Promise.all(TRACKS.map(t=>fetch('words/'+t+'.json').then(r=>r.ok?r.json():[]).catch(()=>[])));
  res.forEach((rows,i)=>{for(const r of rows)WORDS.push({id:r[0],en:r[0],ipa:r[1],say:r[2],cz:r[3],key:r[4],story:r[5],scene:r[6],ex:r[7],exCz:r[8],cat:r[9],level:TRACKS[i]});});
}

// ---------- state (always kept on the device; synced to Firebase when signed in) ----------
function defaults(){return {progress:{},custom:[],settings:{accent:'en-GB',perLesson:5,newLevel:'auto',proMix:0.2},streak:{last:'',n:0},at:0,syncedUid:''};}
let S=loadLocal();
function loadLocal(){try{const r=localStorage.getItem(KEY);if(r){const d=defaults(),o=JSON.parse(r);return {...d,...o,settings:{...d.settings,...(o.settings||{})},streak:{...d.streak,...(o.streak||{})}};}}catch(e){}return defaults();}
function saveLocal(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
const prog=id=>S.progress[id]||{box:0,due:0,r:0,w:0};
function setProgress(id,p){S.progress[id]=p;saveLocal();FB.markDirty(id);}
function touchMeta(){S.at=Date.now();saveLocal();FB.markMeta();}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const pickN=(arr,n)=>{const out=[],used=new Set();if(arr.length<=n)return shuffle(arr);while(out.length<n){const i=Math.floor(Math.random()*arr.length);if(!used.has(i)){used.add(i);out.push(arr[i]);}}return out;};
const dstr=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const today=()=>dstr(Date.now());
const hue=w=>HUE[w.cat]??285;
const plural=(n,a,b,c)=>n===1?a:(n>=2&&n<=4?b:c);
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'w';
function mergeEntry(a,b){if(!a)return b;if(!b)return a;const ca=(a.r||0)+(a.w||0),cb=(b.r||0)+(b.w||0);if(cb>ca)return b;if(cb<ca)return a;return (b.due||0)>(a.due||0)?b:a;}

// ---------- Firebase sync ----------
const FB={
  ready:false,auth:null,db:null,user:null,base:null,unsubs:[],dirty:new Set(),meta:false,timer:null,status:'off',firstProg:false,firstCustom:false,
  bucket(id){const w=byId(id);return !w||w.src?'custom':w.level;},
  markDirty(id){if(!this.user)return;this.dirty.add(id);this.schedule();},
  markMeta(){if(!this.user)return;this.meta=true;this.schedule();},
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),800);},
  async flush(){
    if(!this.user||(!this.dirty.size&&!this.meta))return;
    const by={};
    for(const id of this.dirty){const p=S.progress[id];if(!p)continue;(by[this.bucket(id)]||(by[this.bucket(id)]={}))[id]=[p.box,p.due,p.r||0,p.w||0];}
    this.dirty.clear();
    const batch=this.db.batch();
    for(const [b,obj] of Object.entries(by))batch.set(this.base.collection('progress').doc(b),{p:obj},{merge:true});
    if(this.meta){batch.set(this.base,{settings:S.settings,streak:S.streak,at:S.at},{merge:true});this.meta=false;}
    setSync('saving');
    try{await batch.commit();setSync('ok');}
    catch(e){console.warn(e);setSync('err');}
  },
  async addCustom(w){if(!this.user)return;try{await this.base.collection('custom').doc(w.id).set(w);}catch(e){setSync('err');}},
  async removeCustom(id){if(!this.user)return;try{await this.base.collection('custom').doc(id).delete();await this.base.collection('progress').doc('custom').update(new firebase.firestore.FieldPath('p',id),firebase.firestore.FieldValue.delete());}catch(e){}},
  init(){
    const cfg=window.FIREBASE_CONFIG;
    if(!cfg||!cfg.apiKey||!window.firebase){setSync('nocfg');return;}
    try{
      firebase.initializeApp(cfg);
      this.auth=firebase.auth();this.db=firebase.firestore();
      this.db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
      this.ready=true;setSync('out');
      this.auth.getRedirectResult().catch(e=>{if(e&&e.code)toast(authErr(e));});
      this.auth.onAuthStateChanged(u=>u?this.start(u):this.stop());
    }catch(e){console.warn(e);setSync('nocfg');}
  },
  async signIn(){
    if(!this.ready){toast('Synchronizace zatím není nastavená. Postup je v README.');return;}
    const p=new firebase.auth.GoogleAuthProvider();
    try{await this.auth.signInWithPopup(p);}
    catch(e){
      if(e&&(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'||e.code==='auth/cancelled-popup-request'))this.auth.signInWithRedirect(p);
      else if(e&&e.code!=='auth/popup-closed-by-user')toast(authErr(e));
    }
  },
  signOut(){if(this.auth)this.auth.signOut();},
  stop(){this.unsubs.forEach(u=>u());this.unsubs=[];this.user=null;this.base=null;if(this.ready)setSync('out');rerenderHome();},
  start(u){
    this.stop();this.user=u;this.base=this.db.collection('users').doc(u.uid);
    this.firstProg=this.firstCustom=false;setSync('connecting');
    const firstTime=S.syncedUid!==u.uid;
    // settings + streak
    this.unsubs.push(this.base.onSnapshot(s=>{
      const d=s.data();
      if(!d){if(!s.metadata.fromCache)this.markMeta();return;}
      if((d.at||0)>=(S.at||0)){S.settings={...S.settings,...(d.settings||{})};if(d.streak)S.streak=d.streak;S.at=d.at||0;saveLocal();}
      else this.markMeta();
      rerenderHome();
    },e=>{console.warn(e);setSync('err');}));
    // progress
    this.unsubs.push(this.base.collection('progress').onSnapshot(qs=>{
      const remote={};
      qs.forEach(doc=>{const p=(doc.data()||{}).p||{};for(const [id,a] of Object.entries(p))if(Array.isArray(a))remote[id]={box:a[0]||0,due:a[1]||0,r:a[2]||0,w:a[3]||0};});
      for(const [id,p] of Object.entries(remote))S.progress[id]=mergeEntry(S.progress[id],p);
      if(!this.firstProg&&!qs.metadata.fromCache){
        this.firstProg=true;
        for(const [id,p] of Object.entries(S.progress))if(mergeEntry(remote[id],p)!==remote[id])this.dirty.add(id);
        if(this.dirty.size)this.schedule();
        S.syncedUid=u.uid;setSync('ok');
      }
      saveLocal();rerenderHome();
    },e=>{console.warn(e);setSync('err');}));
    // own words
    this.unsubs.push(this.base.collection('custom').onSnapshot(qs=>{
      const remote=[];qs.forEach(doc=>{const w=doc.data();if(w&&w.en&&w.cz)remote.push({...w,id:doc.id,src:'me'});});
      if(!this.firstCustom&&!qs.metadata.fromCache){
        this.firstCustom=true;
        if(firstTime){const ids=new Set(remote.map(w=>w.id));for(const w of S.custom)if(!ids.has(w.id)){remote.push(w);this.addCustom(w);}}
      }
      if(this.firstCustom||remote.length){S.custom=remote;saveLocal();rebuildIndex();rerenderHome();}
    },e=>{console.warn(e);setSync('err');}));
  }
};
function authErr(e){
  const c=e&&e.code||'';
  if(c==='auth/unauthorized-domain')return 'Tahle adresa není ve Firebase povolená. Přidej ji v Authentication → Settings → Authorized domains.';
  if(c==='auth/network-request-failed')return 'Nejde se připojit k internetu.';
  return 'Přihlášení se nepovedlo ('+c+').';
}
const SYNC_TEXT={
  nocfg:['','Ukládá se jen v tomto zařízení. Synchronizace se zapne po vyplnění firebase-config.js.'],
  out:['','Ukládá se jen v tomto zařízení.'],
  connecting:['wait','Připojuji se…'],
  saving:['wait','Ukládám…'],
  ok:['ok','Synchronizováno'],
  err:['err','Teď se nedaří synchronizovat. Postup je v zařízení a odešle se později.']
};
function setSync(s){FB.status=s;const el=document.getElementById('sync');if(el)el.outerHTML=syncHtml();}
function syncHtml(){
  const [c,t]=SYNC_TEXT[FB.status]||SYNC_TEXT.out;
  const who=FB.user?` (${esc(FB.user.email||FB.user.displayName||'účet')})`:'';
  const btn=FB.status==='out'?` <button class="linkbtn" data-act="login">Přihlásit přes Google</button> a postup uvidíš na mobilu i PC.`:'';
  return `<p id="sync" class="sync ${c}"><i></i><span>${esc(t)}${who}${btn}</span></p>`;
}

// ---------- speech ----------
let voices=[];
function loadVoices(){try{voices=speechSynthesis.getVoices();}catch(e){}}
if('speechSynthesis' in window){loadVoices();speechSynthesis.onvoiceschanged=loadVoices;}
function pickVoice(lang){
  if(!voices.length)loadVoices();
  const l=lang.toLowerCase(),norm=v=>v.lang.toLowerCase().replace('_','-');
  const list=voices.filter(v=>norm(v)===l);
  return list.find(v=>/natural|neural|google|premium|enhanced/i.test(v.name))||list[0]||voices.find(v=>norm(v).startsWith(l.slice(0,2)));
}
// Záloha pro mobily bez hlasu: přehraje zvukový soubor z internetu.
const AUD=new Audio();AUD.preload='auto';
const SILENT='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
let useAudio=false;
function ttsUrl(text,lang){return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl='+encodeURIComponent(lang.startsWith('cs')?'cs':lang)+'&q='+encodeURIComponent(text.slice(0,200));}
function playAudio(text,lang,rate,onend){
  // Google zvuk vrací jen bez hlavičky Referer.
  if(!document.querySelector('meta[name=referrer]')){const m=document.createElement('meta');m.name='referrer';m.content='no-referrer';document.head.appendChild(m);}
  AUD.onended=onend||null;AUD.onerror=()=>toast('Zvuk se nepodařilo načíst. Jsi připojený k internetu?');
  AUD.src=ttsUrl(text,lang);
  try{AUD.playbackRate=rate&&rate<0.7?0.7:1;}catch(e){}
  const p=AUD.play();if(p&&p.catch)p.catch(()=>toast('Telefon zvuk zablokoval. Ťukni na reproduktor a zkontroluj hlasitost i tichý režim.'));
}
function speak(text,lang,rate,onend){
  const ss=window.speechSynthesis;
  if(!ss||useAudio){playAudio(text,lang,rate,onend);return;}
  if(!voices.length)loadVoices();
  const v=pickVoice(lang);
  if(!voices.length||!v){playAudio(text,lang,rate,onend);return;}
  const u=new SpeechSynthesisUtterance(text);
  u.lang=lang;u.voice=v;u.rate=rate||0.95;
  let started=false;u.onstart=()=>{started=true;};
  if(onend)u.onend=onend;
  window._utt=u; // mobilní Chrome jinak utterance zahodí dřív, než doběhne
  const busy=ss.speaking||ss.pending;
  if(busy)ss.cancel();
  const go=()=>{try{ss.resume();}catch(e){}ss.speak(u);
    // Když telefon nezačne mluvit do 1,5 s, přepni na zvukové soubory.
    setTimeout(()=>{if(!started){try{ss.cancel();}catch(e){}useAudio=true;playAudio(text,lang,rate,onend);}},1500);};
  if(busy)setTimeout(go,120);else go();
}
// iPhone/Android pustí zvuk až po prvním dotyku: při prvním ťuknutí "odemknout" řeč i přehrávač.
let speechUnlocked=false;
function unlockSpeech(){
  if(speechUnlocked)return;speechUnlocked=true;
  try{AUD.src=SILENT;const p=AUD.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}
  try{if(window.speechSynthesis){loadVoices();const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}}catch(e){}
}
['touchend','click','keydown'].forEach(ev=>document.addEventListener(ev,unlockSpeech,{capture:true,passive:true}));
const sayEn=(t,slow)=>speak(t,S.settings.accent,slow?0.55:0.9);
function sayTimes(t,n){let i=0;const go=()=>{if(i++<n)speak(t,S.settings.accent,0.85,()=>setTimeout(go,700));};go();}

let toastT;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,4000);}

// ---------- icons ----------
const ICON={
 speaker:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
 slow:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16c0-4 3-7 7-7s7 3 7 7z"/><path d="M18 14h2a2 2 0 0 0 0-4h-1"/><path d="M7 16v2M15 16v2"/></svg>',
 eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 ear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 4-4 5-4 9a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 1 1 4 0"/></svg>',
 book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>',
 pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3l4 4L8 20H4v-4z"/></svg>',
 x:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
};

// ---------- render helpers ----------
const app=document.getElementById('app');
let VIEW='loading';
function render(html,keepScroll){const y=window.scrollY;app.innerHTML=html;window.scrollTo(0,keepScroll?y:0);}
let rrT;
function rerenderHome(){if(VIEW!=='home')return;clearTimeout(rrT);rrT=setTimeout(()=>{if(VIEW==='home'&&document.activeElement?.id!=='search')home(true);},250);}
function storyHtml(w){
  let s=esc(w.story||'');
  if(!/\[/.test(s)&&w.key){const k=esc(w.key);const i=s.toLowerCase().indexOf(k.toLowerCase());if(i>=0)s=s.slice(0,i)+'['+s.slice(i,i+k.length)+']'+s.slice(i+k.length);}
  return s.replace(/\[(.+?)\]/g,'<mark class="k">$1</mark>').replace(/\{(.+?)\}/g,'<strong class="m">$1</strong>');
}
const storyPlain=w=>String(w.story||'').replace(/[\[\]{}]/g,'');
const dots=b=>'<span class="dots" aria-label="Zapamatováno '+b+' z 5">'+[1,2,3,4,5].map(i=>'<i class="'+(i<=b?'on':'')+'"></i>').join('')+'</span>';
const tname=w=>TRACK_NAME[w.level]||w.level||'';
const sceneHtml=(w,hideTag)=>'<div class="scene" style="--h:'+hue(w)+'">'+(hideTag?'':'<span class="tag">'+esc(tname(w))+' · '+esc(w.cat||'')+'</span>')+'<span class="em" aria-hidden="true">'+esc(w.scene||'💡')+'</span></div>';
const wordTile=w=>`<button class="word" data-act="open" data-id="${esc(w.id)}" style="--h:${hue(w)}"><span class="lt">${esc(tname(w))}</span><span class="em" aria-hidden="true">${esc(w.scene||'💡')}</span><b lang="en">${esc(w.en)}</b><span>${esc(w.cz)}</span>${dots(prog(w.id).box)}</button>`;

function counts(){
  const now=Date.now();let due=0;const lv={};
  for(const t of TRACKS)lv[t]={t:0,k:0,l:0};
  for(const w of all()){const p=prog(w.id);const L=lv[w.level]||(lv[w.level]={t:0,k:0,l:0});L.t++;
    if(p.box>=4)L.k++;else if(p.box>0)L.l++;
    if(p.box>0&&p.due<=now)due++;}
  return {due,lv};
}
function freshWords(n){
  const unseen=all().filter(w=>prog(w.id).box===0);
  const mine=unseen.filter(w=>w.src==='me');
  const nl=S.settings.newLevel;
  const general=unseen.filter(w=>!w.src&&LEVELS.includes(w.level)&&(nl==='auto'||w.level===nl)).sort((a,b)=>LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level));
  const pro=shuffle(unseen.filter(w=>!w.src&&w.level===PRO));
  const mix=S.settings.proMix;
  const out=mine.slice(0,n);
  let g=0,p=0;
  // take general words in level order but shuffled within the first window so lessons vary
  const gWindow=shuffle(general.slice(0,60)).concat(general.slice(60));
  while(out.length<n&&(g<gWindow.length||p<pro.length)){
    const wantPro=mix>=1||(mix>0&&Math.random()<mix);
    if(wantPro&&p<pro.length)out.push(pro[p++]);
    else if(mix<1&&g<gWindow.length)out.push(gWindow[g++]);
    else if(p<pro.length)out.push(pro[p++]);
    else break;
  }
  return out;
}

// ---------- home ----------
let filter='Vše',query='',limit=40;
function home(keep){
  VIEW='home';SES=null;
  const c=counts(),fresh=freshWords(S.settings.perLesson).length;
  const st=S.streak.last===today()||S.streak.last===dstr(Date.now()-DAY)?S.streak.n:0;
  const q=query.trim().toLowerCase();
  const list=all().filter(w=>(filter==='Vše'||w.level===filter||(filter==='Moje'&&w.src)||(filter==='Učím se'&&prog(w.id).box>0))&&(!q||w.en.toLowerCase().includes(q)||String(w.cz).toLowerCase().includes(q)));
  const shown=list.slice(0,limit);
  const chips=['Vše',...LEVELS,PRO,'Učím se',...(S.custom.length?['Moje']:[])];
  render(`
  <header>
    <div class="brand">
      <div><h1><span>Oslí</span> můstek</h1><p>Angličtina přes české zvukové můstky</p></div>
      <div class="streak"><b>${st}</b>${plural(st,'den','dny','dní')} v řadě</div>
    </div>
    ${syncHtml()}
  </header>
  <section class="card lesson">
    <div class="label">Dnešní lekce</div>
    ${(c.due+fresh)>0?`<h2>${c.due} k opakování, ${fresh} ${plural(fresh,'nové slovo','nová slova','nových slov')}</h2>
      <p class="muted">Každé slovo uvidíš, uslyšíš, přečteš si jeho příběh a napíšeš ho.</p>
      <button class="btn block" data-act="start">Začít lekci</button>`
    :`<h2>Na dnešek máš hotovo</h2><p class="muted">Další opakování přijde zítra. Můžeš si procvičit cokoli navíc.</p>
      <button class="btn block" data-act="practice">Procvičit 8 slov</button>`}
    <div class="senses">
      <div class="sense">${ICON.eye}Vidím</div><div class="sense">${ICON.ear}Slyším</div>
      <div class="sense">${ICON.book}Čtu</div><div class="sense">${ICON.pen}Píšu</div>
    </div>
  </section>
  <section class="card">
    <div class="label">Cesta k C2</div>
    <div class="levels">${TRACKS.map(L=>{const v=c.lv[L]||{t:0,k:0,l:0};if(!v.t)return '';const kp=v.k/v.t*100,lp=v.l/v.t*100;
      return `${L===PRO?'<div class="label" style="margin-top:8px">Obor</div>':''}<button class="lvl" data-act="lvl" data-v="${L}"><span class="lv" style="${L===PRO?'font-size:15px':''}">${TRACK_NAME[L]}</span><span class="lbar"><i class="k" style="width:${kp}%"></i><i class="l" style="width:${lp}%"></i></span><span class="lnum">${v.k} / ${v.t}${L==='C2'?'<span class="goal">cíl</span>':''}</span></button>`;}).join('')}</div>
    <div class="legend"><span><i style="background:var(--good)"></i>umím</span><span><i style="background:var(--learn)"></i>učím se</span><span><i style="background:var(--line)"></i>nová</span></div>
  </section>
  <section id="list" style="display:flex;flex-direction:column;gap:12px">
    <div class="row" style="justify-content:space-between"><h3 style="font-size:22px">Slovíčka <span class="muted" style="font-size:16px;font-weight:500">${list.length}</span></h3><button class="btn small soft" data-act="add">+ Přidat vlastní</button></div>
    <input id="search" class="field" type="search" placeholder="Hledat anglicky nebo česky" value="${esc(query)}" autocomplete="off" aria-label="Hledat slovíčko" style="font-size:17px">
    <div class="chips">${chips.map(k=>`<button class="chip" data-act="filter" data-v="${esc(k)}" aria-pressed="${k===filter}">${esc(TRACK_NAME[k]||k)}</button>`).join('')}</div>
    <div class="words" id="wordGrid">${shown.map(wordTile).join('')||'<p class="muted">Nic jsem nenašel.</p>'}</div>
    ${list.length>shown.length?`<button class="btn ghost block" data-act="more">Ukázat dalších ${Math.min(40,list.length-shown.length)}</button>`:''}
  </section>
  <section class="card settings">
    <div class="label">Nastavení</div>
    <div class="row"><span>Obecná slova z úrovně</span><div class="seg">
      ${['auto',...LEVELS].map(v=>`<button data-act="newlvl" data-v="${v}" aria-pressed="${SET().newLevel===v}">${v==='auto'?'Postupně':v}</button>`).join('')}</div></div>
    <div class="row"><span>Slova ze statiky v lekci</span><div class="seg">
      ${PRO_MIX.map(o=>`<button data-act="promix" data-v="${o.v}" aria-pressed="${SET().proMix===o.v}">${o.t}</button>`).join('')}</div></div>
    <div class="row"><span>Nových slov v lekci</span><div class="seg">
      ${[3,5,8,12].map(n=>`<button data-act="per" data-v="${n}" aria-pressed="${SET().perLesson===n}">${n}</button>`).join('')}</div></div>
    <div class="row"><span>Zvuk</span><button class="btn ghost small" data-act="soundTest">Vyzkoušet zvuk</button></div>
    <div class="row"><span>Výslovnost</span><div class="seg">
      <button data-act="accent" data-v="en-GB" aria-pressed="${SET().accent==='en-GB'}">Britská</button>
      <button data-act="accent" data-v="en-US" aria-pressed="${SET().accent==='en-US'}">Americká</button></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn small ${draft&&dirty()?"":"ghost"}" data-act="saveSet" ${draft&&dirty()?"":"disabled"}>Potvrdit</button></div>
    <div class="row"><span>Účet</span>${FB.user?`<button class="btn ghost small" data-act="logout">Odhlásit</button>`:FB.ready?`<button class="btn soft small" data-act="login">Přihlásit přes Google</button>`:'<span class="muted" style="font-size:14px">synchronizace není nastavená</span>'}</div>
    <div class="row"><span>Záloha postupu</span><div class="row"><button class="btn ghost small" data-act="export">Stáhnout</button><button class="btn ghost small" data-act="import">Nahrát</button></div></div>
    <p class="muted" style="font-size:14px">Na mobilu si aplikaci přidej na plochu: v prohlížeči zvol Sdílet nebo menu ⋮ a pak „Přidat na plochu“. <b>Verze ${APP_VER}</b></p>
  </section>`,keep);
}

// ---------- study card ----------
function studyHtml(w,inSession){
  const p=prog(w.id);
  return `
  ${sceneHtml(w)}
  <section class="card">
    <div class="headword"><h2 lang="en">${esc(w.en)}</h2>
      <div class="row" style="flex-wrap:nowrap"><button class="say slow" data-act="say" data-t="${esc(w.en)}" data-slow="1" aria-label="Přehrát pomalu">${ICON.slow}</button>
      <button class="say" data-act="say" data-t="${esc(w.en)}" aria-label="Přehrát výslovnost">${ICON.speaker}</button></div></div>
    <div class="pron">${w.ipa?`<span class="ipa">/${esc(w.ipa)}/</span>`:''}${w.say?`<span>čti: <b>${esc(w.say)}</b></span>`:''}</div>
    <p class="meaning">= <b>${esc(w.cz)}</b></p>
    <div class="bridge">
      <div class="row" style="justify-content:space-between"><span class="label">Oslí můstek</span>
        <button class="say tiny" data-act="story" data-id="${esc(w.id)}" aria-label="Přečíst příběh nahlas">${ICON.speaker}</button></div>
      ${w.key?`<p class="sound"><span class="enw" lang="en">${esc(w.en)}</span><span class="arrow">zní jako</span><mark class="k">${esc(w.key)}</mark></p>`:''}
      <p class="story">${storyHtml(w)}</p>
      <p class="tip">Zavři na pár vteřin oči a představ si tu scénu co nejbarevněji, i se zvukem. Čím bláznivější, tím líp drží.</p>
    </div>
    ${w.ex?`<div class="example"><button class="say tiny" data-act="say" data-t="${esc(w.ex)}" aria-label="Přehrát větu">${ICON.speaker}</button><div><p class="en" lang="en">${esc(w.ex)}</p><p class="cz">${esc(w.exCz||'')}</p></div></div>`:''}
    <div class="write">
      <label class="label" for="writeIn">Napiš si ho</label>
      <input id="writeIn" class="field" data-target="${esc(w.en)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(w.en)}" lang="en">
      <button class="btn ghost small" data-act="times" data-t="${esc(w.en)}" style="align-self:flex-start">Opakuj nahlas 3× se mnou</button>
    </div>
  </section>
  ${inSession?`<button class="btn block" data-act="studied">Mám to v hlavě, vyzkoušej mě</button>`
   :`<div class="row"><button class="btn ghost" data-act="back" style="flex:1">Zpět</button>
     ${p.box>0?`<button class="btn ghost" data-act="known" data-id="${esc(w.id)}">Už umím</button>`:`<button class="btn ghost" data-act="known" data-id="${esc(w.id)}">Tohle znám</button>`}
     ${w.src?`<button class="btn ghost" data-act="del" data-id="${esc(w.id)}" style="color:var(--bad)">Smazat</button>`:''}</div>
     <p class="muted" style="font-size:14px;text-align:center">Zapamatováno ${p.box} z 5 · správně ${p.r}× · špatně ${p.w}×</p>`}`;
}
let backScroll=0;
function openWord(id){const w=byId(id);if(!w)return;backScroll=window.scrollY;VIEW='word';render(studyHtml(w,false));}

// ---------- session ----------
let SES=null;
function startSession(practice){
  const now=Date.now();let q=[];
  if(practice){
    let pool=all().filter(w=>prog(w.id).box>0);
    if(pool.length<4)pool=freshWords(8);
    q=pickN(pool,8).flatMap(w=>prog(w.id).box===0?[{id:w.id,mode:'study'},{id:w.id,mode:'test'}]:[{id:w.id,mode:'test'}]);
  }else{
    const due=shuffle(all().filter(w=>{const p=prog(w.id);return p.box>0&&p.due<=now;})).slice(0,30);
    const fresh=freshWords(S.settings.perLesson);
    const dq=due.map(w=>[{id:w.id,mode:'test'}]);
    const fq=fresh.map(w=>[{id:w.id,mode:'study'},{id:w.id,mode:'test'}]);
    while(dq.length||fq.length){if(fq.length)q.push(...fq.shift());if(dq.length)q.push(...dq.shift());if(dq.length)q.push(...dq.shift());}
  }
  if(!q.length){toast('Nic k učení.');return;}
  SES={queue:q,done:0,right:0,wrong:0,tries:{},extra:{},seen:new Set()};
  VIEW='session';next();
}
function topbar(){
  const total=SES.done+SES.queue.length,pct=total?Math.round(SES.done/total*100):0;
  return `<div class="topbar"><button class="x" data-act="quit" aria-label="Ukončit lekci">${ICON.x}</button>
  <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
  <span class="count">${SES.done}/${total}</span></div>`;
}
function next(){
  if(!SES)return home();
  const it=SES.queue[0];
  if(!it)return summary();
  const w=byId(it.id);
  if(!w){SES.queue.shift();return next();}
  SES.seen.add(w.id);
  if(it.mode==='study'){render(topbar()+studyHtml(w,true));sayEn(w.en);return;}
  const p=prog(w.id);
  const type=it.type||(p.box<=0?'pick':p.box===1?'listen':p.box===2?'pick':'type');
  SES.cur={w,type,hint:false,answered:false};
  renderTest();
}
function distractors(w,field){
  const val=String(w[field]).toLowerCase();
  const pool=all().filter(x=>x.level===w.level&&x.id!==w.id);
  const src=pool.length>=6?pool:all();
  const out=[],seen=new Set([val]);
  let guard=0;
  while(out.length<3&&guard++<200){const x=src[Math.floor(Math.random()*src.length)];const v=String(x[field]).toLowerCase();if(x.id!==w.id&&!seen.has(v)){seen.add(v);out.push(x);}}
  return out;
}
function renderTest(){
  const {w,type}=SES.cur;let body='';
  if(type==='pick'){
    const opts=shuffle([w,...distractors(w,'en')]);SES.cur.opts=opts;
    body=`${sceneHtml(w,true)}<section class="card"><p class="prompt">Jak se anglicky řekne</p><p class="prompt-word">${esc(w.cz)}</p>
    <div class="options">${opts.map((o,i)=>`<button class="opt" data-act="pick" data-i="${i}" lang="en">${esc(o.en)}</button>`).join('')}</div><div id="fb"></div></section>`;
  }else if(type==='listen'){
    const opts=shuffle([w,...distractors(w,'cz')]);SES.cur.opts=opts;
    body=`<section class="card"><p class="prompt">Poslechni si slovo a vyber, co znamená</p>
    <div class="listen"><button class="say" data-act="say" data-t="${esc(w.en)}" aria-label="Přehrát slovo">${ICON.speaker}</button>
    <button class="btn ghost small" data-act="say" data-t="${esc(w.en)}" data-slow="1">${ICON.slow} Pomaleji</button></div>
    <div class="options">${opts.map((o,i)=>`<button class="opt" data-act="pick" data-i="${i}">${esc(o.cz)}</button>`).join('')}</div><div id="fb"></div></section>`;
    setTimeout(()=>sayEn(w.en),250);
  }else{
    body=`${sceneHtml(w,true)}<section class="card"><p class="prompt">Napiš anglicky</p><p class="prompt-word">${esc(w.cz)}</p>
    <form id="typeForm" class="write"><input id="typeIn" class="field" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="en" placeholder="anglické slovo" aria-label="Anglické slovo">
    <div id="hintBox"></div>
    <div class="row"><button class="btn" type="submit" style="flex:1">Zkontrolovat</button><button class="btn ghost" type="button" data-act="hint">Nápověda</button></div></form>
    <div id="fb"></div></section>`;
  }
  render(topbar()+body);
  if(type==='type'){const i=document.getElementById('typeIn');if(i)i.focus({preventScroll:true});}
}
function grade(w,ok,hinted){
  const p={...prog(w.id)},now=Date.now();
  if(ok){p.r=(p.r||0)+1;p.box=hinted?Math.max(1,p.box):Math.min(5,p.box+1);}
  else{p.w=(p.w||0)+1;p.box=1;}
  p.due=now+(hinted&&ok?DAY:INT[p.box]);
  setProgress(w.id,p);
  const t=today(),y=dstr(now-DAY);
  if(S.streak.last!==t){S.streak={n:S.streak.last===y?S.streak.n+1:1,last:t};touchMeta();}
  SES.queue.shift();SES.done++;
  if(ok){SES.right++;
    if(p.box===1&&!SES.extra[w.id]){SES.extra[w.id]=1;SES.queue.push({id:w.id,mode:'test',type:'type'});}
  }else{SES.wrong++;
    SES.tries[w.id]=(SES.tries[w.id]||0)+1;
    if(SES.tries[w.id]<=2)SES.queue.splice(Math.min(3,SES.queue.length),0,{id:w.id,mode:'test',type:'pick'});
  }
}
function feedback(ok,note){
  const {w}=SES.cur;SES.cur.answered=true;
  const fb=document.getElementById('fb');
  fb.innerHTML=`<div class="feedback ${ok?'ok':'no'}">
    <h3>${ok?(note||'Správně!'):'Tentokrát ne'}</h3>
    <div class="row" style="flex-wrap:nowrap"><button class="say tiny" data-act="say" data-t="${esc(w.en)}" aria-label="Přehrát">${ICON.speaker}</button>
    <p><b lang="en" style="font-size:20px">${esc(w.en)}</b> ${w.ipa?`<span class="ipa">/${esc(w.ipa)}/</span>`:''} = ${esc(w.cz)}</p></div>
    ${ok?(w.key?`<p class="muted">Můstek: <mark class="k">${esc(w.key)}</mark></p>`:''):`<p class="story" style="font-size:17px">${storyHtml(w)}</p><p class="muted" style="font-size:14px">Za chvíli se tě na něj zeptám znovu.</p>`}
    <button class="btn block" data-act="next" id="nextBtn">Další</button></div>`;
  sayEn(w.en);
  const nb=document.getElementById('nextBtn');nb.focus({preventScroll:true});nb.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
const normEn=s=>s.toLowerCase().trim().replace(/[’']/g,"'").replace(/-/g,' ').replace(/^(to|a|an|the)\s+/,'').replace(/\s+/g,' ');
function checkTyped(){
  const c=SES.cur;if(c.answered)return;
  const inp=document.getElementById('typeIn');const v=normEn(inp.value);
  if(!v){inp.focus();return;}
  const target=normEn(c.w.en),d=lev(v,target),ok=d===0||(d===1&&target.length>=5);
  inp.classList.add(ok?'ok':'bad');inp.disabled=true;
  document.querySelectorAll('#typeForm button').forEach(b=>b.disabled=true);
  grade(c.w,ok,c.hint);
  feedback(ok,d===1&&ok?'Skoro! Jen malý překlep.':(c.hint&&ok?'Správně, s nápovědou':null));
}
function summary(){
  const s=SES,tot=s.right+s.wrong,pct=tot?Math.round(s.right/tot*100):0;
  const words=[...s.seen].map(byId).filter(Boolean);
  SES=null;VIEW='summary';
  render(`<section class="card sum"><p class="label">Lekce hotová</p><p class="big">${pct} %</p>
  <h2>${pct>=80?'Výborně!':pct>=50?'Dobrá práce':'Každé opakování se počítá'}</h2>
  <p class="muted">Správně ${s.right}×, špatně ${s.wrong}×. Další opakování naplánuju na dny, kdy bys slova začal zapomínat.</p>
  <button class="btn block" data-act="home">Hotovo</button></section>
  <div class="words">${words.map(wordTile).join('')}</div>`);
}

// ---------- add word ----------
function addView(){
  VIEW='add';
  render(`<div class="topbar"><button class="x" data-act="home" aria-label="Zpět">${ICON.x}</button><h2 style="font-size:24px">Vlastní slovíčko</h2></div>
  <form id="addForm" class="card form">
    <label for="fEn">Anglicky<input id="fEn" class="field" required autocomplete="off" autocapitalize="off" lang="en" placeholder="např. lucky"></label>
    <label for="fCz">Česky<input id="fCz" class="field" required autocomplete="off" placeholder="např. šťastný"></label>
    <div class="row"><button type="button" class="btn ghost small" data-act="tryEn">${ICON.speaker} Poslechnout</button></div>
    <label for="fKey">České slovo, které zní podobně<small>Musí znít jako anglická výslovnost, ne jako pravopis.</small><input id="fKey" class="field" autocomplete="off" placeholder="např. LAKýrník"></label>
    <label for="fStory">Příběh, který spojí zvuk s významem <small>Můstek dej do [hranatých] a význam do {složených} závorek. Věta musí sama nést význam.</small>
      <textarea id="fStory" class="field" placeholder="[Lakýrník] měl {štěstí}: spadl z lešení, ale přistál v kýblu s barvou."></textarea></label>
    <label for="fSay">Jak se to čte <small>česky přibližně, nepovinné</small><input id="fSay" class="field" autocomplete="off" placeholder="laki"></label>
    <label for="fScene">Obrázek z emoji <small>1–3 emoji, které scénu ukážou</small><input id="fScene" class="field" autocomplete="off" placeholder="🎨🍀" style="font-size:28px"></label>
    <label for="fEx">Příklad věty <small>nepovinné</small><input id="fEx" class="field" autocomplete="off" lang="en" placeholder="You are so lucky!"></label>
    <label for="fExCz">Překlad věty <small>nepovinné</small><input id="fExCz" class="field" autocomplete="off" placeholder="Ty máš ale štěstí!"></label>
    <div class="row">
      <label for="fLevel" style="flex:1">Úroveň<select id="fLevel" class="field">${TRACKS.map(L=>`<option value="${L}" ${L==='B1'?'selected':''}>${TRACK_NAME[L]}</option>`).join('')}</select></label>
      <label for="fCat" style="flex:1">Skupina<select id="fCat" class="field">${CATS.map(c=>`<option>${c}</option>`).join('')}</select></label>
    </div>
    <button class="btn block" type="submit">Uložit slovíčko</button>
  </form>`);
  document.getElementById('fEn').focus({preventScroll:true});
}
function saveWord(){
  const g=id=>(document.getElementById(id)?.value||'').trim();
  const en=g('fEn'),cz=g('fCz');
  if(!en||!cz){toast('Vyplň anglické i české slovo.');return;}
  if(all().some(w=>w.en.toLowerCase()===en.toLowerCase())){toast('Tohle slovo už v seznamu máš.');return;}
  const key=g('fKey');
  const w={id:'c_'+slug(en)+'_'+Math.random().toString(36).slice(2,6),en,cz,say:g('fSay'),key,story:g('fStory')||(key?`[${key}] = {${cz}}`:''),scene:g('fScene')||'💡',ex:g('fEx'),exCz:g('fExCz'),ipa:'',cat:g('fCat'),level:g('fLevel'),src:'me'};
  S.custom=S.custom.concat([w]);saveLocal();rebuildIndex();FB.addCustom(w);
  toast('Uloženo. Slovíčko přijde v příští lekci.');filter='Vše';home();
}

// ---------- backup ----------
function exportBackup(){
  const data=JSON.stringify({app:'osli-mustek',v:2,exported:new Date().toISOString(),progress:S.progress,custom:S.custom,settings:S.settings,streak:S.streak},null,0);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download='osli-mustek-zaloha-'+today()+'.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function importBackup(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const o=JSON.parse(r.result);
      if(o.app!=='osli-mustek')throw new Error('bad');
      let n=0;
      for(const [id,p] of Object.entries(o.progress||{})){const m=mergeEntry(S.progress[id],p);if(m!==S.progress[id]){S.progress[id]=m;FB.markDirty(id);n++;}}
      const ids=new Set(S.custom.map(w=>w.id));
      for(const w of (o.custom||[]))if(w&&w.id&&!ids.has(w.id)){S.custom.push(w);FB.addCustom(w);}
      saveLocal();rebuildIndex();home(true);
      toast('Záloha nahrána, aktualizováno '+n+' slov.');
    }catch(e){toast('Tenhle soubor není záloha z Oslího můstku.');}
  };
  r.readAsText(file);
}

// ---------- events ----------
const keepHome=()=>home(true);
// Nastavení se mění nanečisto a uloží se až tlačítkem Potvrdit.
let draft=null;
const SET=()=>draft||S.settings;
const dirty=()=>!!draft&&Object.keys(draft).some(k=>draft[k]!==S.settings[k]);
function setDraft(k,v){draft={...SET(),[k]:v};keepHome();}
const A={
  home:()=>home(), add:addView,
  back:()=>{home();window.scrollTo(0,backScroll);},
  start:()=>startSession(false), practice:()=>startSession(true),
  open:t=>openWord(t.dataset.id),
  filter:t=>{filter=t.dataset.v;limit=40;keepHome();},
  lvl:t=>{filter=t.dataset.v;limit=40;keepHome();document.getElementById('list')?.scrollIntoView({behavior:'smooth',block:'start'});},
  more:()=>{limit+=40;keepHome();},
  accent:t=>{setDraft('accent',t.dataset.v);speak('Hello',t.dataset.v,0.9);},
  per:t=>setDraft('perLesson',+t.dataset.v),
  newlvl:t=>setDraft('newLevel',t.dataset.v),
  promix:t=>setDraft('proMix',+t.dataset.v),
  saveSet:()=>{if(!draft)return;S.settings={...S.settings,...draft};draft=null;touchMeta();keepHome();toast('Nastavení uloženo, lekce se řídí novým nastavením.');},
  login:()=>FB.signIn(), logout:()=>FB.signOut(),
  export:exportBackup,
  import:()=>document.getElementById('importFile').click(),
  say:t=>sayEn(t.dataset.t,!!t.dataset.slow),
  times:t=>sayTimes(t.dataset.t,3),
  story:t=>{const w=byId(t.dataset.id);if(w)speak(storyPlain(w),'cs-CZ',0.95);},
  tryEn:()=>{const v=document.getElementById('fEn').value.trim();if(v)sayEn(v);else toast('Nejdřív napiš anglické slovo.');},
  studied:()=>{SES.queue.shift();next();},
  soundTest:()=>{const mode=useAudio||!window.speechSynthesis||!pickVoice(S.settings.accent)?'zvukový soubor z internetu':'hlas telefonu';toast('Přehrávám „Hello“ ('+mode+'). Verze aplikace '+APP_VER+'.');speak('Hello, this is a test.',S.settings.accent,0.9);},
  quit:()=>{if('speechSynthesis' in window)speechSynthesis.cancel();try{AUD.pause();}catch(e){}home();},
  next:()=>next(),
  known:t=>{const id=t.dataset.id;setProgress(id,{...prog(id),box:5,due:Date.now()+21*DAY});toast('Označeno jako známé. Za pár týdnů ti ho připomenu.');home();window.scrollTo(0,backScroll);},
  pick:t=>{
    const c=SES.cur;if(c.answered)return;
    const ok=c.opts[+t.dataset.i].id===c.w.id;
    document.querySelectorAll('.opt').forEach((b,i)=>{b.disabled=true;if(c.opts[i].id===c.w.id)b.classList.add('right');});
    if(!ok)t.classList.add('wrong');
    grade(c.w,ok,false);feedback(ok);
  },
  hint:()=>{
    const c=SES.cur;c.hint=true;
    document.getElementById('hintBox').innerHTML=`<div class="example" style="flex-direction:column;align-items:flex-start;gap:6px"><p>Začíná na <b lang="en">${esc(c.w.en[0])}</b> a má ${c.w.en.length} znaků.</p><p class="story" style="font-size:17px">${storyHtml(c.w)}</p></div>`;
    sayEn(c.w.en);
  },
  del:t=>{
    if(t.dataset.confirm!=='1'){t.dataset.confirm='1';t.textContent='Opravdu smazat?';return;}
    const id=t.dataset.id;
    S.custom=S.custom.filter(w=>w.id!==id);delete S.progress[id];saveLocal();rebuildIndex();FB.removeCustom(id);
    toast('Smazáno.');home();
  }
};
app.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(!t||t.disabled)return;const f=A[t.dataset.act];if(f){e.preventDefault();f(t,e);}});
app.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='typeForm')checkTyped();else if(e.target.id==='addForm')saveWord();});
document.getElementById('importFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importBackup(f);e.target.value='';});
let searchT;
app.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='search'){
    clearTimeout(searchT);
    searchT=setTimeout(()=>{
      query=t.value;limit=40;
      const q=query.trim().toLowerCase();
      const list=all().filter(w=>(filter==='Vše'||w.level===filter||(filter==='Moje'&&w.src)||(filter==='Učím se'&&prog(w.id).box>0))&&(!q||w.en.toLowerCase().includes(q)||String(w.cz).toLowerCase().includes(q)));
      const g=document.getElementById('wordGrid');
      if(g)g.innerHTML=list.slice(0,limit).map(wordTile).join('')||'<p class="muted">Nic jsem nenašel.</p>';
    },200);
    return;
  }
  if(t.id!=='writeIn')return;
  const target=t.dataset.target.toLowerCase(),v=t.value.toLowerCase().trim();
  t.classList.remove('ok','bad');
  if(!v)return;
  if(v===target){t.classList.add('ok');sayEn(t.dataset.target);}
  else if(!target.startsWith(v))t.classList.add('bad');
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&SES&&SES.cur&&SES.cur.answered&&document.activeElement?.id!=='typeIn'){const n=document.getElementById('nextBtn');if(n&&document.activeElement!==n){e.preventDefault();n.click();}}});

// ---------- boot ----------
(async function boot(){
  await loadWords();
  rebuildIndex();
  if(!WORDS.length){render('<div class="loading"><p>Slovíčka se nepodařilo načíst. Zkontroluj připojení a obnov stránku.</p></div>');return;}
  home();
  FB.init();
  if('serviceWorker' in navigator){
    // Když se stáhne nová verze aplikace, stránka se jednou sama obnoví.
    const had=!!navigator.serviceWorker.controller;let reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloaded){reloaded=true;location.reload();}});
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
  }
})();
})();
