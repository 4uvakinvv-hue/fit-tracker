import {useEffect,useRef,useState} from 'react';
import ExercisePicker from './ExercisePicker.jsx';
import {supabase} from './supabase.js';
import {GROUPS,normalizedRows,draftKey,readDraft,writeDraft,normalizeResults,validateResults,tonnage,todayMoscow} from './gym-drafts.js';
function selection(user){try{return JSON.parse(localStorage.getItem(`forma:gym-selection:${user}`))||{};}catch{return {};}}
export default function GymTraining({userId,dateKey,setDateKey,sessions,gymTemplates,onSaveTemplate,onBack,onHistory,onSave,onTrainerRequest,onTrainerWorkout}){
 const [group,setGroup]=useState(()=>GROUPS.some(g=>g.id===selection(userId).group)?selection(userId).group:'chest');
 const [coachAccess,setCoachAccess]=useState('checking');
 const [coachMessage,setCoachMessage]=useState('');
 const key=draftKey(userId,'manual',dateKey,group);
 function load(){const draft=readDraft(localStorage,key);if(draft)return draft;const t=gymTemplates[group];return {id:crypto.randomUUID(),baseRows:normalizedRows(t?.baseRows,group==='custom'?8:3),extraRows:group==='custom'?[]:normalizedRows(t?.extraRows,5)};}
 const [data,setData]=useState(load),[error,setError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(()=>readDraft(localStorage,key)?'Черновик восстановлен':'Изменения сохраняются автоматически');
 const current=useRef({key,data}),savingRef=useRef(false);
 const extraNames=[...sessions.flatMap(s=>[...(s.baseRows||[]),...(s.extraRows||[])]),...Object.values(gymTemplates).flatMap(t=>[...(t.baseRows||[]),...(t.extraRows||[])])].map(r=>r.exercise).filter(Boolean);
 useEffect(()=>{let active=true;const check=async()=>{try{const {data,error}=await supabase.functions.invoke('trainer-access',{body:{action:'status'}});if(active)setCoachAccess(error?'error':data?.active?'active':'inactive');}catch{if(active)setCoachAccess('error');}};check();const onFocus=()=>check();window.addEventListener('focus',onFocus);return()=>{active=false;window.removeEventListener('focus',onFocus);};},[userId]);
 function openCoach(){if(coachAccess==='active'){setCoachMessage('');onTrainerWorkout();return;}if(coachAccess==='checking'||coachAccess==='error'){setCoachMessage('Не удалось проверить подписку. Проверь соединение и открой страницу ещё раз.');return;}setCoachMessage('Чтобы получить тренировку от тренера, оформите подписку через кнопку «Заказать тренера».');}
 useEffect(()=>{const last=selection(userId);if(dateKey===todayMoscow()&&last.date&&readDraft(localStorage,draftKey(userId,'manual',last.date,last.group))){setDateKey(last.date);}},[]);
 useEffect(()=>{if(current.current.key===key)return;const next=load();current.current={key,data:next};setData(next);setError('');setNotice(readDraft(localStorage,key)?'Черновик восстановлен':'Изменения сохраняются автоматически');},[key]);
 function update(kind,index,field,value){const next={...current.current.data,[kind]:current.current.data[kind].map((r,i)=>i===index?{...r,[field]:value}:r)};current.current={key,data:next};setData(next);try{writeDraft(localStorage,key,next);localStorage.setItem(`forma:gym-selection:${userId}`,JSON.stringify({date:dateKey,group}));setNotice('Черновик сохранён на этом устройстве');setError('');}catch{setError('Не удалось сохранить черновик на устройстве. Не закрывай экран до сохранения тренировки.');}}
 function changeGroup(id){setGroup(id);try{localStorage.setItem(`forma:gym-selection:${userId}`,JSON.stringify({date:dateKey,group:id}));}catch{}}
 async function save(){if(savingRef.current)return;const snapshot=current.current.data,saveKey=current.current.key;const rows=[...snapshot.baseRows,...snapshot.extraRows];if(!rows.some(r=>r.exercise)){setError('Выбери хотя бы одно упражнение.');return;}const invalid=validateResults(rows);if(invalid){setError(invalid);return;}savingRef.current=true;setSaving(true);setError('');try{
   // Persist the same ID before the first request, so a retry cannot duplicate a session.
   writeDraft(localStorage,saveKey,snapshot);
   const baseRows=normalizeResults(snapshot.baseRows),extraRows=normalizeResults(snapshot.extraRows);
   await onSaveTemplate(group,baseRows,extraRows);
   await onSave({draftId:snapshot.id,type:'gym',date:dateKey,gymGroup:group,baseRows,extraRows,title:GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
   localStorage.removeItem(saveKey);setNotice('Тренировка сохранена');
  }catch(e){setError(e.message||'Не удалось сохранить тренировку. Черновик остаётся на устройстве.');}finally{savingRef.current=false;setSaving(false);}}
 const total=Math.round(tonnage([...data.baseRows,...data.extraRows])).toLocaleString('ru-RU');
 return <main className="sub-screen gym-screen"><div className="screen-back-row"><button className="back-button" onClick={onBack}>‹</button><strong>Тренировка</strong></div>
  <section className="gym-coach-top" style={{display:'grid',gap:8,margin:'12px 0 18px'}}><button type="button" className="gradient-button coach-workout-entry" style={{width:'100%',minHeight:52,fontSize:16,fontWeight:800}} onClick={openCoach}>Тренировка от тренера <b>›</b></button>{coachAccess==='active'&&<small>Подписка активна — твой индивидуальный план доступен</small>}{coachAccess==='checking'&&<small>Проверяем доступ к тренеру…</small>}{coachMessage&&<p role="status" className="soft-text">{coachMessage}</p>}</section>
  <label className="date-control compact-date"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)} disabled={saving}/></label>
  <div className="gym-tabs">{GROUPS.map(g=><button key={g.id} className={group===g.id?'active':''} disabled={saving} onClick={()=>changeGroup(g.id)}><span>{g.icon}</span>{g.label}</button>)}</div>
  <p className="gym-draft-status" role="status">{notice}. В историю попадёт только после сохранения тренировки.</p>
  <ExerciseBlock title={group==='custom'?'Упражнения':'База'} rows={data.baseRows} group={group==='custom'?'all':group} kind="baseRows" onChange={update} extraNames={extraNames}/>
  {group!=='custom'&&<ExerciseBlock title="Доп" rows={data.extraRows} group="accessory" kind="extraRows" onChange={update} extraNames={extraNames}/>}
  <div className="tonnage-summary"><span>Тоннаж тренировки</span><strong>{total} кг</strong></div>
  {error&&<p className="error-line" role="alert">{error}</p>}
  <button className="gradient-button save-training gym-save-primary" onClick={save} disabled={saving}>{saving?'Сохраняем…':dateKey>todayMoscow()?'Запланировать тренировку':'Сохранить тренировку'}<b>›</b></button>
  <div className="gym-coach-actions"><button className="gym-quiet-link" onClick={onTrainerRequest}>Заказать тренера</button></div>
  <button className="gym-history-link" onClick={onHistory}>Предыдущие тренировки<span>›</span></button>
 </main>;
}
function ExerciseBlock({title,rows,group,kind,onChange,extraNames}){
 const [openComment,setOpenComment]=useState(null);
 return <section className="exercise-block mint"><header><div><h2>{title}</h2><p>Каталог с поиском и вариантами выполнения</p></div><span>{rows.length} упражнений</span></header>
  <div className="exercise-head"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span><span></span></div>
  <div className="exercise-rows">{rows.map((r,i)=><div className="exercise-row-wrap" key={i}><div className="exercise-row">
   <ExercisePicker value={r.exercise} group={group} extra={extraNames} onChange={v=>onChange(kind,i,'exercise',v)}/>
   <input aria-label={`${r.exercise||'Упражнение'}: подходы`} inputMode="numeric" value={r.sets} onChange={e=>onChange(kind,i,'sets',e.target.value)} placeholder="3"/>
   <input aria-label={`${r.exercise||'Упражнение'}: повторения`} inputMode="numeric" value={r.reps} onChange={e=>onChange(kind,i,'reps',e.target.value)} placeholder="10"/>
   <div className="weight-input"><input aria-label={`${r.exercise||'Упражнение'}: вес`} inputMode="decimal" value={r.weight} onChange={e=>onChange(kind,i,'weight',e.target.value)} placeholder="0"/><small>кг</small></div>
   <button className={`exercise-note-button ${r.comment?'has-note':''}`} aria-label="Комментарий" onClick={()=>setOpenComment(openComment===i?null:i)}>▤</button>
  </div>{openComment===i&&<div className="exercise-comment-row"><input value={r.comment||''} onChange={e=>onChange(kind,i,'comment',e.target.value)} placeholder="Комментарий к упражнению"/><button onClick={()=>setOpenComment(null)}>Готово</button></div>}</div>)}</div>
 </section>;
}
