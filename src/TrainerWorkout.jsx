import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase.js';
import {draftKey,readDraft,writeDraft,normalizeResults,validateResults,todayMoscow,initialWorkout} from './gym-drafts.js';
export default function TrainerWorkout({userId,onClose,onSave}){
 const [plan,setPlan]=useState(null),[data,setData]=useState(null),[date,setDate]=useState(todayMoscow()),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[completed,setCompleted]=useState(false);
 const current=useRef(null),busy=useRef(false);
 const pointer=`forma:coach-workout-current:${userId}`;
 useEffect(()=>{let active=true;(async()=>{
  const {data:access,error:accessError}=await supabase.functions.invoke('trainer-access',{body:{action:'status'}});if(accessError||!access?.active)throw new Error('Сначала открой доступ к тренеру через «Заказать тренера».');
  let previous;try{previous=JSON.parse(localStorage.getItem(pointer));}catch{}
  let row;
  if(previous?.key&&readDraft(localStorage,previous.key)){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('id',previous.planId).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('status','published').order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){if(active){setNotice('Следующая тренировка ещё готовится. Здесь появятся упражнения и пояснения тренера.');setLoading(false);}return;}
  const key=draftKey(userId,'coach','plan',row.id),draft=readDraft(localStorage,key),next=draft||initialWorkout(row);
  const r=await supabase.from('sessions').select('id').eq('user_id',userId).eq('coach_plan_id',row.id).eq('confirmed',true).limit(1);if(r.error)throw r.error;
  if(active){setPlan(row);setData(next);current.current={key,data:next};setDate(draft?.date||todayMoscow());setCompleted(!!r.data?.length);setNotice(draft?'Черновик восстановлен.':'Результаты сохраняются автоматически на этом устройстве.');setLoading(false);}
 })().catch(e=>{if(active){setError(e.message||'Не удалось загрузить тренировку.');setLoading(false);}});return()=>{active=false;};},[userId]);
 function persist(next){current.current={...current.current,data:next};setData(next);try{writeDraft(localStorage,current.current.key,next);localStorage.setItem(pointer,JSON.stringify({key:current.current.key,planId:plan.id}));setNotice('Черновик сохранён. В историю попадёт после завершения тренировки.');setError('');}catch{setError('Не удалось сохранить черновик на устройстве. Не закрывай экран до завершения тренировки.');}}
 function update(i,field,value){persist({...current.current.data,date,baseRows:current.current.data.baseRows.map((r,n)=>n===i?{...r,[field]:value}:r)});}
 async function finish(){if(busy.current||completed)return;const snapshot=current.current.data;if(date>todayMoscow()){setError('Результат можно сохранить только за сегодня или прошедшую дату. План уже хранится отдельно.');return;}const invalid=validateResults(snapshot.baseRows);if(invalid){setError(invalid);return;}busy.current=true;setSaving(true);setError('');try{writeDraft(localStorage,current.current.key,{...snapshot,date});await onSave({draftId:snapshot.id,trainerPlanId:plan.id,type:'gym',date,gymGroup:'custom',title:plan.title,baseRows:normalizeResults(snapshot.baseRows),extraRows:[]});localStorage.removeItem(current.current.key);localStorage.removeItem(pointer);onClose();}catch(e){setError(e.message||'Не удалось сохранить. Черновик остаётся на устройстве.');}finally{busy.current=false;setSaving(false);}}
 return <div className="modal-backdrop trainer-backdrop" onClick={onClose}><section className="trainer-modal coach-workout-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="coach-workout-title" onClick={e=>e.stopPropagation()}><header><div><small>Forma</small><h2 id="coach-workout-title">Тренировка от тренера</h2></div><button aria-label="Закрыть тренировку" onClick={onClose}>×</button></header>
  {loading&&<p>Загружаем тренировку…</p>}{error&&<p className="error-line" role="alert">{error}</p>}
  <p className="gym-draft-status" role="status">{notice}</p>
  {plan&&data&&<><h3>{plan.title}</h3>{plan.notes&&<p className="coach-plan-notes">{plan.notes}</p>}{completed?<p className="success-line">Эта тренировка уже сохранена. Новое назначение появится после подготовки тренером.</p>:<label className="dark-field"><span>Дата выполнения</span><input type="date" value={date} disabled={saving} onChange={e=>{setDate(e.target.value);persist({...current.current.data,date:e.target.value});}}/></label>}
   {data.baseRows.map((r,i)=><article className="coach-exercise-card" key={i}><header><span>{i+1}</span><h3>{r.exercise}</h3></header>
    <p className="coach-target">Назначено: {r.targetSets} подхода · {r.targetReps} повторений · {r.targetWeight} кг{r.weightBasis==='per_hand'?' на руку':''}{r.targetRir?' · запас '+r.targetRir+' повторения':''}</p>
    {r.coachNote&&<p className="coach-technique">{r.coachNote}</p>}
    {!completed&&<><div className="coach-result-fields">{[['sets','Подходы','numeric'],['reps','Повторения','numeric'],['weight',r.weightBasis==='per_hand'?'Кг на руку':'Вес, кг','decimal']].map(([field,label,mode])=><label key={field}><span>{label}</span><input aria-label={`${r.exercise}: ${label}`} inputMode={mode} value={r[field]} disabled={saving} placeholder="Факт" onChange={e=>update(i,field,e.target.value)}/></label>)}</div>
     <fieldset className="coach-rir-fields"><legend>Повторения в запасе (RIR) по подходам — если можешь оценить</legend>{Array.from({length:Math.min(20,Math.max(1,Number(r.sets)||Number(r.targetSets)||1))},(_,n)=><label key={n}><span>Подход {n+1}</span><input inputMode="numeric" aria-label={`${r.exercise}: запас в подходе ${n+1}`} value={r.setRir?.[n]||''} disabled={saving} placeholder="Неизвестно" onChange={e=>{const values=[...(r.setRir||[])];values[n]=e.target.value;update(i,'setRir',values);}}/></label>)}</fieldset>
     <label className="dark-field"><span>Твои ощущения и комментарий</span><textarea value={r.comment||''} disabled={saving} onChange={e=>update(i,'comment',e.target.value)} placeholder="Если всё нормально, можно оставить пустым"/></label></>}
   </article>)}
   {!completed&&<button className="gradient-button save-training" disabled={saving} onClick={finish}>{saving?'Сохраняем…':'Сохранить тренировку'}</button>}
  </>}
 </section></div>;
}
