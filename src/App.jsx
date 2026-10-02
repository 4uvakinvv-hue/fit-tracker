import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';

const ACTIVITIES = [
  { id: 'gym', label: 'Тренажёрка', icon: '🏋︎', accent: 'violet' },
  { id: 'bike', label: 'Велосипед', icon: '◉', accent: 'amber' },
  { id: 'workout', label: 'Воркаут', icon: '⌗', accent: 'coral' },
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
function scoreHint(sessions){
  if(!sessions.length)return 'Первая тренировка — уже сильный шаг';
  const latest=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||(b.number||0)-(a.number||0))[0];
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
function mapSession(row){return {...row,gymGroup:row.gym_group,baseRows:row.base_rows||[],extraRows:row.extra_rows||[]};}

function Brand({compact=false}){return <div className={`logo-lockup ${compact?'compact':''}`}><span className="logo-mark"><i/><i/></span><span>Форма</span></div>;}

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
    <div className="auth-tabs"><button className={mode==='register'?'active':''} onClick={()=>setMode('register')}>Регистрация</button><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Вход</button></div>
    <form className="glass-card onboarding-form" onSubmit={submit}>
      {mode==='register'&&<label className="dark-field"><span>Имя</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Как тебя показывать участникам"/></label>}
      <label className="dark-field"><span>E-mail</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Минимум 6 символов" minLength={6} required/></label>
      <button className="gradient-button" disabled={busy}>{busy?'Подожди…':mode==='register'?'Зарегистрироваться':'Войти'}</button>
      {message&&<p className="auth-message">{message}</p>}
    </form>
  </main>;
}

export default function App(){
  const [authSession,setAuthSession]=useState(undefined);
  const [profile,setProfile]=useState(null);
  const [members,setMembers]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [schedule,setSchedule]=useState({});
  const [gymTemplates,setGymTemplates]=useState({});
  const [screen,setScreen]=useState('home');
  const [selectedDateKey,setSelectedDateKey]=useState(localDateKey());
  const [draftDateKey,setDraftDateKey]=useState(localDateKey());
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');

  useEffect(()=>{
    let active=true;
    const fallback=setTimeout(()=>{
      if(!active)return;
      setAuthSession(current=>current===undefined?null:current);
      setLoading(false);
    },3500);

    supabase.auth.getSession()
      .then(({data,error})=>{
        if(!active)return;
        clearTimeout(fallback);
        if(error){
          setLoadError('Не удалось проверить вход. Попробуй ещё раз.');
          setAuthSession(null);
        }else{
          setAuthSession(data.session||null);
        }
      })
      .catch(()=>{
        if(!active)return;
        clearTimeout(fallback);
        setLoadError('Не удалось проверить вход. Попробуй ещё раз.');
        setAuthSession(null);
      });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(active)setAuthSession(next);
    });

    return ()=>{
      active=false;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  },[]);

  useEffect(()=>{
    if(authSession?.user){loadData();}
    else if(authSession===null){setLoading(false);setProfile(null);setMembers([]);setSessions([]);setSchedule({});}
  },[authSession?.user?.id]);

  async function loadData(){
    setLoading(true);
    setLoadError('');
    const userId=authSession.user.id;

    try{
      const queries=Promise.all([
        supabase.from('profiles').select('*').eq('id',userId).single(),
        supabase.from('profiles').select('id,name,points,joined_at,last_points_at').order('points',{ascending:false}).order('joined_at',{ascending:true}),
        supabase.from('sessions').select('*').eq('user_id',userId).order('date',{ascending:true}).order('number',{ascending:true}),
        supabase.from('plans').select('*').eq('user_id',userId),
        supabase.from('gym_templates').select('*').eq('user_id',userId),
      ]);

      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),8000));
      const [profileRes,membersRes,sessionsRes,plansRes,templatesRes]=await Promise.race([queries,timeout]);

      if(profileRes.error)throw profileRes.error;
      if(profileRes.data)setProfile(profileRes.data);
      setMembers(membersRes.data||[]);
      setSessions((sessionsRes.data||[]).map(mapSession));

      const plans={};
      (plansRes.data||[]).forEach(p=>{plans[p.date]={type:p.type,status:p.status,customTitle:p.custom_title||'',updatedAt:p.updated_at};});
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
    await supabase.from('plans').upsert({user_id:authSession.user.id,date,type,custom_title:customTitle||null,status,updated_at:new Date().toISOString()});
    setSchedule(cur=>({...cur,[date]:{type,status,customTitle,updatedAt:Date.now()}}));
  }

  async function deletePlan(date){
    if(!authSession?.user)return;
    await supabase.from('plans').delete().eq('user_id',authSession.user.id).eq('date',date);
    setSchedule(cur=>{const c={...cur};delete c[date];return c;});
  }

  async function sendProposal(title){
    if(!authSession?.user||!title.trim())return;
    await supabase.from('activity_proposals').insert({user_id:authSession.user.id,title:title.trim()});
  }

  function openAdd(){setDraftDateKey(selectedDateKey||localDateKey());setScreen('add-training');}
  async function chooseType(type){await savePlan(draftDateKey,type,'','planned');setScreen(type);}

  async function saveSession(payload){
    const {data:number,error:numberError}=await supabase.rpc('next_training_number');
    if(numberError)throw numberError;

    const row={
      user_id:authSession.user.id,
      number,
      type:payload.type,
      date:payload.date,
      title:payload.title||null,
      distance:payload.distance??null,
      duration:payload.duration??null,
      steps:payload.steps??null,
      gym_group:payload.gymGroup||null,
      base_rows:payload.baseRows||null,
      extra_rows:payload.extraRows||null,
    };

    const {data,error}=await supabase.from('sessions').insert(row).select().single();
    if(error)throw error;

    await supabase.from('plans').upsert({user_id:authSession.user.id,date:payload.date,type:payload.type,custom_title:payload.title||null,status:'completed',updated_at:new Date().toISOString()});
    setSelectedDateKey(payload.date);
    await loadData();
    setScreen('home');
  }

  async function saveTemplate(group,baseRows,extraRows){
    await supabase.from('gym_templates').upsert({user_id:authSession.user.id,gym_group:group,base_rows:baseRows,extra_rows:extraRows,updated_at:new Date().toISOString()});
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

  if(authSession===undefined||loading)return <main className="onboarding dark-screen"><Brand/><p className="loading-copy">Загружаем Форму…</p></main>;
  if(!authSession)return <AuthScreen/>;
  if(loadError)return <main className="onboarding dark-screen"><Brand/><h1>Связь с базой</h1><p className="soft-text">{loadError}</p><div className="glass-card onboarding-form"><button className="gradient-button" onClick={loadData}>Повторить</button><button className="secondary-dark" onClick={()=>supabase.auth.signOut()}>Выйти из аккаунта</button></div></main>;

  return <div className="app-shell-dark">
    {screen==='home'&&<Home schedule={schedule} sessions={sessions} profile={profile} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={savePlan} onDeletePlan={deletePlan} onProposal={sendProposal} onOpenWorkout={openAdd}/>}
    {screen==='history'&&<History sessions={sessions}/>}
    {screen==='stats'&&<Statistics sessions={sessions}/>}
    {screen==='members'&&<Members members={members} profile={profile} onRefresh={loadData}/>}
    {screen==='add-training'&&<AddTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} onProposal={sendProposal} onBack={()=>setScreen('home')} onChoose={chooseType}/>}
    {screen==='gym'&&<GymTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} gymTemplates={gymTemplates} onSaveTemplate={saveTemplate} onBack={()=>setScreen('add-training')} onSave={saveSession} onTrainerRequest={requestTrainer}/>}
    {screen==='bike'&&<SimpleTraining type="bike" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {screen==='workout'&&<SimpleTraining type="workout" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {screen==='walk'&&<SimpleTraining type="walk" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {['home','history','stats','members'].includes(screen)&&<BottomNav screen={screen} setScreen={setScreen}/>}
  </div>;
}

function BottomNav({screen,setScreen}){
  const items=[['home','⌂','Главная'],['history','▥','История'],['stats','▤','Статистика'],['members','♟','Участники']];
  return <nav className="bottom-nav four">{items.map(([key,icon,label])=><button key={key} className={screen===key?'active':''} onClick={()=>setScreen(key)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav>;
}

function Home({schedule,sessions,profile,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal,onOpenWorkout}){
  return <main className="main-screen home-no-scroll">
    <header className="topbar">
      <div><Brand compact/><p className="brand-subtitle">Тренировки. Питание. Прогресс.</p></div>
      <div className="score-wrap"><div className="score-card"><span>★</span><strong>Баллы: {profile?.points||0}</strong></div><small>{scoreHint(sessions)}</small></div>
    </header>
    <DateWheel schedule={schedule} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={onSavePlan} onDeletePlan={onDeletePlan} onProposal={onProposal}/>
    <button className="gradient-button workout-cta" onClick={onOpenWorkout}><span>🏋︎</span>Перейти к тренировке<b>›</b></button>
    <p className="helper-text">Выбранная дата: {formatDate(selectedDateKey)}.</p>
  </main>;
}

function DateWheel({schedule,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal}){
  const ref=useRef(null),timer=useRef(null),lastHaptic=useRef(selectedDateKey);
  const [open,setOpen]=useState(false),[other,setOther]=useState(false),[proposal,setProposal]=useState('');
  const today=new Date();
  const dates=useMemo(()=>Array.from({length:1461},(_,i)=>addDays(today,i-730)),[]);

  function center(key,behavior='smooth'){
    const c=ref.current;if(!c)return;
    const row=c.querySelector(`[data-date="${key}"]`);if(!row)return;
    c.scrollTo({top:row.offsetTop-c.clientHeight/2+row.offsetHeight/2,behavior});
  }
  useEffect(()=>{requestAnimationFrame(()=>center(selectedDateKey,'auto'));},[]);
  useEffect(()=>{setOpen(false);setOther(false);},[selectedDateKey]);

  function detect(){
    const c=ref.current;if(!c)return;
    const mid=c.getBoundingClientRect().top+c.clientHeight/2;
    let best=null,dist=Infinity;
    c.querySelectorAll('.wheel-date-row').forEach(row=>{const r=row.getBoundingClientRect(),d=Math.abs(r.top+r.height/2-mid);if(d<dist){dist=d;best=row.dataset.date;}});
    if(best&&best!==selectedDateKey){setSelectedDateKey(best);if(lastHaptic.current!==best){lastHaptic.current=best;navigator.vibrate?.(7);}}
  }
  function onScroll(){clearTimeout(timer.current);timer.current=setTimeout(detect,55);}
  function chooseDate(key){setSelectedDateKey(key);navigator.vibrate?.(7);requestAnimationFrame(()=>center(key));}
  async function chooseActivity(type){await onSavePlan(selectedDateKey,type,'','planned');setOpen(false);}
  async function sendProposal(){if(!proposal.trim())return;await onProposal(proposal.trim());setProposal('');setOther(false);setOpen(false);}

  return <section className="date-wheel-shell">
    <div className="wheel-center-line"/><div className="wheel-fade wheel-fade-top"/><div className="wheel-fade wheel-fade-bottom"/>
    <div ref={ref} className="date-wheel-scroll" onScroll={onScroll}>
      <div className="wheel-spacer"/>
      {dates.map(date=>{
        const key=localDateKey(date),selected=key===selectedDateKey,item=schedule[key],meta=activityMeta(item?.type),isToday=key===localDateKey();
        return <div key={key} data-date={key} className={`wheel-date-row ${selected?'selected':''}`} onClick={()=>chooseDate(key)}>
          <span className="weekday">{new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(date)}</span>
          <span className="wheel-date-label">{formatDateShort(key)}{isToday&&<em>сегодня</em>}</span>
          {selected?
            <button className={`inline-activity ${meta?.accent||''}`} onClick={e=>{e.stopPropagation();setOpen(v=>!v);}}><span>{meta?.icon||'＋'}</span><strong>{activityLabel(item)||'Активность'}</strong><b>⌄</b></button>:
            <span className={`activity-label ${meta?.accent||''}`}>{meta?<><b>{meta.icon}</b>{activityLabel(item)}</>:<span className="empty-dash">—</span>}</span>}
          <span className={`status-dot ${item?.status||''}`}>{item?.status==='completed'?'✓':''}</span>
          {selected&&open&&<div className="activity-popover" onClick={e=>e.stopPropagation()}>
            {!other?<>{ACTIVITIES.map(a=><button key={a.id} onClick={()=>chooseActivity(a.id)}><span className={a.accent}>{a.icon}</span>{a.label}</button>)}<button onClick={()=>setOther(true)}><span>＋</span>Другое / предложить</button>{item&&<button className="danger-lite" onClick={()=>onDeletePlan(selectedDateKey)}>Убрать активность</button>}</>:
            <div className="popover-proposal"><input value={proposal} onChange={e=>setProposal(e.target.value)} placeholder="Например: плавание" autoFocus/><button onClick={sendProposal}>Отправить админу</button><small>После одобрения активность появится в общем списке.</small></div>}
          </div>}
        </div>;
      })}
      <div className="wheel-spacer"/>
    </div>
  </section>;
}

function AddTraining({dateKey,setDateKey,onProposal,onBack,onChoose}){
  const [otherOpen,setOtherOpen]=useState(false),[text,setText]=useState(''),[sent,setSent]=useState(false);
  async function submit(){if(!text.trim())return;await onProposal(text.trim());setText('');setSent(true);}
  return <main className="sub-screen">
    <ScreenBack onBack={onBack}/><p className="eyebrow-dark">Новая запись</p><h1>Добавить тренировку</h1>
    <label className="date-control"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
    <div className="activity-grid add-grid">
      {ACTIVITIES.map(a=><button key={a.id} className={`activity-choice ${a.accent}`} onClick={()=>onChoose(a.id)}><span>{a.icon}</span><strong>{a.label}</strong>{a.id==='walk'&&<small>от 20 000 шагов</small>}</button>)}
      <button className="activity-choice other-choice" onClick={()=>setOtherOpen(v=>!v)}><span>＋</span><strong>Другое</strong><small>предложить активность</small></button>
    </div>
    {otherOpen&&<section className="glass-card other-form"><label className="dark-field"><span>Название активности</span><input value={text} onChange={e=>{setText(e.target.value);setSent(false);}} placeholder="Например: плавание"/></label><button className="secondary-dark" onClick={submit}>Отправить на модерацию</button>{sent&&<p className="success-line">Отправлено админу на согласование.</p>}</section>}
  </main>;
}

function ScreenBack({onBack,title}){return <div className="screen-back-row"><button className="back-button" onClick={onBack}>‹</button>{title&&<strong>{title}</strong>}</div>;}

function GymTraining({dateKey,setDateKey,sessions,gymTemplates,onSaveTemplate,onBack,onSave,onTrainerRequest}){
  const [group,setGroup]=useState('chest'),[baseRows,setBaseRows]=useState(makeRows(3)),[extraRows,setExtraRows]=useState(makeRows(5)),[history,setHistory]=useState(false),[error,setError]=useState(''),[trainerState,setTrainerState]=useState('');
  const gymHistory=[...sessions].filter(s=>s.type==='gym').sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);

  useEffect(()=>{const t=gymTemplates[group];setBaseRows(normalizeRows(t?.baseRows,3));setExtraRows(normalizeRows(t?.extraRows,5));setError('');},[group,gymTemplates]);

  function update(kind,index,field,value){const setter=kind==='base'?setBaseRows:setExtraRows;setter(cur=>cur.map((row,i)=>i===index?{...row,[field]:value}:row));}
  async function save(){
    if(![...baseRows,...extraRows].some(r=>r.exercise)){setError('Выбери хотя бы одно упражнение.');return;}
    await onSaveTemplate(group,baseRows,extraRows);
    await onSave({type:'gym',date:dateKey,gymGroup:group,baseRows,extraRows,title:GYM_GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
  }
  async function trainer(){
    setTrainerState('loading');
    try{await onTrainerRequest();setTrainerState('sent');}
    catch{setTrainerState('error');}
  }
  if(history)return <GymHistory sessions={gymHistory} onBack={()=>setHistory(false)}/>;

  return <main className="sub-screen gym-screen">
    <ScreenBack onBack={onBack} title="Тренировка"/>
    <label className="date-control compact-date"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
    <div className="gym-tabs">{GYM_GROUPS.map(g=><button key={g.id} className={group===g.id?'active':''} onClick={()=>setGroup(g.id)}><span>{g.icon}</span>{g.label}</button>)}</div>
    <div className="gym-actions">
      <button className="previous-button" onClick={()=>setHistory(true)}><span>◴</span>Предыдущие тренировки<b>›</b></button>
      <button className="trainer-button" onClick={trainer} disabled={trainerState==='loading'||trainerState==='sent'}><span>♟</span>{trainerState==='sent'?'Заявка отправлена':'Заказать тренера'}</button>
    </div>
    {trainerState==='error'&&<p className="error-line">Не удалось отправить заявку. Попробуй ещё раз.</p>}
    <ExerciseBlock title="База" subtitle="Основные упражнения на выбранную группу" rows={baseRows} options={BASE_EXERCISES[group]} kind="base" onChange={update} accent="mint"/>
    <ExerciseBlock title="Доп" subtitle="Дельты, руки, пресс и другие мелкие группы" rows={extraRows} options={ACCESSORY_EXERCISES} kind="extra" onChange={update} accent="violet"/>
    <div className="loaded-note"><span>↻</span><div><strong>{gymTemplates[group]?'Загружены данные с прошлой тренировки':'Первый раз — выбери упражнения'}</strong><small>После сохранения приложение запомнит упражнения, подходы и рабочий вес.</small></div></div>
    {error&&<p className="error-line">{error}</p>}
    <button className="gradient-button save-training" onClick={save}><span>▣</span>Сохранить тренировку<b>›</b></button>
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
  const [openId,setOpenId]=useState(sessions[0]?.id||null);
  return <main className="sub-screen"><ScreenBack onBack={onBack} title="Предыдущие тренировки"/>
    {!sessions.length&&<div className="empty-state">Сохранённых тренировок пока нет.</div>}
    <div className="accordion-list">{sessions.map(s=>{const open=s.id===openId,group=GYM_GROUPS.find(g=>g.id===s.gymGroup);return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
      <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}><span className="accordion-icon">{group?.icon||'🏋︎'}</span><span><strong>Тренировка №{s.number} · {group?.label||'Тренажёрка'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span><b>{open?'⌃':'⌄'}</b></button>
      {open&&<div className="accordion-body"><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></div>}
    </article>;})}</div>
  </main>;
}

function ReadonlyExerciseBlock({title,rows}){
  const visible=rows.filter(r=>r.exercise);if(!visible.length)return null;
  return <section className="readonly-block"><h3>{title}</h3><div className="readonly-head"><span>Упражнение</span><span>Подх.</span><span>Вес</span></div>
    {visible.map((r,i)=><div className="readonly-row" key={i}><span>{r.exercise}</span><span>{r.sets||'—'}</span><span>{r.weight||'—'} кг</span></div>)}
  </section>;
}

function SimpleTraining({type,dateKey,setDateKey,sessions,onBack,onSave}){
  const meta=activityMeta(type),[title,setTitle]=useState(''),[value,setValue]=useState(''),[saving,setSaving]=useState(false);
  const list=[...sessions].filter(s=>s.type===type).sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);
  const previous=list.slice(0,5);
  let valueLabel='',placeholder='',totalLabel='',totalValue='';
  if(type==='bike'){valueLabel='Километраж, км';placeholder='32.5';totalLabel='Общий пробег';totalValue=`${list.reduce((s,x)=>s+(Number(x.distance)||0),0).toLocaleString('ru-RU')} км`;}
  else if(type==='workout'){valueLabel='Длительность, минут';placeholder='45';totalLabel='Общее время';const m=list.reduce((s,x)=>s+(Number(x.duration)||0),0);totalValue=`${(m/60).toFixed(m%60?1:0)} ч`;}
  else{valueLabel='Количество шагов';placeholder='20000';totalLabel='Всего шагов';totalValue=list.reduce((s,x)=>s+(Number(x.steps)||0),0).toLocaleString('ru-RU');}

  async function save(){setSaving(true);const p={type,date:dateKey,title:title.trim()||meta.label};if(type==='bike')p.distance=Number(value)||0;if(type==='workout')p.duration=Number(value)||0;if(type==='walk')p.steps=Number(value)||0;await onSave(p);setSaving(false);}
  const ph=type==='bike'?'Вечерняя поездка':type==='workout'?'Турники у моря':'Прогулка по набережной';

  return <main className="sub-screen simple-training-screen">
    <ScreenBack onBack={onBack} title={meta.label}/>
    <section className="metric-hero"><span className={meta.accent}>{meta.icon}</span><div><small>{totalLabel}</small><strong>{totalValue||'0'}</strong></div></section>
    <section className="glass-card simple-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={ph}/></label>
      <label className="dark-field"><span>{valueLabel} — необязательно</span><input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder}/></label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить тренировку'}</button>
    </section>
    <section className="recent-section"><header><h2>Последние 5</h2><span>{list.length} всего</span></header>
      {!previous.length&&<div className="empty-state compact-empty">Пока нет сохранённых тренировок.</div>}
      {previous.map(s=><article className="recent-row" key={s.id}><span className={`recent-number ${meta.accent}`}>№{s.number}</span><div><strong>{s.title||meta.label}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></div><b>{sessionValue(s)}</b></article>)}
    </section>
  </main>;
}

function History({sessions}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number),[openId,setOpenId]=useState(null);
  return <main className="tab-screen"><p className="eyebrow-dark">Все активности</p><h1>История тренировок</h1>
    {!ordered.length&&<div className="empty-state">Пока ни одной сохранённой тренировки.</div>}
    <div className="master-history">{ordered.map(s=>{const meta=activityMeta(s.type),open=openId===s.id;return <article className={`master-history-row ${open?'open':''}`} key={s.id}>
      <button onClick={()=>setOpenId(open?null:s.id)}><span className={`history-type-icon ${meta?.accent||''}`}>{meta?.icon||'•'}</span><span className="history-copy"><strong>Тренировка №{s.number} · {s.title||meta?.label}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span><span className="history-value">{sessionValue(s)}</span><b>{open?'⌃':'⌄'}</b></button>
      {open&&<div className="master-detail">{s.type==='gym'?<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>:<p>{sessionValue(s)}</p>}</div>}
    </article>;})}</div>
  </main>;
}

function Statistics({sessions}){
  const [range,setRange]=useState('30d'),[customStart,setCustomStart]=useState(localDateKey(addDays(new Date(),-30))),[customEnd,setCustomEnd]=useState(localDateKey());
  const today=new Date();let start,end=localDateKey(today);
  if(range==='prev-month'){const first=new Date(today.getFullYear(),today.getMonth(),1,12);start=localDateKey(addMonths(first,-1));end=localDateKey(addDays(first,-1));}
  else if(range==='30d')start=localDateKey(addDays(today,-29));
  else if(range==='6m')start=localDateKey(addMonths(today,-6));
  else if(range==='1y')start=localDateKey(addYears(today,-1));
  else{start=customStart;end=customEnd;}
  const f=sessions.filter(s=>s.date>=start&&s.date<=end);
  const gym=f.filter(s=>s.type==='gym').length;
  const bike=f.filter(s=>s.type==='bike').reduce((n,s)=>n+(Number(s.distance)||0),0);
  const steps=f.filter(s=>s.type==='walk').reduce((n,s)=>n+(Number(s.steps)||0),0);
  const mins=f.filter(s=>s.type==='workout').reduce((n,s)=>n+(Number(s.duration)||0),0);
  const ranges=[['prev-month','Прошедший месяц'],['30d','30 дней'],['6m','6 месяцев'],['1y','Год'],['custom','Свой диапазон']];

  return <main className="tab-screen stats-screen"><p className="eyebrow-dark">Сводка</p><h1>Статистика</h1>
    <div className="range-tabs">{ranges.map(([k,l])=><button key={k} className={range===k?'active':''} onClick={()=>setRange(k)}>{l}</button>)}</div>
    {range==='custom'&&<div className="custom-range"><label><span>От</span><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}/></label><label><span>До</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/></label></div>}
    <p className="range-caption">{formatDate(start)} — {formatDate(end)}</p>
    <div className="stats-grid-big">
      <StatCard icon="🏋︎" accent="violet" title="Тренажёрка" value={gym.toLocaleString('ru-RU')} unit="тренировок"/>
      <StatCard icon="◉" accent="amber" title="Велосипед" value={bike.toLocaleString('ru-RU')} unit="км"/>
      <StatCard icon="🚶" accent="green" title="Прогулка" value={steps.toLocaleString('ru-RU')} unit="шагов"/>
      <StatCard icon="⌗" accent="coral" title="Воркаут" value={(mins/60).toFixed(mins%60?1:0)} unit="часов"/>
    </div>
  </main>;
}
function StatCard({icon,accent,title,value,unit}){return <article className={`stat-card ${accent}`}><span className="stat-icon">{icon}</span><small>{title}</small><strong>{value}</strong><em>{unit}</em></article>;}

function Members({members,profile,onRefresh}){
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installState,setInstallState]=useState('');

  useEffect(()=>{
    function handler(e){e.preventDefault();setInstallPrompt(e);}
    window.addEventListener('beforeinstallprompt',handler);
    return ()=>window.removeEventListener('beforeinstallprompt',handler);
  },[]);

  async function install(){
    if(!installPrompt){setInstallState('В Chrome открой меню ⋮ → «Добавить на главный экран» / «Установить приложение».');return;}
    await installPrompt.prompt();
    const choice=await installPrompt.userChoice;
    setInstallState(choice.outcome==='accepted'?'Установка запущена.':'Установка отменена.');
    setInstallPrompt(null);
  }

  return <main className="tab-screen members-screen">
    <div className="members-head">
      <div><p className="eyebrow-dark">Рейтинг</p><h1>Участники</h1></div>
      <strong>{members.length}</strong>
    </div>
    <p className="members-caption">Участников всего: {members.length}. Выше — тот, у кого больше баллов.</p>

    <div className="leaderboard">
      {members.map((m,index)=><article key={m.id} className={`leader-row ${m.id===profile?.id?'me':''}`}>
        <span className="rank-place">{index+1}</span>
        <span className="member-avatar">{m.name?.trim()?.[0]?.toUpperCase()||'У'}</span>
        <div><strong>{m.name}{m.id===profile?.id?' · вы':''}</strong><small>{index===0?'Лидер рейтинга':'Участник'}</small></div>
        <b>★ {m.points||0}</b>
      </article>)}
    </div>

    <section className="install-card">
      <div><strong>Установить на Android</strong><small>После установки «Форма» будет открываться как отдельное приложение.</small></div>
      <button onClick={install}>Установить</button>
      {installState&&<p>{installState}</p>}
    </section>

    <div className="account-actions"><button onClick={onRefresh}>Обновить рейтинг</button><button className="logout" onClick={()=>supabase.auth.signOut()}>Выйти</button></div>
    <p className="inactive-rule">Если участник 30 дней не получает баллы, аккаунт автоматически удаляется. Для возвращения нужно зарегистрироваться заново.</p>
  </main>;
}
