import {useEffect,useState} from 'react';
import {supabase} from './supabase.js';

export default function FatSecretPanel(){
  const [status,setStatus]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [url,setUrl]=useState(''),[verifier,setVerifier]=useState(''),[snapshot,setSnapshot]=useState(null);
  async function request(action,extra={}){
    const {data,error}=await supabase.functions.invoke('fatsecret',{body:{action,...extra}});
    if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||'Не удалось связаться с FatSecret.');}
    if(data?.error)throw new Error(data.error);
    return data;
  }
  useEffect(()=>{let active=true;request('status').then(data=>{if(active)setStatus(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
  async function run(action,extra={}){
    setPending(true);setError('');
    try{
      const data=await request(action,extra);
      if(action==='begin'){setUrl(data.authorizationUrl);setStatus(s=>({...s,pending:true}));}
      if(action==='complete'){setVerifier('');setUrl('');setStatus(s=>({...s,connected:true,pending:false}));}
      if(action==='sync')setSnapshot(data.snapshot);
      if(action==='disconnect'){setSnapshot(null);setUrl('');setVerifier('');setStatus(s=>({...s,connected:false,pending:false}));}
    }catch(e){setError(e.message);}finally{setPending(false);}
  }
  const style={width:'100%',marginTop:10};
  return <section className="glass-card" style={{padding:16,marginTop:14}}>
    <h2 style={{marginTop:0}}>Питание · FatSecret</h2>
    <p className="soft-text">Подключи свой дневник питания и веса. Forma получает данные для тренера; записи в FatSecret не изменяет.</p>
    {status?.connected?<>
      <p>Аккаунт подключён.</p>
      <button className="gradient-button" style={style} disabled={pending} onClick={()=>run('sync')}>{pending?'Загружаем дневник…':'Загрузить последние 14 дней'}</button>
      <button className="secondary-dark" style={style} disabled={pending} onClick={()=>run('disconnect')}>Отключить от Forma</button>
    </>:<>
      <button className="gradient-button" style={style} disabled={pending||!status?.configured} onClick={()=>run('begin')}>{pending?'Подготавливаем подключение…':'Подключить FatSecret'}</button>
      {status&&!status.configured&&<p className="soft-text">Реквизиты подключения ещё не настроены на сервере.</p>}
      {url&&<p><a href={url} target="_blank" rel="noopener noreferrer" style={{color:'var(--mint)'}}>Открыть FatSecret и разрешить доступ</a></p>}
      {(url||status?.pending)&&<form onSubmit={e=>{e.preventDefault();run('complete',{verifier});}} style={{marginTop:12}}>
        <label className="dark-field"><span>Код, показанный FatSecret после разрешения доступа</span>
          <input type="password" inputMode="numeric" autoComplete="one-time-code" value={verifier} onChange={e=>setVerifier(e.target.value)} disabled={pending}/>
        </label>
        <button className="secondary-dark" style={style} disabled={pending||!verifier.trim()}>Завершить подключение</button>
      </form>}
    </>}
    {error&&<p className="error-line" role="alert">{error}</p>}
    {snapshot&&<div style={{marginTop:16,overflowX:'auto'}}>
      <p>Загружено: {snapshot.from} — {snapshot.to}. Можно попросить главного тренера разобрать дневник в чате.</p>
      <p className="soft-text">Пустой день не означает нулевое питание. Полноту заполнения нужно подтвердить.</p>
      <table style={{width:'100%',fontSize:11,borderSpacing:6}}><thead><tr>{['Дата','Ккал','Б','Ж','У','Вес'].map(x=><th key={x}>{x}</th>)}</tr></thead>
        <tbody>{snapshot.days.map(d=><tr key={d.date}><td>{d.date.slice(5)}</td>{['calories','protein','fat','carbohydrate','weight'].map(k=><td key={k}>{d[k]??'—'}</td>)}</tr>)}</tbody>
      </table>
    </div>}
    <p style={{fontSize:11,marginBottom:0}}><a href="https://platform.fatsecret.com">Powered by fatsecret Platform API</a></p>
  </section>;
}
