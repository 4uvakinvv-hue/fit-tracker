import {useState} from 'react';
import {supabase} from './supabase.js';
export default function ProfileName({profile,onChanged}){
  const [name,setName]=useState(profile?.name||'');
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
  const [nextAllowed,setNextAllowed]=useState(profile?.name_changed_at?new Date(new Date(profile.name_changed_at).getTime()+86400000).toISOString():null);
  async function save(e){
    e.preventDefault();if(saving)return;
    setSaving(true);setNotice('');
    try{
      const {data,error}=await supabase.rpc('change_profile_name',{p_name:name});
      if(error)throw error;
      if(!data?.ok){
        if(data?.reason==='cooldown'){setNextAllowed(data.next_allowed_at);setNotice('Имя можно менять один раз в 24 часа.');}
        else setNotice('Не удалось сохранить имя.');
        return;
      }
      setName(data.name);
      setNextAllowed(data.name_changed_at?new Date(new Date(data.name_changed_at).getTime()+86400000).toISOString():null);
      onChanged?.(data);setNotice('Имя сохранено.');
    }catch{setNotice('Не удалось сохранить имя. Проверь подключение и попробуй снова.');}
    finally{setSaving(false);}
  }
  return <section className="profile-name-card glass-card">
    <h2>Моё имя</h2>
    <form onSubmit={save}>
      <label className="dark-field"><span>Имя в Forma и рейтинге</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={60} required disabled={saving} autoComplete="nickname"/></label>
      <small>{nextAllowed&&Date.parse(nextAllowed)>Date.now()?`Следующее изменение: ${new Date(nextAllowed).toLocaleString('ru-RU')}`:'Можно менять один раз в 24 часа.'}</small>
      <button className="secondary-button" disabled={saving||!name.trim()||name.trim()===profile?.name}>{saving?'Сохраняем…':'Сохранить имя'}</button>
      {notice&&<p role="status">{notice}</p>}
    </form>
  </section>;
}
