import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase.js';
import {coachCue,restCue,generalNotes} from './coach-presentation.js';
import {draftKey,readDraft,writeDraft,normalizeResults,validateResults,todayMoscow,restoreCoachDraft} from './gym-drafts.js';
export default function TrainerWorkout({userId,onClose,onSave,onSaved}){
 const [plan,setPlan]=useState(null),[data,setData]=useState(null),[date,setDate]=useState(todayMoscow()),[loading,setLoading]=useState(true),[error,setError]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[completed,setCompleted]=useState(false);
 const [intakeNeeded,setIntakeNeeded]=useState(false),[reload,setReload]=useState(0);
 const current=useRef(null),busy=useRef(false);
 const [recommendationsOpen,setRecommendationsOpen]=useState(false),[openComments,setOpenComments]=useState({});
 const pointer=`forma:coach-workout-current:${userId}`;
 useEffect(()=>{let active=true;(async()=>{
  const {data:access,error:accessError}=await supabase.functions.invoke('trainer-access',{body:{action:'status'}});if(accessError||!access?.active)throw new Error('Сначала открой доступ к тренеру через «Заказать тренера».');
  let previous;try{previous=JSON.parse(localStorage.getItem(pointer));}catch{}
  let row;
  if(previous?.key&&readDraft(localStorage,previous.key)){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('id',previous.planId).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){const r=await supabase.from('coach_workout_plans').select('*').eq('user_id',userId).eq('status','published').order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;row=r.data;}
  if(!row){const info=await supabase.from('coach_intakes').select('status').eq('user_id',userId).maybeSingle();if(info.error)throw info.error;if(active){setIntakeNeeded(!info.data);setNotice(info.data?.status==='review'?'Анкета получена. Из-за отмеченных ограничений тренировка требует дополнительной проверки.':info.data?'Анкета получена. Следующая тренировка ещё готовится.':'');setLoading(false);}return;}
  const key=draftKey(userId,'coach','plan',row.id),draft=readDraft(localStorage,key),next=restoreCoachDraft(draft,row);
  const r=await supabase.from('sessions').select('id').eq('user_id',userId).eq('coach_plan_id',row.id).eq('confirmed',true).limit(1);if(r.error)throw r.error;
  if(active){setPlan(row);setData(next);current.current={key,data:next};setDate(draft?.date||todayMoscow());setCompleted(!!r.data?.length);setNotice(draft?'Черновик восстановлен.':'Результаты сохраняются автоматически на этом устройстве.');setLoading(false);}
 })().catch(e=>{if(active){setError(e.message||'Не удалось загрузить тренировку.');setLoading(false);}});return()=>{active=false;};},[userId,reload]);
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
    {r.trainToFailure===true&&<p className="coach-failure-alert" role="note" style={{padding:"12px 14px",borderRadius:10,background:"#fee2e2",color:"#991b1b",fontSize:"1.15rem",fontWeight:900,letterSpacing:".02em"}}>ДО ОТКАЗА — только этот подход/упражнение по указанию тренера!</p>}
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
  {!plan&&!loading&&intakeNeeded&&<CoachIntake userId={userId} onReady={()=>{setLoading(true);setIntakeNeeded(false);setReload(n=>n+1);}}/>}
  {!plan&&!loading&&!!notice&&<p role="status">{notice}</p>}
 </main>;
}


function CoachIntake({userId,onReady}){
 const [age,setAge]=useState(''),[sex,setSex]=useState('unspecified'),[experience,setExperience]=useState('some');
 const [goal,setGoal]=useState('hypertrophy'),[frequency,setFrequency]=useState('3');
 const [limitations,setLimitations]=useState(''),[preferences,setPreferences]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e){
  e.preventDefault();
  const years=Number(age);
  if(!Number.isInteger(years)||years<18||years>100){setError('Укажи возраст от 18 лет.');return;}
  if(!limitations){setError('Отметь ограничения по здоровью.');return;}
  setBusy(true);setError('');
  try{
   const {error:dbError}=await supabase.from('coach_intakes').insert({
    user_id:userId,age_years:years,sex,experience,goal,sessions_per_week:Number(frequency),
    limitations,preferences:preferences.trim().slice(0,1200),
   });
   if(dbError)throw dbError;
   onReady();
  }catch(err){setError(err.code==='23505'?'Анкета уже отправлена. Открой тренировку ещё раз.':err.message||'Не получилось отправить анкету.');}
  finally{setBusy(false);}
 }
 return <form className="coach-intake-form" aria-label="Первичная анкета тренеру" onSubmit={submit} style={{display:'grid',gap:14,padding:'14px 0'}}>
  <h2 style={{margin:0}}>Анкета перед первой тренировкой</h2>
  <p className="soft-text">Один раз ответь на несколько вопросов. После отправки Forma подготовит стартовый план без угаданных рабочих весов.</p>
  <label>Возраст <input type="number" min="18" max="100" required value={age} onChange={e=>setAge(e.target.value)} placeholder="Возраст, лет"/></label>
  <label>Пол <select value={sex} onChange={e=>setSex(e.target.value)}><option value="unspecified">Не указывать</option><option value="female">Женский</option><option value="male">Мужской</option></select></label>
  <label>Опыт <select value={experience} onChange={e=>setExperience(e.target.value)}><option value="beginner">Начинающий</option><option value="some">Занимался раньше, был перерыв</option><option value="experienced">Опытный, тренируюсь регулярно</option></select></label>
  <label>Главная цель <select value={goal} onChange={e=>setGoal(e.target.value)}><option value="hypertrophy">Рост мышц</option><option value="glutes">Ягодицы и ноги</option><option value="strength">Сила</option><option value="fat_loss">Снижение жира с сохранением мышц</option><option value="fitness">Общая физическая форма</option></select></label>
  <label>Тренировок в неделю <select value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option></select></label>
  <fieldset style={{border:"1px solid #aab5bd",borderRadius:12,padding:12}}>
    <legend>Есть травмы, боли или медицинские ограничения?</legend>
    <label style={{display:"block"}}><input type="radio" name="coach-health" checked={limitations==='none'} onChange={()=>setLimitations('none')}/> Нет</label>
    <label style={{display:"block",marginTop:8}}><input type="radio" name="coach-health" checked={limitations==='needs_review'} onChange={()=>setLimitations('needs_review')}/> Да, нужна адаптация плана</label>
    {limitations==='needs_review'&&<p className="soft-text">Анкета сохранится, а план будет ожидать проверки специалистом. Не тренируйся через боль.</p>}
  </fieldset>
  <label>Пожелания (необязательно)<textarea rows={3} maxLength={1200} value={preferences} onChange={e=>setPreferences(e.target.value)} placeholder="Какие мышцы в приоритете, какие упражнения нравятся или не подходят"/></label>
  {error&&<p role="alert" className="error-line">{error}</p>}
  <button type="submit" className="gradient-button" disabled={busy}>{busy?'Отправляем…':'Отправить и подготовить тренировку'}</button>
 </form>;
}
