import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { App as NativeApp } from '@capacitor/app';

const APP_VERSION = '0.5.0';

const ACTIVITIES = [
  { id: 'gym', label: 'Тренажёрка', icon: '🏋︎', accent: 'violet' },
  { id: 'bike', label: 'Велосипед', icon: '🚴', accent: 'amber' },
  { id: 'workout', label: 'Воркаут', icon: '┬', accent: 'coral' },
  { id: 'walk', label: 'Прогулка', icon: '🚶', accent: 'green' },
];

const GYM_GROUPS = [
  { id: 'chest', label: 'Грудь', icon: '◈' },
  { id: 'back', label: 'Спина', icon: '╫' },
  { id: 'legs', label: 'Ноги', icon: '⋔' },
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
function activityMeta(type){return ACTIVITIES.find(a=>a.id===type);}
function activityLabel(item){return item?.customTitle||activityMeta(item?.type)?.label||'';}
function makeRows(n){return Array.from({length:n},()=>({exercise:'',sets:'',weight:''}));}
function normalizeRows(rows,n){return Array.from({length:n},(_,i)=>({exercise:rows?.[i]?.exercise||'',sets:rows?.[i]?.sets??'',weight:rows?.[i]?.weight??''}));}
function mapSession(row){return {...row,gymGroup:row.gym_group,baseRows:row.base_rows||[],extraRows:row.extra_rows||[],confirmed:row.confirmed!==false};}
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

function pointEvents(sessions){
  const season=seasonMeta();
  const ordered=[...sessions]
    .filter(s=>isQualifyingSession(s)&&s.date>=season.start&&s.date<=season.end)
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));

  let prev=null;
  return ordered.map(s=>{
    const reasons=[];
    let delta=(s.type==='gym'||s.type==='bike')?5:3;
    reasons.push(`${activityMeta(s.type)?.label||'Активность'}: +${delta}`);

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
    prev=s;
    return {id:s.id,date:s.date,delta,reasons:reasons.join(' · ')};
  });
}

function scoreHint(sessions){
  const completed=sessions.filter(isQualifyingSession);
  if(!completed.length)return 'Первая тренировка — уже сильный шаг';
  const latest=[...completed].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')))[0];
  const gap=daysBetween(latest.date,localDateKey());
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
  if(s.type==='workout')return s.duration?`${s.duration} мин`:'Без времени';
  if(s.type==='gym')return GYM_GROUPS.find(g=>g.id===s.gymGroup)?.label||'Тренажёрка';
  return '';
}

function ActivityGlyph({type,className=''}) {
  if(type==='bike') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="43" r="10"/><circle cx="49" cy="43" r="10"/><path d="M16 43 27 24l10 19H16Zm11-19h11l11 19M25 18h9m4 6 6-7h6m-1 0 5 2"/></svg>;
  if(type==='workout') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M10 12v42M54 12v42M10 16h44"/><circle cx="32" cy="25" r="5"/><path d="M32 30v15M32 33 21 22M32 33l11-11M32 45l-8 9M32 45l8 9"/></svg>;
  const meta=activityMeta(type);
  return <span className={className}>{meta?.icon||'•'}</span>;
}

function Brand({compact=false}){
  return <div className={`logo-lockup ${compact?'compact':''}`}>
    <img className="brand-app-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt=""/>
    <span>Форма</span>
  </div>;
}

function AuthScreen(){
  const [mode,setMode]=useState('register');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(e){
    e.preventDefault();
    setBusy(true);setMessage('');
    try{
      if(mode==='register'){
        if(!name.trim())throw new Error('Укажи имя.');
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{name:name.trim()}}});
        if(error)throw error;
        if(!data.session)setMessage('Регистрация создана. Подтверди e-mail по ссылке в письме, затем войди.');
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error)throw error;
      }
    }catch(err){setMessage(err.message||'Не получилось выполнить вход.');}
    finally{setBusy(false);}
  }

  return <main className="onboarding dark-screen">
    <Brand/><p className="brand-subtitle">Тренировки. Питание. Прогресс.</p>
    <h1>{mode==='register'?'Регистрация':'Вход'}</h1>
    <p className="soft-text">Один аккаунт — одна история тренировок, баллы и место среди участников.</p>
    <div className="auth-tabs">
      <button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>Регистрация</button>
      <button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Вход</button>
    </div>
    <form className="glass-card onboarding-form" onSubmit={submit}>
      {mode==='register'&&<label className="dark-field"><span>Имя</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Как тебя показывать участникам"/></label>}
      <label className="dark-field"><span>E-mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Минимум 6 символов" minLength={6} required/></label>
      <button className="gradient-button" disabled={busy}>{busy?'Подожди…':mode==='register'?'Зарегистрироваться':'Войти'}</button>
      {message&&<p className="auth-message">{message}</p>}
    </form>
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
  const [screen,setScreen]=useState('home');
  const [selectedDateKey,setSelectedDateKey]=useState(localDateKey());
  const [draftDateKey,setDraftDateKey]=useState(localDateKey());
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState('');

  const numberedSessions=useMemo(()=>withDynamicNumbers(sessions),[sessions]);

  useEffect(()=>{
    let active=true;
    supabase.auth.getSession().then(({data})=>{if(active&&data.session)setAuthSession(data.session);}).catch(()=>{});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(active)setAuthSession(next);});
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!window.history.state?.formaScreen){
      window.history.replaceState({...window.history.state,formaScreen:'home',formaDepth:0},'');
    }
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
    if(authSession?.user){loadData();}
    else{
      setLoading(false);setProfile(null);setMembers([]);setPreviousTop5([]);
      setSessions([]);setSchedule({});setGymTemplates({});
    }
  },[authSession?.user?.id]);

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

  async function loadData(){
    if(!authSession?.user)return;
    setLoading(true);
    setLoadError('');
    const userId=authSession.user.id;

    try{
      const queries=Promise.all([
        supabase.from('profiles').select('*').eq('id',userId).single(),
        supabase.rpc('current_leaderboard'),
        supabase.rpc('previous_season_top5'),
        supabase.from('sessions').select('*').eq('user_id',userId).order('date',{ascending:true}).order('created_at',{ascending:true}),
        supabase.from('plans').select('*').eq('user_id',userId),
        supabase.from('gym_templates').select('*').eq('user_id',userId),
      ]);

      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),9000));
      const [profileRes,leaderRes,previousRes,sessionsRes,plansRes,templatesRes]=await Promise.race([queries,timeout]);

      if(profileRes.error)throw profileRes.error;
      if(leaderRes.error)throw leaderRes.error;
      if(previousRes.error)throw previousRes.error;

      const leaderboard=leaderRes.data||[];
      const me=leaderboard.find(x=>x.id===userId);
      if(profileRes.data)setProfile({...profileRes.data,points:me?.points||0,rank:me?.rank||null});
      setMembers(leaderboard);
      setPreviousTop5(previousRes.data||[]);
      setSessions((sessionsRes.data||[]).map(mapSession));

      const plans={};
      (plansRes.data||[]).forEach(p=>{
        const forcedStatus=isFuture(p.date)?'planned':p.status;
        plans[p.date]={type:p.type,status:forcedStatus,customTitle:p.custom_title||'',updatedAt:p.updated_at};
      });
      setSchedule(plans);

      const templates={};
      (templatesRes.data||[]).forEach(t=>{templates[t.gym_group]={baseRows:t.base_rows||[],extraRows:t.extra_rows||[]};});
      setGymTemplates(templates);
    }catch(err){
      console.error('Forma load error',err);
      setLoadError('Не удалось связаться с общей базой. Проверь интернет и нажми «Повторить».');
    }finally{
      setLoading(false);
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
      duration:payload.duration??null,
      steps:payload.steps??null,
      gym_group:payload.gymGroup||null,
      base_rows:payload.baseRows||null,
      extra_rows:payload.extraRows||null,
      confirmed:true,
    };

    const {error}=await supabase.from('sessions').insert(row);
    if(error)throw error;

    await savePlan(payload.date,payload.type,payload.title||'',lowWalk?'planned':'completed');
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

  async function requestTrainer(){
    const {error}=await supabase.from('trainer_requests').insert({
      user_id:authSession.user.id,
      contact_email:authSession.user.email||null,
      member_name:profile?.name||null,
    });
    if(error)throw error;
  }

  if(!authSession)return <AuthScreen/>;
  if(loading)return <main className="onboarding dark-screen"><Brand/><p className="loading-copy">Загружаем Форму…</p><p className="build-version">Версия {APP_VERSION}</p></main>;
  if(loadError)return <main className="onboarding dark-screen"><Brand/><h1>Связь с базой</h1><p className="soft-text">{loadError}</p><div className="glass-card onboarding-form"><button className="gradient-button" onClick={loadData}>Повторить</button></div></main>;

  return <div className="app-shell-dark">
    {screen==='home'&&<Home schedule={schedule} sessions={numberedSessions} profile={profile} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={savePlan} onDeletePlan={deletePlan} onProposal={sendProposal} onOpenWorkout={openAdd}/>}
    {screen==='history'&&<History sessions={numberedSessions} onDelete={deleteSession}/>}
    {screen==='stats'&&<Statistics sessions={numberedSessions} profile={profile} memberCount={members.length} onOpenMembers={()=>navigate('members')}/>}
    {screen==='members'&&<Members members={members} profile={profile} previousTop5={previousTop5}/>}
    {screen==='add-training'&&<AddTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} onProposal={sendProposal} onBack={()=>goBack('home')} onChoose={chooseType}/>}
    {screen==='gym'&&<GymTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} gymTemplates={gymTemplates} onSaveTemplate={saveTemplate} onBack={()=>goBack('add-training')} onHistory={()=>navigate('gym-history')} onSave={saveSession} onTrainerRequest={requestTrainer}/>}
    {screen==='gym-history'&&<GymHistory sessions={numberedSessions.filter(s=>s.type==='gym'&&isHistorySession(s))} onBack={()=>goBack('gym')}/>}
    {screen==='bike'&&<SimpleTraining type="bike" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onSave={saveSession}/>}
    {screen==='workout'&&<SimpleTraining type="workout" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onSave={saveSession}/>}
    {screen==='walk'&&<SimpleTraining type="walk" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onSave={saveSession}/>}
    <BottomNav screen={screen} onNavigate={navigate}/>
  </div>;
}

function BottomNav({screen,onNavigate}){
  const active=['add-training','gym','gym-history','bike','workout','walk'].includes(screen)?'home':screen;
  const items=[['home','⌂','Главная'],['history','▥','История'],['stats','▤','Статистика'],['members','♟','Участники']];
  return <nav className="bottom-nav four">
    {items.map(([key,icon,label])=><button key={key} className={active===key?'active':''} onClick={()=>onNavigate(key)}><span className="nav-icon">{icon}</span>{label}</button>)}
  </nav>;
}

function Home({schedule,sessions,profile,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal,onOpenWorkout}){
  const [pointsOpen,setPointsOpen]=useState(false);
  const events=pointEvents(sessions).slice(-10).reverse();
  const season=seasonMeta();

  return <main className="main-screen home-no-scroll">
    <header className="topbar">
      <div><Brand compact/><p className="brand-subtitle">Тренировки. Питание. Прогресс.</p></div>
      <div className="score-wrap">
        <button className="score-card" onClick={()=>setPointsOpen(true)}><span>★</span><strong>Баллы: {profile?.points||0}</strong></button>
        <small>{scoreHint(sessions)}</small>
      </div>
    </header>

    <DateWheel schedule={schedule} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={onSavePlan} onDeletePlan={onDeletePlan} onProposal={onProposal}/>

    <button className="gradient-button workout-cta" onClick={onOpenWorkout}><span>＋</span>Добавить тренировку<b>›</b></button>
    <p className="helper-text">Выбранная дата: {formatDate(selectedDateKey)}.</p>

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
    setBaseRows(normalizeRows(t?.baseRows,3));
    setExtraRows(normalizeRows(t?.extraRows,5));
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
    await onSaveTemplate(group,baseRows,extraRows);
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

    <ExerciseBlock title="База" subtitle="Основные упражнения на выбранную группу" rows={baseRows} options={BASE_EXERCISES[group]} kind="base" onChange={update} accent="mint"/>
    <ExerciseBlock title="Доп" subtitle="Дельты, руки, пресс и другие мелкие группы" rows={extraRows} options={ACCESSORY_EXERCISES} kind="extra" onChange={update} accent="violet"/>

    <div className="loaded-note"><span>↻</span><div><strong>{gymTemplates[group]?'Загружены данные с прошлой тренировки':'Первый раз — выбери упражнения'}</strong><small>После сохранения приложение запомнит упражнения, подходы и рабочий вес.</small></div></div>

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
  return <section className={`exercise-block ${accent}`}>
    <header><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows.length} упражнений</span></header>
    <div className="exercise-head"><span>Упражнение</span><span>Подходы</span><span>Вес</span></div>
    <div className="exercise-rows">{rows.map((row,i)=><div className="exercise-row" key={i}>
      <select value={row.exercise} onChange={e=>onChange(kind,i,'exercise',e.target.value)}><option value="">Выбрать упражнение</option>{options.map(o=><option key={o}>{o}</option>)}</select>
      <input inputMode="numeric" value={row.sets} onChange={e=>onChange(kind,i,'sets',e.target.value)} placeholder="3"/>
      <div className="weight-input"><input inputMode="decimal" value={row.weight} onChange={e=>onChange(kind,i,'weight',e.target.value)} placeholder="0"/><small>кг</small></div>
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
        {open&&<div className="accordion-body"><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></div>}
      </article>;
    })}</div>
  </main>;
}

function ReadonlyExerciseBlock({title,rows}){
  const visible=rows.filter(r=>r.exercise);
  if(!visible.length)return null;

  return <section className="readonly-block">
    <h3>{title}</h3>
    <div className="readonly-head"><span>Упражнение</span><span>Подх.</span><span>Вес</span></div>
    {visible.map((r,i)=><div className="readonly-row" key={i}><span>{r.exercise}</span><span>{r.sets||'—'}</span><span>{r.weight||'—'} кг</span></div>)}
  </section>;
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
  }else if(type==='workout'){
    valueLabel='Длительность, минут';placeholder='45';totalLabel='Общее время';
    const minutes=list.reduce((sum,x)=>sum+(Number(x.duration)||0),0);
    totalValue=`${(minutes/60).toFixed(minutes%60?1:0)} ч`;
  }else{
    valueLabel='Количество шагов';placeholder='20000';totalLabel='Всего шагов';
    totalValue=list.reduce((sum,x)=>sum+(Number(x.steps)||0),0).toLocaleString('ru-RU');
  }

  async function save(){
    setSaving(true);
    try{
      const payload={type,date:dateKey,title:title.trim()||meta.label};
      if(type==='bike')payload.distance=Number(value)||0;
      if(type==='workout')payload.duration=Number(value)||0;
      if(type==='walk')payload.steps=Number(value)||0;
      await onSave(payload);
    }finally{setSaving(false);}
  }

  const placeholderTitle=type==='bike'?'Вечерняя поездка':type==='workout'?'Турники у моря':'Прогулка по набережной';

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

  return <main className="tab-screen">
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
          {s.type==='gym'?<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>:<p>{sessionValue(s)}</p>}
        </div>}
      </article>;
    })}</div>
  </main>;
}

function Statistics({sessions,profile,memberCount,onOpenMembers}){
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
  const gym=filtered.filter(s=>s.type==='gym').length;
  const bike=filtered.filter(s=>s.type==='bike').reduce((n,s)=>n+(Number(s.distance)||0),0);
  const steps=filtered.filter(s=>s.type==='walk').reduce((n,s)=>n+(Number(s.steps)||0),0);
  const mins=filtered.filter(s=>s.type==='workout').reduce((n,s)=>n+(Number(s.duration)||0),0);
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
      <StatCard type="bike" accent="amber" title="Велосипед" value={bike.toLocaleString('ru-RU')} unit="км"/>
      <StatCard type="walk" accent="green" title="Прогулка" value={steps.toLocaleString('ru-RU')} unit="шагов"/>
      <StatCard type="workout" accent="coral" title="Воркаут" value={(mins/60).toFixed(mins%60?1:0)} unit="часов"/>
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

    <p className="inactive-rule">Если участник 30 дней не получает баллы, аккаунт автоматически удаляется. Для возвращения нужна новая регистрация.</p>
  </main>;
}
