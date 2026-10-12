import {useEffect,useState} from 'react';
import {supabase} from './supabase.js';
import FatSecretPanel from './FatSecretPanel.jsx';
export default function TrainerModal({onClose}){
 const [state,setState]=useState(null),[members,setMembers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(action,extra={}){
  const {data,error}=await supabase.functions.invoke('trainer-access',{body:{action,...extra}});
  if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||'Не удалось связаться с тренером.');}
  if(data?.error)throw new Error(data.error);return data;
 }
 async function load(){const s=await call('status');setState(s);if(s.owner)setMembers((await call('list')).members);}
 useEffect(()=>{load().catch(e=>setError(e.message));const t=setInterval(()=>load().catch(()=>{}),60000);const key=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',key);return()=>{clearInterval(t);document.removeEventListener('keydown',key);};},[]);
 async function act(action,extra={}){setBusy(true);setError('');try{await call(action,extra);await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const date=v=>v?new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Moscow'}).format(new Date(v)):'';
 return <div className="modal-backdrop trainer-backdrop" onClick={onClose}>
  <section className="trainer-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="trainer-modal-title" onClick={e=>e.stopPropagation()}>
   <header><div><small>Forma</small><h2 id="trainer-modal-title">Твой тренер</h2></div><button aria-label="Закрыть" onClick={onClose}>×</button></header>
   {error&&<p className="error-line" role="alert">{error}</p>}
   {!state&&!error&&<p>Загружаем доступ…</p>}
   {state&&<>
    <p className="soft-text">Тестовый режим: без оплаты. Доступ открывает Василий после заявки.</p>
    {state.active?<>
     <p><b>Доступ открыт</b>{state.access_until?' до '+date(state.access_until):''}.</p>
     <p className="soft-text">Сейчас рекомендации и разбор тренировок ведём в чате с главным тренером. Чат внутри Forma появится после подключения сервиса тренера.</p>
     <FatSecretPanel/>
    </>:<>
     <p>{state.status==='pending'?'Заявка отправлена. Василий увидит её в уведомлениях и откроет доступ.':state.status==='expired'?'Период доступа закончился. Отправь заявку на продление.':'Отправь заявку, чтобы начать работу с тренером.'}</p>
     <button className="gradient-button" disabled={busy||state.status==='pending'} onClick={()=>act('request')}>{state.status==='pending'?'Ожидает решения':'Отправить заявку'}</button>
    </>}
    {!!state.notices?.length&&<div className="trainer-notices">{state.notices.map(n=><p key={n.id}>{n.message}</p>)}</div>}
    {state.owner&&<section className="trainer-admin"><h3>Заявки и доступ участников</h3>
     {!members.length&&<p className="soft-text">Заявок пока нет.</p>}
     {members.map(m=><article key={m.user_id}><b>{m.name}</b><small>{{pending:'Ожидает решения',active:'Доступ открыт',expired:'Период закончился',revoked:'Доступ закрыт'}[m.status]}{m.access_until?' · до '+date(m.access_until):''}</small><div>
      <button className="secondary-dark" disabled={busy} onClick={()=>act('grant',{user_id:m.user_id,days:30})}>{m.status==='active'?'Продлить на 30 дней':'Разрешить на 30 дней'}</button>
      <button className="secondary-dark" disabled={busy} onClick={()=>act('grant',{user_id:m.user_id,days:90})}>На 90 дней</button>
      {m.status==='active'&&<button className="secondary-dark" disabled={busy} onClick={()=>act('revoke',{user_id:m.user_id})}>Закрыть доступ</button>}
     </div></article>)}
    </section>}
   </>}
  </section>
 </div>;
}
