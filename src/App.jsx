import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { App as NativeApp } from '@capacitor/app';
import { Health } from '@capgo/capacitor-health';

const APP_VERSION = '1.3.0';
const ANDROID_APK_URL = 'https://github.com/4uvakinvv-hue/fit-tracker/releases/download/android-current/forma-android.apk';
const IOS_INSTALL_URL = 'https://4uvakinvv-hue.github.io/fit-tracker/';

const ACTIVITIES = [
  { id: 'gym', label: 'Тренажёрка', icon: '🏋︎', accent: 'violet' },
  { id: 'bike', label: 'Велосипед', icon: '🚴', accent: 'amber' },
  { id: 'workout', label: 'Воркаут', icon: '┬', accent: 'coral' },
  { id: 'combat', label: 'Единоборства', icon: '🥊', accent: 'combat' },
  { id: 'hike', label: 'Поход', icon: '△', accent: 'hike' },
];

const GYM_GROUPS = [
  { id: 'chest', label: 'Грудь', icon: '◈' },
  { id: 'back', label: 'Спина', icon: '╫' },
  { id: 'legs', label: 'Ноги', icon: '⋔' },
  { id: 'custom', label: 'Своё', icon: '✦' },
];

const BASE_EXERCISES = {
  chest: ['Жим штанги лёжа','Жим гантелей лёжа','Жим в тренажёре','Отжимания на брусьях','Отжимания с весом','Жим штанги на наклонной'],
  back: ['Подтягивания','Тяга вертикального блока','Тяга горизонтального блока','Тяга штанги в наклоне','Тяга гантели к поясу','Становая тяга'],
  legs: ['Приседания со штангой','Жим ногами','Выпады','Румынская тяга','Болгарские выпады','Гакк-присед'],
};

const ACCESSORY_EXERCISES = [
  'Махи гантелей в стороны','Жим гантелей сидя','Разведения в наклоне','Тяга каната к лицу',
  'Подъём гантелей на бицепс','Сгибание рук со штангой','Французский жим','Разгибание рук на блоке',
  'Скручивания на пресс','Подъём ног на пресс','Подъёмы на носки',
];

function localDateKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function dateFromKey(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12);}
function addDays(date,amount){const r=new Date(date);r.setDate(r.getDate()+amount);return r;}
function addMonths(date,amount){const r=new Date(date);r.setMonth(r.getMonth()+amount);return r;}
function addYears(date,amount){const r=new Date(date);r.setFullYear(r.getFullYear()+amount);return r;}
function daysBetween(a,b){return Math.round((dateFromKey(b)-dateFromKey(a))/86400000);}
function formatDate(key,options={day:'numeric',month:'long'}){return new Intl.DateTimeFormat('ru-RU',options).format(dateFromKey(key));}
function formatDateShort(key){return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(dateFromKey(key));}
function activityMeta(type){
  return ACTIVITIES.find(a=>a.id===type)
    ||(type==='walk'?{id:'walk',label:'Прогулка',icon:'🚶',accent:'green'}:null);
}
function activityLabel(item){return item?.customTitle||activityMeta(item?.type)?.label||'';}
const ALL_GYM_EXERCISES=[...new Set([...Object.values(BASE_EXERCISES).flat(),...ACCESSORY_EXERCISES])];

function makeRows(n){return Array.from({length:n},()=>({exercise:'',sets:'',reps:'',weight:'',comment:''}));}
function normalizeRows(rows,n){return Array.from({length:n},(_,i)=>({
  exercise:rows?.[i]?.exercise||'',
  sets:rows?.[i]?.sets??'',
  reps:rows?.[i]?.reps??'',
  weight:rows?.[i]?.weight??'',
  comment:rows?.[i]?.comment||''
}));}
function rowTonnage(row){
  return Math.max(0,Number(row?.sets)||0)*Math.max(0,Number(row?.reps)||0)*Math.max(0,Number(row?.weight)||0);
}
function workoutTonnage(baseRows=[],extraRows=[]){
  return [...baseRows,...extraRows].reduce((sum,row)=>sum+rowTonnage(row),0);
}
function formatKg(value){return Math.round(Number(value)||0).toLocaleString('ru-RU');}
function mapSession(row){return {...row,gymGroup:row.gym_group,baseRows:row.base_rows||[],extraRows:row.extra_rows||[],workoutText:row.workout_text||'',combatType:row.combat_type||'',hikeDays:Number(row.hike_days)||0,hikeDistance:Number(row.hike_distance)||0,confirmed:row.confirmed!==false};}
function isFuture(key){return key>localDateKey();}
function isQualifyingSession(s){return s.confirmed!==false&&s.date<=localDateKey()&&(s.type!=='walk'||Number(s.steps||0)>=10000);}
function isStatsSession(s){return isQualifyingSession(s);}
function isHistorySession(s){return s.confirmed!==false&&s.date<=localDateKey();}

function withDynamicNumbers(list){
  const eligible=[...list]
    .filter(isQualifyingSession)
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));
  const map=new Map(eligible.map((s,i)=>[s.id,i+1]));
  return list.map(s=>({...s,displayNumber:map.get(s.id)||null}));
}

function seasonKey(date=new Date()){
  const m=date.getMonth()+1;
  if(m===12||m<=2)return 'winter';
  if(m<=5)return 'spring';
  if(m<=8)return 'summer';
  return 'autumn';
}

function seasonMeta(date=new Date()){
  const m=date.getMonth()+1;
  let start,name;
  if(m===12){start=new Date(date.getFullYear(),11,1,12);name='зима';}
  else if(m<=2){start=new Date(date.getFullYear()-1,11,1,12);name='зима';}
  else if(m<=5){start=new Date(date.getFullYear(),2,1,12);name='весна';}
  else if(m<=8){start=new Date(date.getFullYear(),5,1,12);name='лето';}
  else {start=new Date(date.getFullYear(),8,1,12);name='осень';}
  const end=addDays(addMonths(start,3),-1);
  const day=daysBetween(localDateKey(start),localDateKey(date))+1;
  const total=daysBetween(localDateKey(start),localDateKey(end))+1;
  const previousStart=addMonths(start,-3);
  const pm=previousStart.getMonth()+1;
  const previousName=pm===12?'зима':pm===3?'весна':pm===6?'лето':'осень';
  return {name,start:localDateKey(start),end:localDateKey(end),day,total,previousName};
}

function pointEvents(sessions,hookahEvents=[]){
  const season=seasonMeta();
  const ordered=[...sessions]
    .filter(s=>isQualifyingSession(s)&&s.date>=season.start&&s.date<=season.end)
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));

  let prev=null;
  let rawBalance=0;
  const events=ordered.map(s=>{
    const reasons=[];
    let delta=s.type==='hike'
      ?5*Math.max(Number(s.hikeDays)||1,1)
      :(s.type==='gym'||s.type==='bike'||s.type==='combat')?5:3;
    reasons.push(s.type==='hike'
      ?`Поход: ${Math.max(Number(s.hikeDays)||1,1)} дн. × 5 = +${delta}`
      :`${activityMeta(s.type)?.label||'Активность'}: +${delta}`);

    if(prev){
      const gap=daysBetween(prev.date,s.date);
      let interval=0;
      let reason='';
      if(gap===1){interval=2;reason='Тренировка на следующий день';}
      else if(gap===2){interval=1;reason='Перерыв один день';}
      else if(gap>=6&&gap<=13){interval=-Math.floor((gap-4)/2);reason=`Перерыв ${gap-1} дн.`;}
      else if(gap>=14){interval=10;reason='Возвращение после 14+ дней';}
      if(interval!==0){
        delta+=interval;
        reasons.push(`${reason}: ${interval>0?'+':''}${interval}`);
      }
    }

    if(s.type==='bike'&&Number(s.distance||0)>100){delta+=5;reasons.push('Велосипед более 100 км: +5');}
    if(s.type==='walk'&&Number(s.steps||0)>30000){delta+=5;reasons.push('Прогулка более 30 000 шагов: +5');}

    rawBalance+=delta;
    prev=s;
    return {id:s.id,date:s.date,createdAt:s.created_at||'',delta,reasons:reasons.join(' · ')};
  });

  if(prev){
    const inactiveDays=daysBetween(prev.date,localDateKey());
    let decay=0;
    if(inactiveDays>=45)decay=Math.max(0,rawBalance);
    else if(inactiveDays>5)decay=Math.min(Math.max(0,rawBalance),Math.floor((inactiveDays-4)/2));

    if(decay>0){
      events.push({
        id:`inactivity-${localDateKey()}`,
        date:localDateKey(),
        delta:-decay,
        reasons:inactiveDays>=45
          ? '45 дней без тренировок: рейтинг обнулён'
          : `Нет тренировок ${inactiveDays} дн.: снижение рейтинга`
      });
    }
  }

  hookahEvents
    .filter(h=>h.event_date>=season.start&&h.event_date<=season.end)
    .forEach(h=>events.push({
      id:`hookah-${h.id}`,
      date:h.event_date,
      createdAt:h.smoked_at||'',
      delta:-2,
      reasons:'Выкуренный кальян: -2'
    }));

  return events.sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}
function scoreHint(sessions){
  const completed=sessions.filter(isQualifyingSession);
  if(!completed.length)return 'Первая тренировка — уже сильный шаг';
  const latest=[...completed].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
  const gap=daysBetween(latest.date,localDateKey());
  if(gap>=45)return '45 дней без тренировок — рейтинг обнулён';
  if(gap>=14)return 'Возвращение сейчас даст +10 баллов';
  if(gap<=0)return 'Тренировка сегодня уже в зачёте';
  if(gap===1)return 'Сегодня серия даст ещё +2 балла';
  if(gap===2)return 'Идеальный ритм: через день, +1 балл';
  if(gap<=5)return 'Можно возвращаться без штрафа';
  return 'Следующая тренировка важнее паузы';
}

function sessionValue(s){
  if(s.type==='bike')return s.distance?`${s.distance} км`:'Без километража';
  if(s.type==='walk')return s.steps?`${Number(s.steps).toLocaleString('ru-RU')} шагов`:'Без шагов';
  if(s.type==='workout')return s.workoutText?'Описание':'Воркаут';
  if(s.type==='combat')return s.combatType||'Единоборства';
  if(s.type==='hike')return `${Math.max(Number(s.hikeDays)||1,1)} дн. · ${Number(s.hikeDistance||0).toLocaleString('ru-RU')} км`;
  if(s.type==='gym')return GYM_GROUPS.find(g=>g.id===s.gymGroup)?.label||'Тренажёрка';
  return '';
}

function ActivityGlyph({type,className=''}) {
  if(type==='bike') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="43" r="10"/><circle cx="49" cy="43" r="10"/><path d="M16 43 27 24l10 19H16Zm11-19h11l11 19M25 18h9m4 6 6-7h6m-1 0 5 2"/></svg>;
  if(type==='workout') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M10 12v42M54 12v42M10 16h44"/><circle cx="32" cy="25" r="5"/><path d="M32 30v15M32 33 21 22M32 33l11-11M32 45l-8 9M32 45l8 9"/></svg>;
  if(type==='steps') return <span className={className}>👣</span>;
  if(type==='hike') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M5 51 23 23l9 14 8-12 19 26H5Z"/><path d="m18 31 5-8 5 8m8 2 4-8 5 7"/><path d="M12 51h40"/></svg>;
  const meta=activityMeta(type);
  return <span className={className}>{meta?.icon||'•'}</span>;
}

function Brand({compact=false}){
  return <div className={`logo-lockup ${compact?'compact':''}`}>
    <img className="brand-app-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt=""/>
    <span>Форма</span>
  </div>;
}

function SplashScreen(){
  return <main className="splash-screen">
    <div className="splash-brand"><Brand/><p>Тренировки. Питание. Прогресс.</p></div>
  </main>;
}

function AuthScreen(){
  const [loginEmail,setLoginEmail]=useState('');
  const [loginPassword,setLoginPassword]=useState('');
  const [registerOpen,setRegisterOpen]=useState(false);
  const [name,setName]=useState('');
  const [registerEmail,setRegisterEmail]=useState('');
  const [registerPassword,setRegisterPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');

  async function login(e){
    e.preventDefault();
    setBusy('login');setMessage('');
    try{
      const {error}=await supabase.auth.signInWithPassword({email:loginEmail.trim(),password:loginPassword});
      if(error)throw error;
    }catch(err){setMessage(err.message||'Не получилось войти.');}
    finally{setBusy('');}
  }

  async function register(e){
    e.preventDefault();
    setBusy('register');setMessage('');
    try{
      if(!name.trim())throw new Error('Укажи имя.');
      const {data,error}=await supabase.auth.signUp({
        email:registerEmail.trim(),
        password:registerPassword,
        options:{
          data:{name:name.trim(),app_name:'Форма'},
          emailRedirectTo:'https://4uvakinvv-hue.github.io/fit-tracker/'
        }
      });
      if(error)throw error;
      if(!data.session)setMessage('Аккаунт создан. На почту отправлено письмо подтверждения для приложения «Форма».');
    }catch(err){setMessage(err.message||'Не получилось зарегистрироваться.');}
    finally{setBusy('');}
  }

  return <main className={`onboarding dark-screen auth-screen season-${seasonKey()}`}>
    <Brand/>
    <p className="brand-subtitle season-brand-label">Сезон {seasonMeta().name.toUpperCase()}</p>
    <h1>Вход</h1>
    <p className="soft-text">Уже зарегистрированы — просто войдите. Новый участник может создать аккаунт ниже на этом же экране.</p>

    <form className="glass-card onboarding-form login-form" onSubmit={login}>
      <label className="dark-field"><span>E-mail</span><input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Пароль" required/></label>
      <button className="gradient-button" disabled={busy==='login'}>{busy==='login'?'Входим…':'Войти'}</button>
    </form>

    <div className="register-entry">
      <span>Впервые в «Форме»?</span>
      <button onClick={()=>{setRegisterOpen(v=>!v);setMessage('');}}>{registerOpen?'Свернуть регистрацию':'Регистрация'}</button>
    </div>

    {registerOpen&&<form className="glass-card onboarding-form register-form" onSubmit={register}>
      <label className="dark-field"><span>Имя</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя в рейтинге" required/></label>
      <label className="dark-field"><span>E-mail</span><input type="email" value={registerEmail} onChange={e=>setRegisterEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={registerPassword} onChange={e=>setRegisterPassword(e.target.value)} placeholder="Минимум 6 символов" minLength={6} required/></label>
      <button className="gradient-button" disabled={busy==='register'}>{busy==='register'?'Создаём аккаунт…':'Создать аккаунт'}</button>
    </form>}

    {message&&<p className="auth-message auth-global-message">{message}</p>}
    <p className="build-version">Версия {APP_VERSION}</p>
  </main>;
}
export default function App(){
  const [authSession,setAuthSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [members,setMembers]=useState([]);
  const [previousTop5,setPreviousTop5]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [schedule,setSchedule]=useState({});
  const [gymTemplates,setGymTemplates]=useState({});
  const [dailySteps,setDailySteps]=useState([]);
  const [isBoss,setIsBoss]=useState(false);
  const [hookahEvents,setHookahEvents]=useState([]);
  const [hookahStartedOn,setHookahStartedOn]=useState(localDateKey());
  const [undoHookahId,setUndoHookahId]=useState(null);
  const [saveNotice,setSaveNotice]=useState('');
  const [stepsStatus,setStepsStatus]=useState('loading');
  const [stepsSyncing,setStepsSyncing]=useState(false);
  const [screen,setScreen]=useState('home');
  const [selectedDateKey,setSelectedDateKey]=useState(localDateKey());
  const [draftDateKey,setDraftDateKey]=useState(localDateKey());
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [booting,setBooting]=useState(true);

  const numberedSessions=useMemo(()=>withDynamicNumbers(sessions),[sessions]);

  useEffect(()=>{
    let active=true;
    let initialized=false;
    const timeout=new Promise(resolve=>setTimeout(()=>resolve({data:{session:null}}),2600));
    const minimum=new Promise(resolve=>setTimeout(resolve,500));

    Promise.all([
      Promise.race([supabase.auth.getSession().catch(()=>({data:{session:null}})),timeout]),
      minimum
    ]).then(([result])=>{
      if(!active)return;
      initialized=true;
      setAuthSession(result?.data?.session||null);
      setBooting(false);
    });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(!active)return;
      setAuthSession(next);
      if(!next&&initialized)setBooting(false);
    });

    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    window.history.replaceState({...window.history.state,formaScreen:'home',formaDepth:0},'');
    setScreen('home');
    const onPop=e=>setScreen(e.state?.formaScreen||'home');
    window.addEventListener('popstate',onPop);
    return ()=>window.removeEventListener('popstate',onPop);
  },[]);

  useEffect(()=>{
    let handle;
    NativeApp.addListener('backButton',()=>{
      const depth=window.history.state?.formaDepth||0;
      if(depth>0)window.history.back();
      else NativeApp.minimizeApp().catch(()=>{});
    }).then(h=>{handle=h;}).catch(()=>{});

    return ()=>{handle?.remove?.();};
  },[]);

  useEffect(()=>{
    let handle;
    NativeApp.addListener('appStateChange',async({isActive})=>{
      if(!isActive)return;

      try{
        const timeout=new Promise(resolve=>setTimeout(()=>resolve(null),5000));
        const refreshed=await Promise.race([
          supabase.auth.refreshSession().catch(()=>null),
          timeout
        ]);
        const nextSession=refreshed?.data?.session;

        if(nextSession){
          setAuthSession(nextSession);
          await loadData(true,nextSession);
          await syncSteps(false,nextSession);
          return;
        }

        const {data}=await supabase.auth.getSession();
        if(data?.session){
          setAuthSession(data.session);
          await loadData(true,data.session);
          await syncSteps(false,data.session);
        }
      }catch(err){
        console.warn('Forma resume refresh failed',err);
      }
    }).then(h=>{handle=h;}).catch(()=>{});

    return ()=>{handle?.remove?.();};
  },[]);

  useEffect(()=>{
    if(authSession?.user){
      loadData(false,authSession);
      syncSteps(false,authSession);
    }else{
      setLoading(false);setProfile(null);setMembers([]);setPreviousTop5([]);
      setSessions([]);setSchedule({});setGymTemplates({});setDailySteps([]);
      setIsBoss(false);setHookahEvents([]);setUndoHookahId(null);
      setStepsStatus('loading');
    }
  },[authSession?.user?.id]);


  async function syncSteps(requestPermission=false,sessionOverride=authSession){
    if(!sessionOverride?.user||stepsSyncing)return;
    setStepsSyncing(true);

    try{
      const availability=await Health.isAvailable();
      if(!availability?.available){
        setStepsStatus('unavailable');
        return;
      }

      const authOptions={read:['steps'],write:[],requestHistoryAccess:true};
      let authorization=await Health.checkAuthorization(authOptions);

      if(!authorization?.readAuthorized?.includes('steps')){
        if(!requestPermission){
          setStepsStatus('permission');
          return;
        }

        authorization=await Health.requestAuthorization(authOptions);
        if(!authorization?.readAuthorized?.includes('steps')){
          setStepsStatus('permission');
          return;
        }
      }

      const start=addYears(new Date(),-1);
      start.setHours(0,0,0,0);
      const end=new Date();

      const result=await Health.queryAggregated({
        dataType:'steps',
        startDate:start.toISOString(),
        endDate:end.toISOString(),
        bucket:'day',
        aggregation:'sum',
      });

      const userId=sessionOverride.user.id;
      const byDate=new Map();

      (result?.samples||[]).forEach(sample=>{
        const date=localDateKey(new Date(sample.startDate));
        const value=Math.max(0,Math.round(Number(sample.value)||0));
        byDate.set(date,Math.max(value,byDate.get(date)||0));
      });

      const rows=[...byDate.entries()].map(([date,steps])=>({
        user_id:userId,
        date,
        steps,
        source:'health_connect',
        updated_at:new Date().toISOString(),
      }));

      if(rows.length){
        const {error}=await supabase.from('daily_steps').upsert(rows,{onConflict:'user_id,date'});
        if(error)throw error;
      }

      const {data,error}=await supabase
        .from('daily_steps')
        .select('date,steps')
        .eq('user_id',userId)
        .gte('date',localDateKey(start))
        .order('date',{ascending:true});

      if(error)throw error;
      setDailySteps((data||[]).map(x=>({date:x.date,steps:Number(x.steps)||0})));
      setStepsStatus('ready');
    }catch(err){
      console.warn('Forma steps sync failed',err);
      setStepsStatus('error');
    }finally{
      setStepsSyncing(false);
    }
  }

  function navigate(next){
    if(next===screen)return;
    const depth=(window.history.state?.formaDepth||0)+1;
    window.history.pushState({...window.history.state,formaScreen:next,formaDepth:depth},'');
    setScreen(next);
  }

  function goBack(fallback='home'){
    const depth=window.history.state?.formaDepth||0;
    if(depth>0)window.history.back();
    else setScreen(fallback);
  }

  function resetHome(){
    const depth=window.history.state?.formaDepth||0;
    if(depth>0)window.history.go(-depth);
    else setScreen('home');
  }

  async function loadData(silent=false,sessionOverride=authSession){
    if(!sessionOverride?.user)return;
    if(!silent){
      setLoading(true);
      setLoadError('');
    }
    const userId=sessionOverride.user.id;

    try{
      const queries=Promise.all([
        supabase.from('profiles').select('*').eq('id',userId).single(),
        supabase.rpc('current_leaderboard'),
        supabase.rpc('previous_season_top5'),
        supabase.from('sessions').select('*').eq('user_id',userId).order('date',{ascending:true}).order('created_at',{ascending:true}),
        supabase.from('plans').select('*').eq('user_id',userId),
        supabase.from('gym_templates').select('*').eq('user_id',userId),
        supabase.from('daily_steps').select('date,steps').eq('user_id',userId).gte('date',localDateKey(addYears(new Date(),-1))).order('date',{ascending:true}),
        supabase.from('boss_users').select('user_id,hookah_started_on').eq('user_id',userId).maybeSingle(),
        supabase.from('hookah_events').select('id,event_date,smoked_at').eq('user_id',userId).order('smoked_at',{ascending:true}),
      ]);

      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),9000));
      const [profileRes,leaderRes,previousRes,sessionsRes,plansRes,templatesRes,stepsRes,bossRes,hookahRes]=await Promise.race([queries,timeout]);

      if(profileRes.error)throw profileRes.error;
      if(leaderRes.error)throw leaderRes.error;
      if(previousRes.error)throw previousRes.error;

      const leaderboard=leaderRes.data||[];
      const me=leaderboard.find(x=>x.id===userId);
      if(profileRes.data)setProfile({...profileRes.data,points:me?.points||0,rank:me?.rank||null});
      setMembers(leaderboard);
      setPreviousTop5(previousRes.data||[]);
      const loadedSessions=(sessionsRes.data||[]).map(mapSession);
      setSessions(loadedSessions);

      const plans={};
      (plansRes.data||[]).forEach(p=>{
        const completedOnDate=loadedSessions.some(s=>s.date===p.date&&isQualifyingSession(s));
        const forcedStatus=completedOnDate?'completed':'planned';
        plans[p.date]={type:p.type,status:forcedStatus,customTitle:p.custom_title||'',updatedAt:p.updated_at};
      });
      setSchedule(plans);

      const templates={};
      (templatesRes.data||[]).forEach(t=>{templates[t.gym_group]={baseRows:t.base_rows||[],extraRows:t.extra_rows||[]};});
      setGymTemplates(templates);
      setDailySteps((stepsRes.data||[]).map(x=>({date:x.date,steps:Number(x.steps)||0})));
      const boss=!!bossRes.data;
      setIsBoss(boss);
      setHookahStartedOn(bossRes.data?.hookah_started_on||localDateKey());
      setHookahEvents(boss?(hookahRes.data||[]):[]);
    }catch(err){
      console.error('Forma load error',err);
      if(!silent)setLoadError('Не удалось связаться с общей базой. Проверь интернет и нажми «Повторить».');
    }finally{
      if(!silent){
        setLoading(false);
        setBooting(false);
      }
    }
  }

  async function savePlan(date,type,customTitle='',status='planned'){
    if(!authSession?.user)return;
    const finalStatus=isFuture(date)?'planned':status;
    const {error}=await supabase.from('plans').upsert({
      user_id:authSession.user.id,date,type,custom_title:customTitle||null,status:finalStatus,updated_at:new Date().toISOString()
    });
    if(error)throw error;
    setSchedule(cur=>({...cur,[date]:{type,status:finalStatus,customTitle,updatedAt:Date.now()}}));
  }

  async function deletePlan(date){
    if(!authSession?.user)return;
    await supabase.from('plans').delete().eq('user_id',authSession.user.id).eq('date',date);
    setSchedule(cur=>{const next={...cur};delete next[date];return next;});
  }

  async function sendProposal(title){
    if(!authSession?.user||!title.trim())return;
    const {error}=await supabase.from('activity_proposals').insert({user_id:authSession.user.id,title:title.trim()});
    if(error)throw error;
  }

  function openAdd(){
    setDraftDateKey(selectedDateKey||localDateKey());
    navigate('add-training');
  }

  async function chooseType(type){
    await savePlan(draftDateKey,type,'','planned');
    navigate(type);
  }

  async function saveSession(payload){
    if(isFuture(payload.date)){
      await savePlan(payload.date,payload.type,payload.title||'','planned');
      setSelectedDateKey(payload.date);
      resetHome();
      return;
    }

    const lowWalk=payload.type==='walk'&&Number(payload.steps||0)<10000;
    const row={
      user_id:authSession.user.id,
      number:null,
      type:payload.type,
      date:payload.date,
      title:payload.title||null,
      distance:payload.distance??null,
      duration:null,
      steps:payload.steps??null,
      workout_text:payload.workoutText||null,
      combat_type:payload.combatType||null,
      hike_days:payload.hikeDays??null,
      hike_distance:payload.hikeDistance??null,
      gym_group:payload.gymGroup||null,
      base_rows:payload.baseRows||null,
      extra_rows:payload.extraRows||null,
      confirmed:true,
    };

    const {error}=await supabase.from('sessions').insert(row);
    if(error)throw error;

    await savePlan(payload.date,payload.type,payload.title||'',lowWalk?'planned':'completed');
    if(payload.type==='gym'){
      const tonnage=workoutTonnage(payload.baseRows||[],payload.extraRows||[]);
      setSaveNotice(`Тренировка сохранена · тоннаж ${formatKg(tonnage)} кг`);
      setTimeout(()=>setSaveNotice(''),3500);
    }
    setSelectedDateKey(payload.date);
    await loadData();
    resetHome();
  }

  async function deleteSession(id){
    const target=sessions.find(s=>s.id===id);
    if(!target)return;

    const {error}=await supabase.from('sessions').delete().eq('id',id);
    if(error)throw error;

    const remaining=sessions
      .filter(s=>s.id!==id&&s.date===target.date&&isHistorySession(s))
      .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));

    if(remaining.length){
      const last=remaining[0];
      await savePlan(last.date,last.type,last.title||'',isQualifyingSession(last)?'completed':'planned');
    }else{
      await deletePlan(target.date);
    }

    await loadData();
  }

  async function saveTemplate(group,baseRows,extraRows){
    const {error}=await supabase.from('gym_templates').upsert({
      user_id:authSession.user.id,gym_group:group,base_rows:baseRows,extra_rows:extraRows,updated_at:new Date().toISOString()
    });
    if(error)throw error;
    setGymTemplates(cur=>({...cur,[group]:{baseRows,extraRows}}));
  }

  async function addHookah(){
    if(!isBoss||!authSession?.user)return;
    const today=localDateKey();
    const {data,error}=await supabase.from('hookah_events').insert({
      user_id:authSession.user.id,
      event_date:today,
    }).select('id,event_date,smoked_at').single();
    if(error)throw error;
    setUndoHookahId(data.id);
    setTimeout(()=>setUndoHookahId(cur=>cur===data.id?null:cur),15000);
    await loadData(true);
  }

  async function undoHookah(){
    if(!isBoss||!undoHookahId)return;
    const {error}=await supabase.from('hookah_events').delete().eq('id',undoHookahId).eq('user_id',authSession.user.id);
    if(error)throw error;
    setUndoHookahId(null);
    await loadData(true);
  }

  async function requestTrainer(){
    const {error}=await supabase.from('trainer_requests').insert({
      user_id:authSession.user.id,
      contact_email:authSession.user.email||null,
      member_name:profile?.name||null,
    });
    if(error)throw error;
  }

  if(booting||(authSession&&loading))return <SplashScreen/>;
  if(!authSession)return <AuthScreen/>;
  if(loadError)return <main className="onboarding dark-screen"><Brand/><h1>Связь с базой</h1><p className="soft-text">{loadError}</p><div className="glass-card onboarding-form"><button className="gradient-button" onClick={loadData}>Повторить</button></div></main>;

  return <div className={`app-shell-dark season-${seasonKey()} screen-${screen}`}>
    {screen==='home'&&<Home schedule={schedule} sessions={numberedSessions} profile={profile} dailySteps={dailySteps} saveNotice={saveNotice} isBoss={isBoss} hookahEvents={hookahEvents} canUndoHookah={!!undoHookahId} onHookah={addHookah} onUndoHookah={undoHookah} stepsStatus={stepsStatus} stepsSyncing={stepsSyncing} onEnableSteps={()=>syncSteps(true,authSession)} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={savePlan} onDeletePlan={deletePlan} onProposal={sendProposal} onOpenWorkout={openAdd}/>} 
    {screen==='history'&&<History sessions={numberedSessions} onDelete={deleteSession}/>}
    {screen==='stats'&&<Statistics sessions={numberedSessions} dailySteps={dailySteps} isBoss={isBoss} hookahEvents={hookahEvents} hookahStartedOn={hookahStartedOn} profile={profile} memberCount={members.length} onOpenMembers={()=>navigate('members')}/>}
    {screen==='members'&&<Members members={members} profile={profile} previousTop5={previousTop5}/>}
    {screen==='add-training'&&<AddTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} onProposal={sendProposal} onBack={()=>goBack('home')} onChoose={chooseType}/>}
    {screen==='gym'&&<GymTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} gymTemplates={gymTemplates} onSaveTemplate={saveTemplate} onBack={()=>goBack('add-training')} onHistory={()=>navigate('gym-history')} onSave={saveSession} onTrainerRequest={requestTrainer}/>}
    {screen==='gym-history'&&<GymHistory sessions={numberedSessions.filter(s=>s.type==='gym'&&isHistorySession(s))} onBack={()=>goBack('gym')}/>}
    {screen==='bike'&&<SimpleTraining type="bike" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onSave={saveSession}/>}
    {screen==='workout'&&<WorkoutTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('workout-history')} onSave={saveSession}/>}
    {screen==='workout-history'&&<WorkoutHistory sessions={numberedSessions.filter(s=>s.type==='workout'&&isHistorySession(s))} onBack={()=>goBack('workout')}/>}
    {screen==='combat'&&<CombatTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('combat-history')} onSave={saveSession}/>}
    {screen==='combat-history'&&<CombatHistory sessions={numberedSessions.filter(s=>s.type==='combat'&&isHistorySession(s))} onBack={()=>goBack('combat')}/>}
    {screen==='hike'&&<HikeTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('hike-history')} onSave={saveSession}/>}
    {screen==='hike-history'&&<HikeHistory sessions={numberedSessions.filter(s=>s.type==='hike'&&isHistorySession(s))} onBack={()=>goBack('hike')}/>}
    {screen==='about'&&<AboutScreen/>}
    {screen==='why'&&<WhyScreen onBack={()=>goBack('home')}/>}
    <BottomNav screen={screen} onNavigate={navigate}/>
  </div>;
}

function BottomNav({screen,onNavigate}){
  const active=['add-training','gym','gym-history','bike','workout','workout-history','combat','combat-history','hike','hike-history','why'].includes(screen)?'home':screen;
  const items=[['home','⌂','Главная'],['history','▥','История'],['stats','▤','Статистика'],['members','♟','Участники'],['about','ⓘ','О приложении']];
  return <nav className="bottom-nav five">
    {items.map(([key,icon,label])=><button key={key} className={active===key?'active':''} onClick={()=>onNavigate(key)}><span className="nav-icon">{icon}</span>{label}</button>)}
  </nav>;
}

function Home({schedule,sessions,profile,dailySteps,saveNotice,isBoss,hookahEvents,canUndoHookah,onHookah,onUndoHookah,stepsStatus,stepsSyncing,onEnableSteps,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal,onOpenWorkout}){
  const [pointsOpen,setPointsOpen]=useState(false);
  const events=pointEvents(sessions,hookahEvents).slice(-10).reverse();
  const todayKey=localDateKey();
  const todayHookahs=hookahEvents.filter(h=>h.event_date===todayKey).length;
  const sevenStart=localDateKey(addDays(new Date(),-6));
  const sevenHookahs=hookahEvents.filter(h=>h.event_date>=sevenStart&&h.event_date<=todayKey).length;
  const todayMoney=Math.max(0,1000-todayHookahs*500);
  const season=seasonMeta();
  const seasonProgress=Math.max(0,Math.min(100,(season.day/season.total)*100));

  return <main className="main-screen home-no-scroll">
    <header className="topbar home-topbar">
      <div className="home-brand-block">
        <Brand compact/>
        <div className="season-title-row">
          <span>Сезон</span>
          <strong>{season.name.toUpperCase()}</strong>
          <i className="season-leaf-icon" aria-hidden="true"/>
        </div>
        <p className="season-motto">Движение. Дисциплина. Результат.</p>
      </div>

      <div className="score-wrap">
        <button className="score-card season-score-card" onClick={()=>setPointsOpen(true)}>
          <div className="score-main-row">
            <span className="score-star">★</span>
            <strong>Баллы: {profile?.points||0}</strong>
            <b>›</b>
          </div>
          <div className="score-day-row">
            <span>День {season.day} из {season.total}</span>
            <i className="season-leaf-icon small" aria-hidden="true"/>
          </div>
          <span className="season-progress-track"><i style={{width:`${seasonProgress}%`}}/></span>
        </button>
        <small>{scoreHint(sessions)}</small>
      </div>
    </header>

    <div className="home-quick-row">
      {isBoss&&<section className="hookah-quick-card">
        <div className="hookah-money"><small>Сегодня доступно</small><strong>{todayMoney.toLocaleString('ru-RU')} ₽</strong></div>
        <div className="hookah-seven"><small>За 7 дней</small><strong>{sevenHookahs} из 14</strong></div>
        <button className="hookah-button" onClick={onHookah}>Выкуренный кальян</button>
        {canUndoHookah&&<button className="hookah-undo" onClick={onUndoHookah}>Отменить последнее</button>}
      </section>}
      <button className={`today-steps-chip ${stepsStatus}`} onClick={stepsStatus==='ready'?undefined:onEnableSteps} disabled={stepsSyncing}>
        <span className="steps-foot">👣</span>
        <span>
          <strong>{stepsStatus==='ready'?(dailySteps.find(x=>x.date===localDateKey())?.steps||0).toLocaleString('ru-RU'):stepsSyncing?'Синхронизация…':'Шаги за сегодня'}</strong>
          <small>{stepsStatus==='ready'?'шагов сегодня':stepsStatus==='unavailable'?'Недоступно на этом устройстве':'Подключить автоматический шагомер'}</small>
        </span>
      </button>
    </div>

    <DateWheel schedule={schedule} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={onSavePlan} onDeletePlan={onDeletePlan} onProposal={onProposal}/>

    <button className="gradient-button workout-cta" onClick={onOpenWorkout}><span>＋</span>Добавить тренировку<b>›</b></button>
    <p className="helper-text">Выбранная дата: {formatDate(selectedDateKey)}.</p>
    {saveNotice&&<div className="save-toast">✓ {saveNotice}</div>}

    {pointsOpen&&<div className="modal-backdrop" onClick={()=>setPointsOpen(false)}>
      <section className="points-modal" onClick={e=>e.stopPropagation()}>
        <header><div><small>Сезон {season.name}</small><h2>История баллов</h2></div><button onClick={()=>setPointsOpen(false)}>×</button></header>
        {!events.length&&<div className="empty-state compact-empty">Начислений в этом сезоне пока нет.</div>}
        <div className="points-events">{events.map(event=><article key={event.id}>
          <div><strong>{formatDate(event.date,{day:'numeric',month:'long'})}</strong><small>{event.reasons}</small></div>
          <b className={event.delta>=0?'plus':'minus'}>{event.delta>=0?'+':''}{event.delta}</b>
        </article>)}</div>
      </section>
    </div>}
  </main>;
}

function WhyScreen({onBack}){
  return <main className="sub-screen why-screen">
    <ScreenBack onBack={onBack} title="О чём это приложение"/>

    <section className="why-intro glass-card">
      <span className="why-kicker">Форма</span>
      <h1>Не про идеальные тренировки.<br/>Про то, чтобы чаще двигаться.</h1>
      <p>Неважно, что именно ты делаешь: идёшь в зал, катаешься на велосипеде, гуляешь, занимаешься на турниках или уходишь в поход. Всё это — активность.</p>
    </section>

    <div className="why-flow">
      <section>
        <h2>Сделал что-то активное — зафиксируй это</h2>
        <p>Со временем ты начинаешь видеть не отдельные тренировки, а картину целиком: как часто двигаешься, сколько уже сделал, где выпал из ритма и насколько стал активнее за месяц, полгода или год.</p>
      </section>

      <section>
        <h2>Баллы — не оценка твоей физической формы</h2>
        <p>Они показывают регулярность. За активность начисляются баллы, стабильность поощряется, а длинные паузы постепенно снижают рейтинг.</p>
        <blockquote>Лучше регулярно делать хоть что-то, чем раз в месяц совершать спортивный подвиг.</blockquote>
      </section>

      <section>
        <h2>Здесь засчитывается разная жизнь</h2>
        <p>Сегодня велосипед. Завтра прогулка. Через день тренажёрка. На выходных поход. Для «Формы» важнее не вид спорта, а то, что ты продолжаешь двигаться.</p>
      </section>

      <section>
        <h2>Статистика нужна не для отчёта</h2>
        <p>Через несколько недель уже трудно вспомнить, сколько ты действительно тренировался, ходил или проехал. «Форма» сохраняет это и показывает реальную картину.</p>
        <blockquote>«Ого. А я вообще-то нормально двигаюсь» — или наоборот: «Что-то я выпал». И оба вывода полезны.</blockquote>
      </section>

      <section>
        <h2>Рейтинг — немного игры</h2>
        <p>Сезонный рейтинг добавляет азарт: можно догонять друзей, удерживать своё место или просто закончить новый сезон лучше прошлого. Каждый сезон — новый старт.</p>
      </section>

      <section>
        <h2>Планы не считаются результатом</h2>
        <p>Тренировку можно запланировать заранее, но в статистику и рейтинг попадает только то, что реально состоялось.</p>
      </section>
    </div>

    <section className="why-final">
      <span>Главная идея</span>
      <h2>Не нужно перестраивать жизнь вокруг приложения.</h2>
      <p>Живи как обычно. Просто замечай свою активность и сохраняй её.</p>
      <strong>Главная цель — самому двигаться чуть больше, чем раньше.</strong>
    </section>
  </main>;
}

function AboutScreen(){
  const [iosHelp,setIosHelp]=useState(false);

  function openAndroid(){
    window.open(ANDROID_APK_URL,'_blank','noopener,noreferrer');
  }

  function openIos(){
    setIosHelp(true);
    window.open(IOS_INSTALL_URL,'_blank','noopener,noreferrer');
  }

  return <main className="tab-screen about-screen about-tab-screen">
    <p className="eyebrow-dark">Форма</p>
    <h1>О приложении</h1>

    <section className="why-intro glass-card about-concept-hero">
      <h2>Не про идеальные тренировки.<br/>Про то, чтобы чаще двигаться.</h2>
      <p>Неважно, что именно ты делаешь: идёшь в зал, катаешься на велосипеде, занимаешься на турниках, единоборствами или уходишь в поход. Задача «Формы» — чтобы движения в жизни становилось больше.</p>
    </section>

    <section className="about-principles">
      <article><strong>Сделал — зафиксируй</strong><p>Так отдельные тренировки складываются в реальную картину твоей активности.</p></article>
      <article><strong>Баллы — за регулярность</strong><p>Они не измеряют твою физическую форму. Лучше делать хоть что-то регулярно, чем раз в месяц совершать спортивный подвиг.</p></article>
      <article><strong>Статистика — про факты</strong><p>Через месяц ты уже видишь не ощущения, а сколько реально тренировался, прошёл, проехал и поднял.</p></article>
      <article><strong>Рейтинг — немного игры</strong><p>Догоняй друзей, держи ритм и начинай каждый сезон с нового старта.</p></article>
    </section>

    <section className="why-final about-main-idea">
      <span>Главная идея</span>
      <h2>Не перестраивай жизнь вокруг приложения.</h2>
      <p>Живи как обычно. Просто замечай свою активность и сохраняй её.</p>
      <strong>Цель — самому двигаться чуть больше, чем раньше.</strong>
    </section>

    <section className="about-hero glass-card">
      <Brand compact/>
      <p>Некоммерческий проект Василия Чувакина, созданный для повышения личной активности каждого человека. Приложение спроектировано исходя из видения автора; предложения по настройке, новым функциям и конструктивная обратная связь приветствуются.</p>
    </section>

    <section className="download-card glass-card">
      <h2>Установить «Форму»</h2>
      <p>Выберите своё устройство.</p>

      <button className="platform-download android-download" onClick={openAndroid}>
        <span className="platform-icon">A</span>
        <span><strong>Android</strong><small>Скачать актуальный установочный APK</small></span>
        <b>↓</b>
      </button>

      <button className="platform-download ios-download" onClick={openIos}>
        <span className="platform-icon apple-mark">●</span>
        <span><strong>iPhone / iOS</strong><small>Установить через Safari без App Store</small></span>
        <b>›</b>
      </button>

      {iosHelp&&<div className="ios-install-help">
        <strong>На iPhone:</strong>
        <span>откройте ссылку в Safari → «Поделиться» → «На экран Домой» → «Добавить».</span>
      </div>}
    </section>

    <section className="about-signature">
      <p>С благодарностью всем и каждому, кто пользуется этим приложением.</p>
      <p>Здоровья вам и яркой жизни.</p>
      <strong>Чувакин Василий</strong>
      <small>Форма · версия {APP_VERSION}</small>
    </section>
  </main>;
}

function DateWheel({schedule,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal}){
  const ref=useRef(null);
  const raf=useRef(0);
  const lastHaptic=useRef(selectedDateKey);
  const [open,setOpen]=useState(false);
  const [other,setOther]=useState(false);
  const [proposal,setProposal]=useState('');
  const today=useMemo(()=>new Date(),[]);
  const dates=useMemo(()=>Array.from({length:1461},(_,i)=>addDays(today,i-730)),[today]);

  function updateWheel(){
    const c=ref.current;
    if(!c)return;

    const center=c.clientHeight/2;
    let best=null;
    let bestDistance=Infinity;

    c.querySelectorAll('.wheel-date-row').forEach(row=>{
      const rowCenter=row.offsetTop-c.scrollTop+row.offsetHeight/2;
      const px=rowCenter-center;
      const units=px/45;
      const abs=Math.abs(units);
      const opacity=Math.max(.035,1-abs*.18);
      const scale=Math.max(.76,1-abs*.045);
      const rotate=Math.max(-34,Math.min(34,units*8));
      row.style.opacity=String(opacity);
      row.style.transform=`perspective(430px) rotateX(${rotate}deg) scale(${scale})`;

      if(Math.abs(px)<bestDistance){
        bestDistance=Math.abs(px);
        best=row.dataset.date;
      }
    });

    if(best&&best!==selectedDateKey){
      setSelectedDateKey(best);
      if(lastHaptic.current!==best){
        lastHaptic.current=best;
        navigator.vibrate?.(7);
      }
    }
  }

  function center(key,behavior='smooth'){
    const c=ref.current;if(!c)return;
    const row=c.querySelector(`[data-date="${key}"]`);if(!row)return;
    c.scrollTo({top:row.offsetTop-c.clientHeight/2+row.offsetHeight/2,behavior});
    requestAnimationFrame(updateWheel);
  }

  useEffect(()=>{
    requestAnimationFrame(()=>center(selectedDateKey,'auto'));
  },[]);

  useEffect(()=>{
    setOpen(false);setOther(false);
  },[selectedDateKey]);

  function onScroll(){
    if(raf.current)return;
    raf.current=requestAnimationFrame(()=>{
      raf.current=0;
      updateWheel();
    });
  }

  function chooseDate(key){
    setSelectedDateKey(key);
    navigator.vibrate?.(7);
    requestAnimationFrame(()=>center(key));
  }

  async function chooseActivity(type){
    await onSavePlan(selectedDateKey,type,'','planned');
    setOpen(false);
  }

  async function sendProposal(){
    if(!proposal.trim())return;
    await onProposal(proposal.trim());
    setProposal('');setOther(false);setOpen(false);
  }

  return <section className="date-wheel-shell">
    <div className="wheel-center-line"/>
    <div className="wheel-fade wheel-fade-top"/>
    <div className="wheel-fade wheel-fade-bottom"/>

    <div ref={ref} className="date-wheel-scroll" onScroll={onScroll}>
      <div className="wheel-spacer"/>
      {dates.map(date=>{
        const key=localDateKey(date);
        const selected=key===selectedDateKey;
        const item=schedule[key];
        const meta=activityMeta(item?.type);
        const isToday=key===localDateKey();

        return <div key={key} data-date={key} className={`wheel-date-row ${selected?'selected':''}`} onClick={()=>chooseDate(key)}>
          <span className="weekday">{new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(date)}</span>
          <span className="wheel-date-label">{formatDateShort(key)}{isToday&&<em>сегодня</em>}</span>

          {selected?
            <button className={`inline-activity ${meta?.accent||''}`} onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}>
              <ActivityGlyph type={item?.type} className={meta?.accent||''}/>
              <strong>{activityLabel(item)||'Активность'}</strong><b>⌄</b>
            </button>:
            <span className={`activity-label ${meta?.accent||''}`}>
              {meta?<><ActivityGlyph type={item.type} className={meta.accent}/>{activityLabel(item)}</>:<span className="empty-dash">—</span>}
            </span>
          }

          <span className={`status-dot ${item?.status||''}`}>{item?.status==='completed'?'✓':''}</span>

          {selected&&open&&<div className="activity-popover" onClick={e=>e.stopPropagation()}>
            {!other?<>{ACTIVITIES.map(a=><button key={a.id} onClick={()=>chooseActivity(a.id)}><ActivityGlyph type={a.id} className={a.accent}/>{a.label}</button>)}<button onClick={()=>setOther(true)}><span>＋</span>Другое / предложить</button>{item&&<button className="danger-lite" onClick={()=>onDeletePlan(selectedDateKey)}>Убрать активность</button>}</>:
            <div className="popover-proposal"><input value={proposal} onChange={e=>setProposal(e.target.value)} placeholder="Например: плавание" autoFocus/><button onClick={sendProposal}>Отправить админу</button><small>После одобрения активность появится в общем списке.</small></div>}
          </div>}
        </div>;
      })}
      <div className="wheel-spacer"/>
    </div>
  </section>;
}

function AddTraining({dateKey,setDateKey,onProposal,onBack,onChoose}){
  const [otherOpen,setOtherOpen]=useState(false);
  const [text,setText]=useState('');
  const [sent,setSent]=useState(false);

  async function submit(){
    if(!text.trim())return;
    await onProposal(text.trim());
    setText('');setSent(true);
  }

  return <main className="sub-screen">
    <ScreenBack onBack={onBack}/>
    <p className="eyebrow-dark">Новая запись</p><h1>Добавить тренировку</h1>
    <label className="date-control"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>

    <div className="activity-grid add-grid">
      {ACTIVITIES.map(a=><button key={a.id} className={`activity-choice ${a.accent}`} onClick={()=>onChoose(a.id)}>
        <ActivityGlyph type={a.id} className={a.accent}/>
        <strong>{a.label}</strong>
        {a.id==='walk'&&<small>шаги учитываются от 10 000</small>}
      </button>)}
      <button className="activity-choice other-choice" onClick={()=>setOtherOpen(v=>!v)}><span>＋</span><strong>Другое</strong><small>предложить активность</small></button>
    </div>

    {otherOpen&&<section className="glass-card other-form">
      <label className="dark-field"><span>Название активности</span><input value={text} onChange={e=>{setText(e.target.value);setSent(false);}} placeholder="Например: плавание"/></label>
      <button className="secondary-dark" onClick={submit}>Отправить на модерацию</button>
      {sent&&<p className="success-line">Отправлено админу на согласование.</p>}
    </section>}
  </main>;
}

function ScreenBack({onBack,title}){
  return <div className="screen-back-row"><button className="back-button" onClick={onBack}>‹</button>{title&&<strong>{title}</strong>}</div>;
}

function GymTraining({dateKey,setDateKey,sessions,gymTemplates,onSaveTemplate,onBack,onHistory,onSave,onTrainerRequest}){
  const [group,setGroup]=useState('chest');
  const [baseRows,setBaseRows]=useState(makeRows(3));
  const [extraRows,setExtraRows]=useState(makeRows(5));
  const [error,setError]=useState('');
  const [trainerState,setTrainerState]=useState('');

  useEffect(()=>{
    const t=gymTemplates[group];
    if(group==='custom'){
      setBaseRows(normalizeRows(t?.baseRows,8));
      setExtraRows([]);
    }else{
      setBaseRows(normalizeRows(t?.baseRows,3));
      setExtraRows(normalizeRows(t?.extraRows,5));
    }
    setError('');
  },[group,gymTemplates]);

  function update(kind,index,field,value){
    const setter=kind==='base'?setBaseRows:setExtraRows;
    setter(cur=>cur.map((row,i)=>i===index?{...row,[field]:value}:row));
  }

  async function save(){
    if(![...baseRows,...extraRows].some(r=>r.exercise)){
      setError('Выбери хотя бы одно упражнение.');
      return;
    }
    const templateBase=baseRows.map(({comment,...row})=>row);
    const templateExtra=extraRows.map(({comment,...row})=>row);
    const tonnage=workoutTonnage(baseRows,extraRows);
    await onSaveTemplate(group,templateBase,templateExtra);
    await onSave({type:'gym',date:dateKey,gymGroup:group,baseRows,extraRows,title:GYM_GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
  }

  async function trainer(){
    setTrainerState('loading');
    try{await onTrainerRequest();setTrainerState('sent');}
    catch{setTrainerState('error');}
  }

  return <main className="sub-screen gym-screen">
    <ScreenBack onBack={onBack} title="Тренировка"/>
    <label className="date-control compact-date"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>

    <div className="gym-tabs">{GYM_GROUPS.map(g=><button key={g.id} className={group===g.id?'active':''} onClick={()=>setGroup(g.id)}><span>{g.icon}</span>{g.label}</button>)}</div>

    {group==='custom'
      ?<ExerciseBlock title="Упражнения" subtitle="Любые упражнения из общего списка" rows={baseRows} options={ALL_GYM_EXERCISES} kind="base" onChange={update} accent="mint"/>
      :<>
        <ExerciseBlock title="База" subtitle="Основные упражнения на выбранную группу" rows={baseRows} options={BASE_EXERCISES[group]} kind="base" onChange={update} accent="mint"/>
        <ExerciseBlock title="Доп" subtitle="Дельты, руки, пресс и другие мелкие группы" rows={extraRows} options={ACCESSORY_EXERCISES} kind="extra" onChange={update} accent="violet"/>
      </>}

    <div className="tonnage-summary"><span>Тоннаж тренировки</span><strong>{formatKg(workoutTonnage(baseRows,extraRows))} кг</strong></div>

    <div className="loaded-note"><span>↻</span><div><strong>{gymTemplates[group]?'Загружены данные с прошлой тренировки':'Первый раз — выбери упражнения'}</strong><small>После сохранения приложение запомнит упражнения, подходы, повторения и рабочий вес.</small></div></div>

    {error&&<p className="error-line">{error}</p>}
    <button className="gradient-button save-training" onClick={save}><span>▣</span>{isFuture(dateKey)?'Запланировать тренировку':'Сохранить тренировку'}<b>›</b></button>

    <div className="gym-bottom-actions">
      <button className="previous-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
      <button className="trainer-button" onClick={trainer} disabled={trainerState==='loading'||trainerState==='sent'}><span>♟</span>{trainerState==='sent'?'Заявка отправлена':'Заказать тренера'}</button>
    </div>
    {trainerState==='error'&&<p className="error-line">Не удалось отправить заявку. Попробуй ещё раз.</p>}
  </main>;
}

function ExerciseBlock({title,subtitle,rows,options,kind,onChange,accent}){
  const [openComment,setOpenComment]=useState(null);

  return <section className={`exercise-block ${accent}`}>
    <header><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows.length} упражнений</span></header>
    <div className="exercise-head"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span><span></span></div>

    <div className="exercise-rows">{rows.map((row,i)=><div className="exercise-row-wrap" key={i}>
      <div className="exercise-row">
        <select value={row.exercise} onChange={e=>onChange(kind,i,'exercise',e.target.value)}><option value="">Выбрать упражнение</option>{options.map(o=><option key={o}>{o}</option>)}</select>
        <input inputMode="numeric" value={row.sets} onChange={e=>onChange(kind,i,'sets',e.target.value)} placeholder="3"/>
        <input inputMode="numeric" value={row.reps} onChange={e=>onChange(kind,i,'reps',e.target.value)} placeholder="10"/>
        <div className="weight-input"><input inputMode="decimal" value={row.weight} onChange={e=>onChange(kind,i,'weight',e.target.value)} placeholder="0"/><small>кг</small></div>
        <button className={`exercise-note-button ${row.comment?'has-note':''}`} onClick={()=>setOpenComment(openComment===i?null:i)} type="button" aria-label="Комментарий">▤</button>
      </div>

      {openComment===i&&<div className="exercise-comment-row">
        <input value={row.comment||''} onChange={e=>onChange(kind,i,'comment',e.target.value)} placeholder="Комментарий к упражнению"/>
        <button type="button" onClick={()=>setOpenComment(null)}>Сохранить</button>
      </div>}
    </div>)}</div>
  </section>;
}
function GymHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие тренировки"/>
    {!ordered.length&&<div className="empty-state">Сохранённых тренировок пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      const group=GYM_GROUPS.find(g=>g.id===s.gymGroup);
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon">{group?.icon||'🏋︎'}</span>
          <span><strong>Тренировка №{s.displayNumber||'—'} · {group?.label||'Тренажёрка'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body">
          {s.gymGroup==='custom'
            ?<ReadonlyExerciseBlock title="Упражнения" rows={s.baseRows||[]}/>
            :<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>}
          <div className="history-tonnage">Тоннаж: <strong>{formatKg(workoutTonnage(s.baseRows||[],s.extraRows||[]))} кг</strong></div>
        </div>}
      </article>;
    })}</div>
  </main>;
}

function ReadonlyExerciseBlock({title,rows}){
  const visible=rows.filter(r=>r.exercise);
  if(!visible.length)return null;

  return <section className="readonly-block">
    <h3>{title}</h3>
    <div className="readonly-head"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span></div>
    {visible.map((r,i)=><div className="readonly-row-wrap" key={i}>
      <div className="readonly-row"><span>{r.exercise}</span><span>{r.sets||'—'}</span><span>{r.reps||'—'}</span><span>{r.weight||'—'} кг</span></div>
      {r.comment&&<div className="readonly-comment">▤ {r.comment}</div>}
    </div>)}
  </section>;
}
function WorkoutTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [text,setText]=useState('');
  const [saving,setSaving]=useState(false);
  const count=sessions.filter(s=>s.type==='workout'&&isQualifyingSession(s)).length;

  async function save(){
    if(!text.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'workout',
        date:dateKey,
        title:'Воркаут',
        workoutText:text.trim(),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen workout-training-screen">
    <ScreenBack onBack={onBack} title="Воркаут"/>

    <section className="metric-hero">
      <ActivityGlyph type="workout" className="coral"/>
      <div><small>Всего воркаутов</small><strong>{count}</strong></div>
    </section>

    <section className="glass-card simple-form workout-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field workout-description-field">
        <span>Опиши свою тренировку</span>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Например: подтягивания 5×10, брусья 4×15, пресс..." rows={7}/>
      </label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!text.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
  </main>;
}

function WorkoutHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие воркауты"/>
    {!ordered.length&&<div className="empty-state">Сохранённых воркаутов пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon"><ActivityGlyph type="workout" className="coral"/></span>
          <span><strong>Тренировка №{s.displayNumber||'—'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body workout-history-text">{s.workoutText||'Описание не сохранено.'}</div>}
      </article>;
    })}</div>
  </main>;
}

function CombatTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [combatType,setCombatType]=useState('');
  const [saving,setSaving]=useState(false);
  const count=sessions.filter(s=>s.type==='combat'&&isQualifyingSession(s)).length;
  const suggestions=['Бокс','ММА','Борьба','Самбо','Дзюдо','BJJ','Кикбоксинг','Муай-тай','Карате','Тхэквондо'];

  async function save(){
    if(!combatType.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'combat',
        date:dateKey,
        title:combatType.trim(),
        combatType:combatType.trim(),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen combat-training-screen">
    <ScreenBack onBack={onBack} title="Единоборства"/>

    <section className="metric-hero combat-metric-hero">
      <ActivityGlyph type="combat" className="combat"/>
      <div><small>Всего тренировок</small><strong>{count}</strong></div>
    </section>

    <section className="glass-card simple-form combat-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field">
        <span>Вид единоборства</span>
        <input list="combat-types" value={combatType} onChange={e=>setCombatType(e.target.value)} placeholder="Например: бокс"/>
        <datalist id="combat-types">{suggestions.map(x=><option value={x} key={x}/>)}</datalist>
      </label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!combatType.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
  </main>;
}

function CombatHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="История единоборств"/>
    {!ordered.length&&<div className="empty-state">Сохранённых тренировок пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon combat">🥊</span>
          <span><strong>Тренировка №{s.displayNumber||'—'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body combat-history-detail"><strong>{s.combatType||s.title||'Единоборства'}</strong></div>}
      </article>;
    })}</div>
  </main>;
}

function HikeTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [name,setName]=useState('');
  const [days,setDays]=useState('1');
  const [distance,setDistance]=useState('');
  const [saving,setSaving]=useState(false);

  const list=sessions.filter(s=>s.type==='hike'&&isHistorySession(s));
  const totalDays=list.reduce((sum,s)=>sum+Math.max(Number(s.hikeDays)||1,1),0);
  const totalDistance=list.reduce((sum,s)=>sum+(Number(s.hikeDistance)||0),0);

  async function save(){
    if(!name.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'hike',
        date:dateKey,
        title:name.trim(),
        hikeDays:Math.max(Number(days)||1,1),
        hikeDistance:Math.max(Number(distance)||0,0),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen hike-training-screen">
    <ScreenBack onBack={onBack} title="Поход"/>
    <section className="metric-hero hike-metric-hero">
      <ActivityGlyph type="hike" className="hike"/>
      <div><small>Всего походов</small><strong>{list.length}</strong><em>{totalDays} дн. · {totalDistance.toLocaleString('ru-RU')} км</em></div>
    </section>

    <section className="glass-card simple-form hike-form">
      <label className="date-control embedded"><span>Дата начала</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название похода</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Ачишхо" required/></label>
      <div className="hike-fields">
        <label className="dark-field"><span>Количество дней</span><input inputMode="numeric" type="number" min="1" value={days} onChange={e=>setDays(e.target.value)} placeholder="1"/></label>
        <label className="dark-field"><span>Расстояние, км</span><input inputMode="decimal" type="number" min="0" step="0.1" value={distance} onChange={e=>setDistance(e.target.value)} placeholder="18"/></label>
      </div>
      <small className="hike-points-note">За каждый день похода начисляется 5 баллов.</small>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!name.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать поход':'Сохранить поход'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие походы<b>›</b></button>
  </main>;
}

function HikeHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие походы"/>
    {!ordered.length&&<div className="empty-state">Сохранённых походов пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon"><ActivityGlyph type="hike" className="hike"/></span>
          <span><strong>{s.displayNumber?`Тренировка №${s.displayNumber} · `:''}{s.title||'Поход'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body hike-history-detail">
          <strong>{s.title||'Поход'}</strong>
          <span>{Math.max(Number(s.hikeDays)||1,1)} дн.</span>
          <span>{Number(s.hikeDistance||0).toLocaleString('ru-RU')} км</span>
          <small>Баллы за дни: +{5*Math.max(Number(s.hikeDays)||1,1)}</small>
        </div>}
      </article>;
    })}</div>
  </main>;
}

function HikeStats({count,days,distance}){
  return <article className="stat-card hike hike-stat-card">
    <span className="stat-icon"><ActivityGlyph type="hike" className="hike"/></span>
    <small>Походы</small>
    <div className="hike-stat-values">
      <span><strong>{count.toLocaleString('ru-RU')}</strong><em>походов</em></span>
      <span><strong>{days.toLocaleString('ru-RU')}</strong><em>дней</em></span>
      <span><strong>{Number(distance||0).toLocaleString('ru-RU')}</strong><em>км</em></span>
    </div>
  </article>;
}

function SimpleTraining({type,dateKey,setDateKey,sessions,onBack,onSave}){
  const meta=activityMeta(type);
  const [title,setTitle]=useState('');
  const [value,setValue]=useState('');
  const [saving,setSaving]=useState(false);

  const list=[...sessions]
    .filter(s=>s.type===type&&isHistorySession(s))
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const previous=list.slice(0,5);

  let valueLabel='',placeholder='',totalLabel='',totalValue='';
  if(type==='bike'){
    valueLabel='Километраж, км';placeholder='32.5';totalLabel='Общий пробег';
    totalValue=`${list.reduce((sum,x)=>sum+(Number(x.distance)||0),0).toLocaleString('ru-RU')} км`;
  }else{
    valueLabel='Количество шагов';placeholder='20000';totalLabel='Всего шагов';
    totalValue=list.reduce((sum,x)=>sum+(Number(x.steps)||0),0).toLocaleString('ru-RU');
  }

  async function save(){
    setSaving(true);
    try{
      const payload={type,date:dateKey,title:title.trim()||meta.label};
      if(type==='bike')payload.distance=Number(value)||0;
      if(type==='walk')payload.steps=Number(value)||0;
      await onSave(payload);
    }finally{setSaving(false);}
  }

  const placeholderTitle=type==='bike'?'Вечерняя поездка':'Прогулка по набережной';

  return <main className="sub-screen simple-training-screen">
    <ScreenBack onBack={onBack} title={meta.label}/>

    <section className="metric-hero"><ActivityGlyph type={type} className={meta.accent}/><div><small>{totalLabel}</small><strong>{totalValue||'0'}</strong></div></section>

    <section className="glass-card simple-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={placeholderTitle}/></label>
      <label className="dark-field"><span>{valueLabel} — необязательно</span><input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder}/></label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving}>{saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}</button>
      {type==='walk'&&<small className="walk-rule">Менее 10 000 шагов сохранится в календаре и истории, но без номера, баллов, галочки и статистики.</small>}
    </section>

    <section className="recent-section">
      <header><h2>Последние 5</h2><span>{list.length} всего</span></header>
      {!previous.length&&<div className="empty-state compact-empty">Пока нет сохранённых тренировок.</div>}
      {previous.map(s=><article className="recent-row" key={s.id}>
        <span className={`recent-number ${meta.accent}`}>{s.displayNumber?`№${s.displayNumber}`:'—'}</span>
        <div><strong>{s.title||meta.label}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></div>
        <b>{sessionValue(s)}</b>
      </article>)}
    </section>
  </main>;
}

function History({sessions,onDelete}){
  const ordered=[...sessions]
    .filter(isHistorySession)
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(null);

  async function remove(s){
    if(!window.confirm('Удалить эту тренировку из истории?'))return;
    await onDelete(s.id);
    if(openId===s.id)setOpenId(null);
  }

  return <main className="tab-screen history-screen">
    <p className="eyebrow-dark">Все активности</p><h1>История тренировок</h1>
    {!ordered.length&&<div className="empty-state">Пока ни одной состоявшейся тренировки.</div>}

    <div className="master-history">{ordered.map(s=>{
      const meta=activityMeta(s.type);
      const open=openId===s.id;
      return <article className={`master-history-row ${open?'open':''}`} key={s.id}>
        <div className="history-row-controls">
          <button className="history-main-button" onClick={()=>setOpenId(open?null:s.id)}>
            <span className={`history-type-icon ${meta?.accent||''}`}><ActivityGlyph type={s.type} className={meta?.accent||''}/></span>
            <span className="history-copy">
              <strong>{s.displayNumber?`Тренировка №${s.displayNumber} · `:''}{s.title||meta?.label}</strong>
              <small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}{!s.displayNumber&&s.type==='walk'?' · без баллов':''}</small>
            </span>
            <span className="history-value">{sessionValue(s)}</span>
            <b>{open?'⌃':'⌄'}</b>
          </button>
          <button className="delete-training-button" onClick={()=>remove(s)} aria-label="Удалить">×</button>
        </div>

        {open&&<div className="master-detail">
          {s.type==='gym'
            ?<>{s.gymGroup==='custom'?<ReadonlyExerciseBlock title="Упражнения" rows={s.baseRows||[]}/>:<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>}<div className="history-tonnage">Тоннаж: <strong>{formatKg(workoutTonnage(s.baseRows||[],s.extraRows||[]))} кг</strong></div></>
            :s.type==='workout'
              ?<p className="workout-history-text">{s.workoutText||'Описание не сохранено.'}</p>
              :s.type==='hike'
                ?<div className="hike-history-detail"><strong>{s.title||'Поход'}</strong><span>{Math.max(Number(s.hikeDays)||1,1)} дн.</span><span>{Number(s.hikeDistance||0).toLocaleString('ru-RU')} км</span></div>
                :s.type==='combat'
                  ?<div className="combat-history-detail"><strong>{s.combatType||s.title||'Единоборства'}</strong></div>
                  :<p>{sessionValue(s)}</p>}
        </div>}
      </article>;
    })}</div>
  </main>;
}

function Statistics({sessions,dailySteps,isBoss,hookahEvents,hookahStartedOn,profile,memberCount,onOpenMembers}){
  const [range,setRange]=useState('30d');
  const [customStart,setCustomStart]=useState(localDateKey(addDays(new Date(),-30)));
  const [customEnd,setCustomEnd]=useState(localDateKey());
  const season=seasonMeta();

  const today=new Date();
  let start,end=localDateKey(today);

  if(range==='prev-month'){
    const first=new Date(today.getFullYear(),today.getMonth(),1,12);
    start=localDateKey(addMonths(first,-1));
    end=localDateKey(addDays(first,-1));
  }else if(range==='30d')start=localDateKey(addDays(today,-29));
  else if(range==='6m')start=localDateKey(addMonths(today,-6));
  else if(range==='1y')start=localDateKey(addYears(today,-1));
  else{start=customStart;end=customEnd;}

  const filtered=sessions.filter(s=>isStatsSession(s)&&s.date>=start&&s.date<=end);
  const gymSessions=filtered.filter(s=>s.type==='gym');
  const gym=gymSessions.length;
  const tonnage=gymSessions.reduce((n,s)=>n+workoutTonnage(s.baseRows||[],s.extraRows||[]),0);
  const bike=filtered.filter(s=>s.type==='bike').reduce((n,s)=>n+(Number(s.distance)||0),0);
  const stepTotal=(dailySteps||[]).filter(x=>x.date>=start&&x.date<=end).reduce((n,x)=>n+(Number(x.steps)||0),0);
  const workoutCount=filtered.filter(s=>s.type==='workout').length;
  const combatCount=filtered.filter(s=>s.type==='combat').length;
  const hikes=filtered.filter(s=>s.type==='hike');
  const hikeCount=hikes.length;
  const hikeDays=hikes.reduce((n,s)=>n+(Math.max(Number(s.hikeDays)||1,1)),0);
  const hikeDistance=hikes.reduce((n,s)=>n+(Number(s.hikeDistance)||0),0);
  const trackedStart=start<hookahStartedOn?hookahStartedOn:start;
  const hookahInRange=isBoss?hookahEvents.filter(h=>h.event_date>=trackedStart&&h.event_date<=end):[];
  const hookahCount=hookahInRange.length;
  const hookahDays=end>=trackedStart?daysBetween(trackedStart,end)+1:0;
  const hookahPossible=hookahDays*1000;
  const hookahByDay=hookahInRange.reduce((map,h)=>{
    map[h.event_date]=(map[h.event_date]||0)+1;
    return map;
  },{});
  const hookahLost=Object.values(hookahByDay).reduce((sum,count)=>sum+Math.min(Number(count)||0,2)*500,0);
  const hookahEarned=Math.max(0,hookahPossible-hookahLost);
  const ranges=[['prev-month','Прошедший месяц'],['30d','30 дней'],['6m','6 месяцев'],['1y','Год'],['custom','Свой диапазон']];

  return <main className="tab-screen stats-screen">
    <p className="eyebrow-dark">Сводка</p><h1>Статистика</h1>

    <button className="rank-summary-card" onClick={onOpenMembers}>
      <div><small>Сезон {season.name}. День {season.day} из {season.total}</small><strong>{profile?.points||0} баллов</strong></div>
      <div><span>Рейтинг</span><b>{profile?.rank?`#${profile.rank}`:'—'} <em>из {memberCount}</em></b></div>
      <i>›</i>
    </button>

    <div className="range-tabs">{ranges.map(([key,label])=><button key={key} className={range===key?'active':''} onClick={()=>setRange(key)}>{label}</button>)}</div>
    {range==='custom'&&<div className="custom-range"><label><span>От</span><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}/></label><label><span>До</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/></label></div>}
    <p className="range-caption">{formatDate(start)} — {formatDate(end)}</p>

    <div className="stats-grid-big">
      <StatCard type="gym" accent="violet" title="Тренажёрка" value={gym.toLocaleString('ru-RU')} unit="тренировок"/>
      <StatCard type="gym" accent="tonnage" title="Тоннаж" value={formatKg(tonnage)} unit="кг"/>
      <StatCard type="bike" accent="amber" title="Велосипед" value={bike.toLocaleString('ru-RU')} unit="км"/>
      <StatCard type="steps" accent="green" title="Шаги" value={stepTotal.toLocaleString('ru-RU')} unit="шагов"/>
      <StatCard type="workout" accent="coral" title="Воркаут" value={workoutCount.toLocaleString('ru-RU')} unit="тренировок"/>
      <StatCard type="combat" accent="combat" title="Единоборства" value={combatCount.toLocaleString('ru-RU')} unit="тренировок"/>
      <HikeStats count={hikeCount} days={hikeDays} distance={hikeDistance}/>
      {isBoss&&<article className="hookah-stat-card">
        <div><small>Кальян</small><strong>{hookahCount}</strong><em>выкурено</em></div>
        <div><small>Заработано</small><strong>{hookahEarned.toLocaleString('ru-RU')} ₽</strong><em>из {hookahPossible.toLocaleString('ru-RU')} ₽ возможных</em></div>
      </article>}
    </div>
  </main>;
}

function StatCard({type,accent,title,value,unit}){
  return <article className={`stat-card ${accent}`}>
    <span className="stat-icon"><ActivityGlyph type={type} className={accent}/></span>
    <small>{title}</small><strong>{value}</strong><em>{unit}</em>
  </article>;
}

function Members({members,profile,previousTop5}){
  const season=seasonMeta();

  return <main className="tab-screen members-screen">
    <div className="members-head">
      <div><p className="eyebrow-dark">Рейтинг</p><h1>Участники</h1></div>
      <strong>{members.length}</strong>
    </div>

    <section className="season-card">
      <strong>Сезон {season.name}</strong>
      <span>День {season.day} из {season.total}</span>
    </section>

    <p className="members-caption">Участников всего: {members.length}. Рейтинг этого сезона обнуляется в первый день следующего сезона.</p>

    <div className="leaderboard-scroll">
      <div className="leaderboard">{members.map(m=><article key={m.id} className={`leader-row ${m.id===profile?.id?'me':''}`}>
        <span className="rank-place">{m.rank}</span>
        <span className="member-avatar">{m.name?.trim()?.[0]?.toUpperCase()||'У'}</span>
        <div><strong>{m.name}{m.id===profile?.id?' · вы':''}</strong><small>{m.rank===1?'Лидер сезона':'Участник'}</small></div>
        <b>★ {m.points||0}</b>
      </article>)}</div>
    </div>

    <section className="previous-season">
      <header><small>Прошлый сезон</small><h2>Топ-5 · {season.previousName}</h2></header>
      {!previousTop5.length&&<div className="empty-state compact-empty">В прошлом сезоне пока нет данных.</div>}
      {previousTop5.map(item=><div className="previous-row" key={`${item.rank}-${item.name}`}><span>{item.rank}</span><strong>{item.name}</strong><b>★ {item.points}</b></div>)}
    </section>

    <p className="inactive-rule">Аккаунты не удаляются. Если 45 дней нет состоявшихся тренировок, спортивная часть рейтинга становится 0. Персональные штрафы могут уменьшать итоговый балл ниже нуля.</p>
  </main>;
}
