import { useEffect, useRef, useState } from 'react';

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

const uid=()=>crypto.randomUUID?.()??String(Date.now()+Math.random());

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

function useStoredState(key,initialValue){
  const [value,setValue]=useState(()=>{try{const saved=localStorage.getItem(key);return saved?JSON.parse(saved):initialValue;}catch{return initialValue;}});
  useEffect(()=>localStorage.setItem(key,JSON.stringify(value)),[key,value]);
  return [value,setValue];
}
function activityMeta(type){return ACTIVITIES.find(a=>a.id===type);}
function activityLabel(item){return item?.customTitle||activityMeta(item?.type)?.label||'';}
function makeRows(n){return Array.from({length:n},()=>({exercise:'',sets:'',weight:''}));}
function normalizeRows(rows,n){return Array.from({length:n},(_,i)=>({exercise:rows?.[i]?.exercise||'',sets:rows?.[i]?.sets??'',weight:rows?.[i]?.weight??''}));}
function nextTrainingNumber(sessions){return sessions.reduce((max,s)=>Math.max(max,Number(s.number)||0),0)+1;}

function calculatePoints(sessions){
  const ordered=[...sessions].filter(s=>s.date).sort((a,b)=>a.date.localeCompare(b.date)||(a.number||0)-(b.number||0));
  let total=0,prev=null;
  ordered.forEach(s=>{
    const base=(s.type==='gym'||s.type==='bike')?5:3;
    let bonus=0;
    if(prev){
      const gap=daysBetween(prev,s.date);
      if(gap===1)bonus=2;
      else if(gap===2)bonus=1;
      else if(gap>=3&&gap<=5)bonus=0;
      else if(gap>=6&&gap<=13)bonus=-Math.floor((gap-4)/2);
      else if(gap>=14)bonus=10;
    }
    total+=base+bonus;
    prev=s.date;
  });
  return total;
}
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

function Brand({compact=false}){return <div className={`logo-lockup ${compact?'compact':''}`}><span className="logo-mark"><i/><i/></span><span>Форма</span></div>;}

function Onboarding({onSave}){
  const [name,setName]=useState('');
  return <main className="onboarding dark-screen">
    <Brand/><p className="brand-subtitle">Тренировки. Питание. Прогресс.</p>
    <h1>Начнём с движения.</h1><p className="soft-text">Главная задача — сделать тренировку простым следующим действием.</p>
    <form className="glass-card onboarding-form" onSubmit={e=>{e.preventDefault();if(name.trim())onSave({name:name.trim()});}}>
      <label className="dark-field"><span>Как тебя зовут</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя"/></label>
      <button className="gradient-button">Начать</button>
    </form>
  </main>;
}

export default function App(){
  const [profile,setProfile]=useStoredState('forma.profile',null);
  const [schedule,setSchedule]=useStoredState('forma.activities',{});
  const [sessions,setSessions]=useStoredState('forma.sessions',[]);
  const [gymTemplates,setGymTemplates]=useStoredState('forma.gymTemplates',{});
  const [proposals,setProposals]=useStoredState('forma.activityProposals',[]);
  const [screen,setScreen]=useState('home');
  const [selectedDateKey,setSelectedDateKey]=useState(localDateKey());
  const [draftDateKey,setDraftDateKey]=useState(localDateKey());

  if(!profile)return <Onboarding onSave={setProfile}/>;

  function openAdd(){setDraftDateKey(selectedDateKey||localDateKey());setScreen('add-training');}
  function chooseType(type){
    setSchedule(cur=>({...cur,[draftDateKey]:{type,status:'planned',updatedAt:Date.now()}}));
    setScreen(type);
  }
  function saveSession(payload){
    const session={id:uid(),number:nextTrainingNumber(sessions),createdAt:Date.now(),...payload};
    setSessions(cur=>[...cur,session]);
    setSchedule(cur=>({...cur,[session.date]:{type:session.type,status:'completed',customTitle:session.title||'',sessionId:session.id,updatedAt:Date.now()}}));
    setSelectedDateKey(session.date);
    setScreen('home');
  }

  return <div className="app-shell-dark">
    {screen==='home'&&<Home schedule={schedule} setSchedule={setSchedule} sessions={sessions} proposals={proposals} setProposals={setProposals} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onOpenWorkout={openAdd}/>}
    {screen==='history'&&<History sessions={sessions}/>}
    {screen==='stats'&&<Statistics sessions={sessions}/>}
    {screen==='add-training'&&<AddTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} proposals={proposals} setProposals={setProposals} onBack={()=>setScreen('home')} onChoose={chooseType}/>}
    {screen==='gym'&&<GymTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} gymTemplates={gymTemplates} setGymTemplates={setGymTemplates} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {screen==='bike'&&<SimpleTraining type="bike" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {screen==='workout'&&<SimpleTraining type="workout" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {screen==='walk'&&<SimpleTraining type="walk" dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={sessions} onBack={()=>setScreen('add-training')} onSave={saveSession}/>}
    {['home','history','stats'].includes(screen)&&<BottomNav screen={screen} setScreen={setScreen}/>}
  </div>;
}

function BottomNav({screen,setScreen}){
  const items=[['home','⌂','Главная'],['history','▥','История'],['stats','▤','Статистика']];
  return <nav className="bottom-nav three">{items.map(([key,icon,label])=><button key={key} className={screen===key?'active':''} onClick={()=>setScreen(key)}><span className="nav-icon">{icon}</span>{label}</button>)}</nav>;
}

function Home({schedule,setSchedule,sessions,proposals,setProposals,selectedDateKey,setSelectedDateKey,onOpenWorkout}){
  return <main className="main-screen home-no-scroll">
    <header className="topbar">
      <div><Brand compact/><p className="brand-subtitle">Тренировки. Питание. Прогресс.</p></div>
      <div className="score-wrap"><div className="score-card"><span>★</span><strong>Баллы: {calculatePoints(sessions)}</strong></div><small>{scoreHint(sessions)}</small></div>
    </header>
    <DateWheel schedule={schedule} setSchedule={setSchedule} proposals={proposals} setProposals={setProposals} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey}/>
    <button className="gradient-button workout-cta" onClick={onOpenWorkout}><span>🏋︎</span>Перейти к тренировке<b>›</b></button>
    <p className="helper-text">Выбранная дата: {formatDate(selectedDateKey)}.</p>
  </main>;
}

function DateWheel({schedule,setSchedule,proposals,setProposals,selectedDateKey,setSelectedDateKey}){
  const ref=useRef(null),timer=useRef(null),lastHaptic=useRef(selectedDateKey);
  const [open,setOpen]=useState(false),[other,setOther]=useState(false),[proposal,setProposal]=useState('');
  const today=new Date();
  const dates=Array.from({length:1461},(_,i)=>addDays(today,i-730));

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
    c.querySelectorAll('.wheel-date-row').forEach(row=>{
      const r=row.getBoundingClientRect(),d=Math.abs(r.top+r.height/2-mid);
      if(d<dist){dist=d;best=row.dataset.date;}
    });
    if(best&&best!==selectedDateKey){
      setSelectedDateKey(best);
      if(lastHaptic.current!==best){lastHaptic.current=best;navigator.vibrate?.(7);}
    }
  }
  function onScroll(){clearTimeout(timer.current);timer.current=setTimeout(detect,55);}
  function chooseDate(key){setSelectedDateKey(key);navigator.vibrate?.(7);requestAnimationFrame(()=>center(key));}
  function chooseActivity(type){setSchedule(cur=>({...cur,[selectedDateKey]:{type,status:cur[selectedDateKey]?.status==='completed'?'completed':'planned',updatedAt:Date.now()}}));setOpen(false);}
  function clear(){setSchedule(cur=>{const c={...cur};delete c[selectedDateKey];return c;});setOpen(false);}
  function sendProposal(){if(!proposal.trim())return;setProposals([...proposals,{id:uid(),title:proposal.trim(),status:'pending',createdAt:Date.now()}]);setProposal('');setOther(false);setOpen(false);}

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
            {!other?<>{ACTIVITIES.map(a=><button key={a.id} onClick={()=>chooseActivity(a.id)}><span className={a.accent}>{a.icon}</span>{a.label}</button>)}<button onClick={()=>setOther(true)}><span>＋</span>Другое / предложить</button>{item&&<button className="danger-lite" onClick={clear}>Убрать активность</button>}</>:
            <div className="popover-proposal"><input value={proposal} onChange={e=>setProposal(e.target.value)} placeholder="Например: плавание" autoFocus/><button onClick={sendProposal}>Отправить админу</button><small>После одобрения активность появится в общем списке.</small></div>}
          </div>}
        </div>;
      })}
      <div className="wheel-spacer"/>
    </div>
  </section>;
}

function AddTraining({dateKey,setDateKey,proposals,setProposals,onBack,onChoose}){
  const [otherOpen,setOtherOpen]=useState(false),[text,setText]=useState(''),[sent,setSent]=useState(false);
  function submit(){if(!text.trim())return;setProposals([...proposals,{id:uid(),title:text.trim(),status:'pending',createdAt:Date.now()}]);setText('');setSent(true);}
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

function GymTraining({dateKey,setDateKey,sessions,gymTemplates,setGymTemplates,onBack,onSave}){
  const [group,setGroup]=useState('chest'),[baseRows,setBaseRows]=useState(makeRows(3)),[extraRows,setExtraRows]=useState(makeRows(5)),[history,setHistory]=useState(false),[error,setError]=useState('');
  const gymHistory=[...sessions].filter(s=>s.type==='gym').sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);

  useEffect(()=>{const t=gymTemplates[group];setBaseRows(normalizeRows(t?.baseRows,3));setExtraRows(normalizeRows(t?.extraRows,5));setError('');},[group]);

  function update(kind,index,field,value){const setter=kind==='base'?setBaseRows:setExtraRows;setter(cur=>cur.map((row,i)=>i===index?{...row,[field]:value}:row));}
  function save(){
    if(![...baseRows,...extraRows].some(r=>r.exercise)){setError('Выбери хотя бы одно упражнение.');return;}
    setGymTemplates(cur=>({...cur,[group]:{baseRows,extraRows}}));
    onSave({type:'gym',date:dateKey,gymGroup:group,baseRows,extraRows,title:GYM_GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
  }
  if(history)return <GymHistory sessions={gymHistory} onBack={()=>setHistory(false)}/>;

  return <main className="sub-screen gym-screen">
    <ScreenBack onBack={onBack} title="Тренировка"/>
    <label className="date-control compact-date"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
    <div className="gym-tabs">{GYM_GROUPS.map(g=><button key={g.id} className={group===g.id?'active':''} onClick={()=>setGroup(g.id)}><span>{g.icon}</span>{g.label}</button>)}</div>
    <button className="previous-button" onClick={()=>setHistory(true)}><span>◴</span>Предыдущие тренировки<b>›</b></button>
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
  const meta=activityMeta(type),[title,setTitle]=useState(''),[value,setValue]=useState('');
  const list=[...sessions].filter(s=>s.type===type).sort((a,b)=>b.date.localeCompare(a.date)||b.number-a.number);
  const previous=list.slice(0,5);
  let valueLabel='',placeholder='',totalLabel='',totalValue='';
  if(type==='bike'){valueLabel='Километраж, км';placeholder='32.5';totalLabel='Общий пробег';totalValue=`${list.reduce((s,x)=>s+(Number(x.distance)||0),0).toLocaleString('ru-RU')} км`;}
  else if(type==='workout'){valueLabel='Длительность, минут';placeholder='45';totalLabel='Общее время';const m=list.reduce((s,x)=>s+(Number(x.duration)||0),0);totalValue=`${(m/60).toFixed(m%60?1:0)} ч`;}
  else{valueLabel='Количество шагов';placeholder='20000';totalLabel='Всего шагов';totalValue=list.reduce((s,x)=>s+(Number(x.steps)||0),0).toLocaleString('ru-RU');}

  function save(){const p={type,date:dateKey,title:title.trim()||meta.label};if(type==='bike')p.distance=Number(value)||0;if(type==='workout')p.duration=Number(value)||0;if(type==='walk')p.steps=Number(value)||0;onSave(p);}
  const ph=type==='bike'?'Вечерняя поездка':type==='workout'?'Турники у моря':'Прогулка по набережной';

  return <main className="sub-screen simple-training-screen">
    <ScreenBack onBack={onBack} title={meta.label}/>
    <section className="metric-hero"><span className={meta.accent}>{meta.icon}</span><div><small>{totalLabel}</small><strong>{totalValue||'0'}</strong></div></section>
    <section className="glass-card simple-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={ph}/></label>
      <label className="dark-field"><span>{valueLabel} — необязательно</span><input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder}/></label>
      <button className="gradient-button save-simple" onClick={save}>Сохранить тренировку</button>
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
