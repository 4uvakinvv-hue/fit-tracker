import {useEffect,useRef,useState} from 'react';
import ExercisePicker from './ExercisePicker.jsx';
import {exerciseTechnique} from './exercise-technique.js';
import {supersetGroup,restCue} from './coach-presentation.js';
import {supabase} from './supabase.js';
import {bodyweightMode} from './coach-volume.js';
import {GROUPS,normalizedRows,manualDraft,writeDraft,normalizeResults,validateResults,tonnage,todayMoscow,workoutBlocks,exerciseApproaches,setManualGroup} from './gym-drafts.js';
function selection(user){try{return JSON.parse(localStorage.getItem(`forma:gym-selection:${user}`))||{};}catch{return {};}}
export default function GymTraining({userId,sessions,gymTemplates,onSaveTemplate,onApplySplit,onBack,onHistory,onSave,onTrainerRequest,onTrainerWorkout}){
 const [group,setGroup]=useState(()=>GROUPS.some(g=>g.id===selection(userId).group)?selection(userId).group:'chest');
 const [coachAccess,setCoachAccess]=useState('checking');
 const [coachMessage,setCoachMessage]=useState('');
 const [expanded,setExpanded]=useState(false);
 const template=gymTemplates[group];
 function load(){
  const {key,draft}=manualDraft(localStorage,userId,group,todayMoscow());
  const fresh=template?.extraRows?.length
   ? {baseRows:normalizedRows(template.baseRows,3),extraRows:normalizedRows(template.extraRows,5)}
   : {baseRows:normalizedRows(template?.baseRows,8),extraRows:[]};
  const data=draft?{...draft,startedAt:draft.startedAt??draft.updatedAt}:{
   id:crypto.randomUUID(),startedAt:new Date().toISOString(),...fresh,
  };
  return {key,data,draft:!!draft};
 }
 const [entry,setEntry]=useState(load);
 const {key,data}=entry;
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(entry.draft?'Черновик восстановлен':'Изменения сохраняются автоматически');
 const current=useRef(entry),savingRef=useRef(false);
 const extraNames=[...sessions.flatMap(s=>[...(s.baseRows||[]),...(s.extraRows||[])]),...Object.values(gymTemplates).flatMap(t=>[...(t.baseRows||[]),...(t.extraRows||[])])].map(r=>r.exercise).filter(Boolean);
 useEffect(()=>{let active=true;const check=async()=>{try{const {data,error}=await supabase.functions.invoke('trainer-access',{body:{action:'status'}});if(active)setCoachAccess(error?'error':data?.active?'active':'inactive');}catch{if(active)setCoachAccess('error');}};check();const onFocus=()=>check();window.addEventListener('focus',onFocus);return()=>{active=false;window.removeEventListener('focus',onFocus);};},[userId]);
 function openCoach(){if(coachAccess==='active'){setCoachMessage('');onTrainerWorkout();return;}if(coachAccess==='checking'||coachAccess==='error'){setCoachMessage('Не удалось проверить подписку. Проверь соединение и открой страницу ещё раз.');return;}setCoachMessage('Чтобы получить тренировку от тренера, оформите подписку через кнопку «Заказать тренера».');}
 useEffect(()=>{
  const next=load();
  current.current=next;
  setEntry(next);setError('');
  setNotice(next.draft?'Черновик восстановлен':'Изменения сохраняются автоматически');
 },[group,template]);
 function update(kind,index,field,value){
  if(savingRef.current)return;
  const previous=current.current.data;
  const next={...previous,[kind]:previous[kind].map((row,i)=>{
   if(i!==index)return row;
   if(field==='exercise'&&value!==row.exercise){
    const {weightBasis,bodyWeight,...remaining}=row;
    return {...remaining,exercise:value};
   }
   return {...row,[field]:value};
  })};
  const updated={key,data:next,draft:true};
  current.current=updated;setEntry(updated);
  try{
   writeDraft(localStorage,key,next);
   setManualGroup(localStorage,userId,group);
   setNotice('Черновик сохранён на этом устройстве');setError('');
  }catch{setError('Не удалось сохранить черновик на устройстве. Не закрывай экран до сохранения тренировки.');}
 }
 function changeGroup(id){
  setGroup(id);
  setManualGroup(localStorage,userId,id);
 }
 async function save(){if(savingRef.current)return;const snapshot=current.current.data,saveKey=current.current.key;const rows=[...snapshot.baseRows,...snapshot.extraRows];if(!rows.some(r=>r.exercise)){setError('Выбери хотя бы одно упражнение.');return;}if(workoutBlocks(rows).length>8){setError('Можно сохранить не более 8 блоков. Соседние упражнения суперсета считаются одним блоком.');return;}const invalid=validateResults(rows);if(invalid){setError(invalid);return;}if(rows.some(r=>r.exercise&&bodyweightMode(r.exercise)!=='external'&&!(Number(String(r.bodyWeight??'').replace(',','.'))>0))){setError('Укажи собственный вес для подтягиваний, брусьев и гравитрона.');return;}const executionDate=snapshot.executionDate??todayMoscow();savingRef.current=true;setSaving(true);setError('');try{
   // Persist the same ID before the first request, so a retry cannot duplicate a session.
   const keepTemplate=snapshot.keepTemplate??(Date.parse(template?.updatedAt)>Date.parse(snapshot.startedAt));
   const persisted={...snapshot,executionDate,keepTemplate};
   current.current={...current.current,data:persisted};
   writeDraft(localStorage,saveKey,persisted);
   const baseRows=normalizeResults(snapshot.baseRows),extraRows=normalizeResults(snapshot.extraRows);
   // A completed draft must not replace a program loaded after the draft started.
   if(!keepTemplate)await onSaveTemplate(group,baseRows,extraRows);

   await onSave({draftId:snapshot.id,type:'gym',date:executionDate,gymGroup:group,baseRows,extraRows,title:GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
   localStorage.removeItem(saveKey);setNotice('Тренировка сохранена');
  }catch(e){setError(e.message||'Не удалось сохранить тренировку. Черновик остаётся на устройстве.');}finally{savingRef.current=false;setSaving(false);}}
 const indexedRows=[...data.baseRows.map((r,index)=>({...r,sourceKind:'baseRows',sourceIndex:index})),...data.extraRows.map((r,index)=>({...r,sourceKind:'extraRows',sourceIndex:index}))];
 const blocks=workoutBlocks(indexedRows);
 const visibleRows=[...blocks.slice(0,8).flat(),...indexedRows.filter(r=>!String(r.exercise||'').trim()).slice(0,Math.max(0,8-blocks.length))];
 const overflowRows=blocks.slice(8).flat();
 const total=Math.round(tonnage([...data.baseRows,...data.extraRows])).toLocaleString('ru-RU');
 return <main className="sub-screen gym-screen"><div className="gym-wordmark"><i aria-hidden="true"/>FORMA</div><div className="screen-back-row"><button className="back-button" onClick={onBack}>‹</button><strong>Тренировка</strong></div>
  <section className="gym-coach-top" style={{display:'grid',gap:8,margin:'12px 0 18px'}}><button type="button" className="gradient-button coach-workout-entry" style={{width:'100%',minHeight:52,fontSize:16,fontWeight:800}} onClick={openCoach}>Тренировка от тренера <b>›</b></button>{coachAccess==='active'&&<small>Подписка активна — твой индивидуальный план доступен</small>}{coachAccess==='checking'&&<small>Проверяем доступ к тренеру…</small>}{coachMessage&&<p role="status" className="soft-text">{coachMessage}</p>}</section>
  <p className="gym-draft-status" role="status">{notice}. В историю попадёт только после сохранения тренировки.</p>
  <div className="gym-monthly-buttons">
   <button type="button" className="secondary-dark" disabled={saving} onClick={()=>onApplySplit(2)}>Сплит месяца · 2 дня</button>
   <button type="button" className="secondary-dark" disabled={saving} onClick={()=>onApplySplit(3)}>Сплит месяца · 3 дня</button>
  </div>
  <div className="gym-tabs">{GROUPS.map((g,index)=><button key={g.id} className={group===g.id?'active':''} aria-pressed={group===g.id} disabled={saving} onClick={()=>changeGroup(g.id)}>Тренировка {index+1}</button>)}</div>
  <div className="gym-view-summary">
   <label className="gym-expanded-toggle">По подходам <input type="checkbox" role="switch" checked={expanded} onChange={event=>setExpanded(event.target.checked)}/></label>
   <div className="gym-volume">Тоннаж · <strong>{total} кг</strong></div>
  </div>
  <ExerciseBlock title="Тренировка целиком" rows={visibleRows} group="all" kind="baseRows" onChange={update} extraNames={extraNames} expanded={expanded} onExpand={()=>setExpanded(true)}/>
  {overflowRows.length>0&&<details className="forma-legacy-overflow"><summary>В шаблоне больше 8 блоков · открой, чтобы изменить состав</summary><ExerciseBlock title="Дополнительные упражнения старого шаблона" rows={overflowRows} group="all" kind="baseRows" onChange={update} extraNames={extraNames} expanded={expanded} onExpand={()=>setExpanded(true)}/></details>}
  {error&&<p className="error-line" role="alert">{error}</p>}
  <div className="gym-coach-actions"><button className="gym-quiet-link" onClick={onTrainerRequest}>Заказать тренера</button></div>
  <button className="gym-history-link" onClick={onHistory}>Предыдущие тренировки<span>›</span></button>
  <div className="gym-save-bar"><button className="gradient-button save-training gym-save-primary" onClick={save} disabled={saving}>{saving?'Сохраняем…':'Сохранить тренировку'}</button></div>
 </main>;
}
function ExerciseBlock({title,rows,group,kind,onChange,extraNames,expanded,onExpand}){
 const [openComment,setOpenComment]=useState(null);
 return <section className="gym-exercise-list" aria-label={title}>
  <div className="exercise-rows">{rows.map((r,i)=>{const pair=supersetGroup(rows,i);
   const setField=(field,value)=>onChange(r.sourceKind||kind,r.sourceIndex??i,field,value);
   const detail=r.exercise&&expanded;
   const approaches=exerciseApproaches(r);
   const replaceApproaches=next=>setField('approaches',next);
   const weightLabel=bodyweightMode(r.exercise)==='assisted'?'помощь':bodyweightMode(r.exercise)==='bodyweight'?'отягощение':'вес';
   return <article className="exercise-row-wrap gym-exercise-card" key={`${r.sourceKind??kind}:${r.sourceIndex??i}`}>
    <div className="gym-exercise-heading">
     <ExercisePicker value={r.exercise} group={group} extra={extraNames} onChange={value=>setField('exercise',value)}/>
     {r.exercise&&<button type="button" className={`exercise-note-button ${r.comment?'has-note':''}`} aria-label="Комментарий" aria-expanded={openComment===i} onClick={()=>setOpenComment(openComment===i?null:i)}>▤</button>}
    </div>
    {r.exercise&&(detail||Array.isArray(r.approaches)
     ? detail?<span className="gym-set-count">{approaches.length} подх.</span>:<button type="button" className="gym-approaches-summary" onClick={onExpand}>{approaches.length} подх. · по подходам ›</button>
     : <div className="gym-metrics">
       <Metric field="sets" label="Подходы" ariaLabel={`${r.exercise}: подходы`} value={r.sets} onChange={setField}/>
       <Metric field="reps" label="Повторы" ariaLabel={`${r.exercise}: повторения`} value={r.reps} onChange={setField}/>
       <Metric field="weight" label={weightLabel==='вес'?'Вес, кг':weightLabel==='помощь'?'Помощь, кг':'Отягощение, кг'} ariaLabel={`${r.exercise}: ${weightLabel}`} value={r.weight} onChange={setField}/>
      </div>)}
   {detail&&<div className="gym-approaches">
    {approaches.map((approach,index)=><div className="gym-approach" key={index}>
     <span>№ {index+1}</span>
     {[['reps','повт.'],['weight',weightLabel+' · кг']].map(([field,label])=><label key={field}>{label}<input inputMode="decimal" aria-label={`${r.exercise}: подход ${index+1}, ${label}`} value={approach[field]} onChange={event=>replaceApproaches(approaches.map((item,i)=>i===index?{...item,[field]:event.target.value}:item))}/></label>)}
     <button type="button" aria-label={`Удалить подход ${index+1}`} onClick={()=>replaceApproaches(approaches.filter((_,i)=>i!==index))}>−</button>
    </div>)}
    <button type="button" className="secondary-dark" disabled={approaches.length>=50} onClick={()=>replaceApproaches([...approaches,{reps:'',weight:''}])}>Добавить подход</button>
   </div>}
   {r.exercise&&bodyweightMode(r.exercise)!=='external'&&<label className="gym-bodyweight">Собственный вес, кг <input inputMode="decimal" value={r.bodyWeight??''} onChange={event=>setField('bodyWeight',event.target.value)}/></label>}
   {pair&&<small className="coach-superset-badge">Суперсет {pair.label} · {pair.position}/{pair.size}{pair.last?` · ${restCue(r)||'Отдых после пары'}`:' · Без отдыха → следующее упражнение'}</small>}{openComment===i&&<div className="exercise-comment-row"><input value={r.comment||''} onChange={e=>onChange(r.sourceKind||kind,r.sourceIndex??i,'comment',e.target.value)} placeholder="Комментарий к упражнению"/><button onClick={()=>setOpenComment(null)}>Готово</button></div>}{r.exercise&&<Technique key={r.exercise} exercise={r.exercise}/>}</article>})}</div>
 </section>;
}

function Metric({field,label,ariaLabel,value,onChange}){
 return <label className="gym-metric">
  <span>{label}</span>
  <input aria-label={ariaLabel} inputMode={field==='sets'?'numeric':'decimal'} value={value??''} onChange={event=>onChange(field,event.target.value)} placeholder="—"/>
 </label>;
}

function Technique({exercise}){
 const {what,how,tips}=exerciseTechnique(exercise);
 return <details className="gym-technique">
  <summary>Техника выполнения</summary>
  <dl>
   <dt>Что делать</dt><dd>{what}</dd>
   <dt>Нюансы техники</dt><dd>{how}</dd>
   <dt>Акценты</dt><dd>{tips}</dd>
  </dl>
 </details>;
}
