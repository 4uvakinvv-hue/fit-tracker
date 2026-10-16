const OWNER='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
const origins=new Set(['https://4uvakinvv-hue.github.io','http://localhost','https://localhost','capacitor://localhost']);

function authHeaders(env){
  const key=env('SUPABASE_SERVICE_ROLE_KEY');
  return {apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
}

export function createAdminUsersHandler(env,fetcher=fetch){return async req=>{
  const origin=req.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&origins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.has(origin))return reply({error:'Адрес приложения не разрешён.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Метод не поддерживается.'},405);
  try{
    const auth=req.headers.get('Authorization')||'';
    if(!/^Bearer \S+$/.test(auth))return reply({error:'Войди в Forma.'},401);
    const base=env('SUPABASE_URL');
    const meRes=await fetcher(base+'/auth/v1/user',{headers:{Authorization:auth,apikey:env('SUPABASE_ANON_KEY')},signal:AbortSignal.timeout(15000)});
    if(!meRes.ok)return reply({error:'Сессия истекла. Войди повторно.'},401);
    const me=await meRes.json();
    if(me.id!==OWNER)return reply({error:'Только администратор может управлять пользователями.'},403);
    const raw=await req.text();let body={action:'list'};
    if(raw){try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}}
    if(!['list','delete'].includes(body.action))return reply({error:'Неизвестное действие.'},400);

    if(body.action==='delete'){
      const id=String(body.user_id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id)||id===OWNER)return reply({error:'Этот аккаунт удалить нельзя.'},400);
      const del=await fetcher(base+'/auth/v1/admin/users/'+id,{method:'DELETE',headers:authHeaders(env),signal:AbortSignal.timeout(15000)});
      if(!del.ok){
        const details=await del.text().catch(()=> '');
        console.warn('admin-users delete failed',del.status,details.slice(0,300));
        return reply({error:'Не удалось удалить пользователя. Возможно, у аккаунта есть связанные данные, которые мешают удалению.'},502);
      }
      return reply({ok:true});
    }

    const [usersRes,profilesRes]=await Promise.all([
      fetcher(base+'/auth/v1/admin/users?page=1&per_page=1000',{headers:authHeaders(env),signal:AbortSignal.timeout(15000)}),
      fetcher(base+'/rest/v1/profiles?select=id,name,joined_at',{headers:authHeaders(env),signal:AbortSignal.timeout(15000)})
    ]);
    if(!usersRes.ok)return reply({error:'Не удалось загрузить пользователей.'},502);
    const usersJson=await usersRes.json(),profiles=profilesRes.ok?await profilesRes.json():[];
    const names=new Map((profiles||[]).map(p=>[p.id,p]));
    const users=(usersJson.users||usersJson||[]).map(u=>({
      id:u.id,
      email:u.email||'',
      name:names.get(u.id)?.name||u.user_metadata?.name||'',
      created_at:u.created_at||null,
      email_confirmed_at:u.email_confirmed_at||u.confirmed_at||null,
      last_sign_in_at:u.last_sign_in_at||null,
      is_owner:u.id===OWNER
    })).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    return reply({users});
  }catch(err){
    console.error('admin-users failed',err);
    return reply({error:'Сервис управления пользователями временно недоступен.'},502);
  }
};}
