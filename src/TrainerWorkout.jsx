import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase.js';
import {coachCue,restCue,generalNotes} from './coach-presentation.js';
import {draftKey,readDraft,writeDraft,normalizeResults,validateResults,todayMoscow,restoreCoachDraft} from './gym-drafts.js';
export default function TrainerWorkout({userId,onClose,onSave,onSaved}){
 const [plan,setPlan]=useState(null),[data,setData]=useState(null),[date,setDate]=useState(todayMoscow()),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[completed,setCompleted]=useState(false);
 const current=useRef(null),busy=useRef(false);
 const [recommendationsOpen,setRecommendationsOpen]=useState(false),[openComments,setOpenComments]=useState({});
 const pointer=`forma:coach-workout-current:${userId}`;
 useEffect(()=>{let active=true;(async()=>{
  const {data:access,error:accessError}=await supabase.functions.invoke('trainer-access',{body:{action:'status'}});if(accessError||!access?.active)throw new Error('Сначала открой доступ к тренеру через «Заказать тренера».');
  let previous;try{previous=JSON.parse(localStorage.getItem(pointer));}catch{}
  let row;
  if(previous?.key&&readDraft(localStorage,previous.key)){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('id',previous.planId).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('status','published').order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){if(active){setNotice('Следующая тренировка ещё готовится. Здесь появятся упражнения и пояснения тренера.');setLoading(false);}return;}
  const key=draftKey(userId,'coach','plan',row.id),draft=readDraft(localStorage,key),next=restoreCoachDraft(draft,row);
  const r=await supabase.from('sessions').select('id').eq('user_id',userId).eq('coach_plan_id',row.id).eq('confirmed',true).limit(1);if(r.error)throw r.error;
  if(active){setPlan(row);setData(next);current.current={key,data:next};setDate(draft?.date||todayMoscow());setCompleted(!!r.data?.length);setNotice(draft?'Черновик восстановлен.':'Результаты сохраняются автоматически на этом устройстве.');setLoading(false);}
 })().catch(e=>{if(active){setError(e.message||'Не удалось загрузить тренировку.');setLoading(false);}});return()=>{active=false;};},[userId]);
 function persist(next){current.current={...current.current,data:next};setData(next);try{writeDraft(localStorage,current.current.key,next);localStorage.setItem(pointer,JSON.stringify({key:current.current.key,planId:plan.id}));setNotice('Черновик сохранён. В историю попадёт после завершения тренировки.');setError('');}catch{setError('Не удалось сохранить черновик на устройстве. Не закрывай экран до завершения тренировки.');}}
 function update(i,field,value){persist({...current.current.data,date,baseRows:current.current.data.baseRows.map((r,n)=>n===i?{...r,[field]:value}:r)});}
 function updateWishes(value){persist({...current.current.data,date,wishes:value});}
 async function finish(){if(busy.current||completed)return;const snapshot=current.current.data;if(date>todayMoscow()){setError('Результат можно сохранить только за сегодня или прошедшую дату. План уже хранится отдельно.');return;}const invalid=validateResults(snapshot.baseRows);if(invalid){setError(invalid);return;}busy.current=true;setSaving(true);setError('');try{writeDraft(localStorage,current.current.key,{...snapshot,date});await onSave({draftId:snapshot.id,trainerPlanId:plan.id,type:'gym',date,gymGroup:'custom',title:plan.title,baseRows:normalizeResults(snapshot.baseRows.map((r,i)=>i===0?{...r,userWishes:String(snapshot.wishes||'').trim()}:r)),extraRows:[],coachFeedback:String(snapshot.wishes||'').trim()});localStorage.removeItem(current.current.key);localStorage.removeItem(pointer);setCompleted(true);setNotice('Тренировка сохранена.');onSaved?.();}catch(e){setError(e.message||'Не удалось сохранить. Черновик остаётся на устройстве.');}finally{busy.current=false;setSaving(false);}}
 return <main className="sub-screen coach-workout-screen" aria-labelledby="coach-workout-title">
  <div className="screen-back-row coach-screen-header"><button className="back-button" aria-label="Назад" onClick={onClose}>‹</button><strong id="coach-workout-title">Тренировка от тренера</strong></div>
  {loading&&<p>Загружаем тренировку…</p>}{error&&<p className="error-line" role="alert">{error}</p>}
  {plan&&data&&<>
   {plan.notes&&<><button className="coach-recommendations-toggle" aria-expanded={recommendationsOpen} aria-controls="coach-general-notes" onClick={()=>setRecommendationsOpen(v=>!v)}>Общие рекомендации от тренера<span>{recommendationsOpen?'⌃':'⌄'}</span></button>{recommendationsOpen&&<div id="coach-general-notes" className="coach-general-notes">{generalNotes(plan.notes)}</div>}</>}
   <div className="coach-workout-heading"><h2>{plan.title}</h2>{completed?<p className="success-line">Тренировка уже сохранена.</p>:<input type="date" aria-label="Дата выполнения" value={date} disabled={saving} onChange={e=>{setDate(e.target.value);persist({...current.current.data,date:e.target.value});}}/>}</div>
   <p className="coach-saving-hint" role="status">{notice}</p>
   {!completed&&<p className="coach-edit-hint">Нагрузка уже предложена. Поправь цифры по выполнению; «Сохранить» подтвердит результаты.</p>}
   {data.baseRows.map((r,i)=><article className="coach-exercise-card coach-exercise-compact" key={i}>
    <header><span>{i+1}</span><h3>{r.exercise}</h3></header>
    <p className="coach-target">{r.targetSets} × {r.targetReps} · {r.targetWeight==null?'вес подобрать':`${r.targetWeight} кг${r.weightBasis==='per_hand'?' на руку':''}`}{r.targetRir?' · запас '+r.targetRir:''}</p>
    <p className="coach-short-technique">{coachCue(r)}</p>
    <div className="coach-card-info">{restCue(r)&&<small>{restCue(r)}</small>}{r.coachNote&&<details className="coach-technique-details"><summary>Подробнее о технике и нагрузке</summary><p>{r.coachNote}</p></details>}</div>
    {!completed&&<>
     <div className="coach-result-line">
      {[['sets','Подходы','numeric'],['reps','Повторения, ср.','decimal'],['weight',r.weightBasis==='per_hand'?'Кг на руку':'Вес, кг','decimal']].map(([field,label,mode])=><label key={field}><span>{label}</span><input aria-label={`${r.exercise}: ${label}`} inputMode={mode} value={r[field]} disabled={saving} onChange={e=>update(i,field,e.target.value)}/></label>)}
      <button className={`exercise-note-button coach-comment-button ${r.comment?'has-note':''}`} type="button" aria-label={`${r.exercise}: комментарий`} aria-expanded={!!openComments[i]} disabled={saving} onClick={()=>setOpenComments(v=>({...v,[i]:!v[i]}))}>▤</button>
     </div>
     {openComments[i]&&<div className="coach-comment-editor"><textarea aria-label={`${r.exercise}: текст комментария`} value={r.comment||''} disabled={saving} onChange={e=>update(i,'comment',e.target.value)} placeholder="Комментарий, если есть что отметить"/><button type="button" onClick={()=>setOpenComments(v=>({...v,[i]:false}))}>Готово</button></div>}
    </>}
   </article>)}
   {!completed&&<section className="coach-wishes-box" style={{display:"grid",gap:8,margin:"16px 0",padding:14,border:"1px solid #cfd9dd",borderRadius:14}}><label htmlFor="coach-wishes-input">Пожелания к следующей тренировке</label><textarea id="coach-wishes-input" className="coach-wishes-input" style={{width:"100%",minHeight:90,boxSizing:"border-box",padding:10,borderRadius:10,fontSize:15,resize:"vertical"}} aria-label="Пожелания к следующей тренировке" value={data.wishes||''} disabled={saving} onChange={e=>updateWishes(e.target.value)} placeholder="Какие упражнения не понравились? Что хочется заменить или на какие мышцы сделать акцент?" maxLength={1500}/><small>Сохранится вместе с результатами. При отсутствии тревожных симптомов следующий план будет подготовлен автоматически; важные ограничения потребуют дополнительной проверки.</small></section>}
   {!completed&&<div className="coach-save-footer"><button className="gradient-button" disabled={saving} onClick={finish}>{saving?'Сохраняем…':'Сохранить тренировку'}</button></div>}
  </>}
  {!plan&&!loading&&<p role="status">{notice}</p>}
 </main>;
}
