const OWNER='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
const origins=new Set(['https://4uvakinvv-hue.github.io','http://localhost','https://localhost','capacitor://localhost']);
export function createTrainerHandler(env,fetcher=fetch){return async req=>{
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
  const r=await fetcher(base+'/auth/v1/user',{headers:{Authorization:auth,apikey:env('SUPABASE_ANON_KEY')},signal:AbortSignal.timeout(15000)});
  if(!r.ok)return reply({error:'Сессия истекла. Войди повторно.'},401);
  const user=await r.json(),raw=await req.text();
  if(raw.length>4096)return reply({error:'Слишком большой запрос.'},413);
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
  if(!['status','request','list','grant','revoke'].includes(body.action))return reply({error:'Неизвестное действие.'},400);
  if(['list','grant','revoke'].includes(body.action)&&user.id!==OWNER)return reply({error:'Только администратор может управлять доступом.'},403);
  if(['grant','revoke'].includes(body.action)&&(!/^[0-9a-f-]{36}$/i.test(body.user_id||'')||body.user_id===OWNER))return reply({error:'Некорректный участник.'},400);
  if(body.action==='grant'&&![30,90].includes(body.days))return reply({error:'Выбери 30 или 90 дней.'},400);
  const result=await fetcher(base+'/rest/v1/rpc/coach_action',{method:'POST',headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json'},body:JSON.stringify({p_action:body.action,p_user:user.id,p_target:body.user_id||null,p_days:body.days||30,p_email:user.email||null}),signal:AbortSignal.timeout(15000)});
  if(!result.ok)return reply({error:'Не удалось изменить доступ. Попробуй позже.'},502);
  return reply(await result.json());
 }catch{return reply({error:'Сервис тренера временно недоступен.'},502);}
};}
