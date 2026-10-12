import {signedParameters,tokenCipher,asArray,summarizeEntries} from './oauth.js';
const PROVIDER='https://authentication.fatsecret.com';
const API='https://platform.fatsecret.com/rest/server.api';
const ALLOWED_USER='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
const ORIGINS=new Set(['https://4uvakinvv-hue.github.io','http://localhost','https://localhost','capacitor://localhost']);
export function createHandler(env,fetcher=fetch) {
  const envValue=k=>env(k)||'';
  const configured=()=>!!(envValue('FATSECRET_CONSUMER_KEY')&&envValue('FATSECRET_CONSUMER_SECRET'));
  return async req=>{
    const origin=req.headers.get('Origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin&&ORIGINS.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, GET, OPTIONS'});
    const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin&&!ORIGINS.has(origin))return reply({error:'Этот адрес приложения не разрешён.'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method==='GET')return reply({service:'Forma FatSecret',configured:configured()});
    if(req.method!=='POST')return reply({error:'Метод не поддерживается.'},405);
    let syncUser=null;
    try {
      const base=envValue('SUPABASE_URL');
      const text=await req.text();
      if(text.length>4096)return reply({error:'Слишком большой запрос.'},413);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Некорректный запрос.'},400);}
      if(!['status','begin','complete','sync','disconnect'].includes(body.action))return reply({error:'Неизвестное действие.'},400);
      const schedule=req.headers.get('X-Forma-Schedule');
      let user;
      if(schedule){
        if(origin||body.action!=='sync'||!/^[0-9a-f-]{36}$/i.test(body.user_id||''))return reply({error:'Недопустимый запрос планировщика.'},403);
        const claim=await fetcher(`${base}/rest/v1/rpc/claim_fatsecret_sync`,{method:'POST',headers:{apikey:envValue('SUPABASE_SERVICE_ROLE_KEY'),Authorization:`Bearer ${envValue('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({p_secret:schedule,p_user:body.user_id}),signal:AbortSignal.timeout(15000)});
        if(!claim.ok||await claim.json()!==true)return reply({skipped:true},403);
        user={id:body.user_id};
      }else{
        const auth=req.headers.get('Authorization')||'';
        if(!/^Bearer \S+$/.test(auth))return reply({error:'Войди в Forma.'},401);
        const authResult=await fetcher(`${base}/auth/v1/user`,{headers:{Authorization:auth,apikey:envValue('SUPABASE_ANON_KEY')},signal:AbortSignal.timeout(15000)});
        if(!authResult.ok)return reply({error:'Сессия истекла. Войди в Forma повторно.'},401);
        user=await authResult.json();
      }
      const db=async(path,method='GET',data)=>{
        const r=await fetcher(`${base}/rest/v1/${path}`,{method,headers:{apikey:envValue('SUPABASE_SERVICE_ROLE_KEY'),Authorization:`Bearer ${envValue('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
        if(!r.ok)throw new Error('Не удалось сохранить подключение. Попробуй позже.');
        return r.status===204?null:await r.json();
      };
      if(user.id!==ALLOWED_USER&&body.action!=='disconnect'){
        const access=await db(`coach_memberships?user_id=eq.${user.id}&select=status,access_until`);
        if(!access[0]||access[0].status!=='active'||(access[0].access_until&&Date.parse(access[0].access_until)<=Date.now()))return reply({error:'Доступ к тренеру не открыт или закончился.'},403);
      }
      const path=`fatsecret_connections?user_id=eq.${user.id}`;
      const rows=await db(path+'&select=*');const connection=rows[0];
      if(body.action==='status'){
        const cached=await db(`fatsecret_diary_cache?user_id=eq.${user.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload,fetched_at`);
        return reply({configured:configured(),connected:!!connection?.access_cipher,pending:!!connection?.pending_cipher&&Date.parse(connection.pending_expires_at)>Date.now(),lastSyncedAt:connection?.last_synced_at||null,lastError:connection?.last_sync_error||null,snapshot:cached[0]?.payload||null,autoSync:true});
      }
      if(body.action==='disconnect'){
        await db(path,'DELETE');await db(`fatsecret_diary_cache?user_id=eq.${user.id}`,'DELETE');
        return reply({connected:false});
      }
      if(!configured())return reply({error:'Добавь FATSECRET_CONSUMER_KEY и FATSECRET_CONSUMER_SECRET в настройки сервера.'},503);
      const ck=envValue('FATSECRET_CONSUMER_KEY'),cs=envValue('FATSECRET_CONSUMER_SECRET');
      const cipher=await tokenCipher(cs);
      const provider=async(method,url,params,token={},isToken=false)=>{
        const signed=await signedParameters(method,url,params,ck,cs,token);
        const query=new URLSearchParams(signed);
        const r=await fetcher(method==='GET'?`${url}?${query}`:url,{method,headers:method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:undefined,body:method==='POST'?query.toString():undefined,signal:AbortSignal.timeout(15000)});
        const content=await r.text();
        if(isToken){
          const p=new URLSearchParams(content);
          if(!r.ok||!p.get('oauth_token')||!p.get('oauth_token_secret'))throw new Error('FatSecret не разрешил авторизацию. Проверь ключи OAuth 1.0 и доступ приложения к 3-legged OAuth.');
          return {key:p.get('oauth_token'),secret:p.get('oauth_token_secret')};
        }
        let data;try{data=JSON.parse(content);}catch{throw new Error('FatSecret вернул неожиданный ответ. Попробуй позже.');}
        if(!r.ok||data.error){const code=String(data.error?.code||r.status);throw new Error(`FatSecret: ошибка ${code}. Проверь доступ к личному дневнику; при ошибке 9 подключи аккаунт повторно.`);}
        return data;
      };
      if(body.action==='begin'){
        const token=await provider('POST',`${PROVIDER}/oauth/request_token`,{oauth_callback:'oob'},{},true);
        await db('fatsecret_connections?on_conflict=user_id','POST',{user_id:user.id,pending_cipher:await cipher.seal(token,user.id),pending_expires_at:new Date(Date.now()+15*60000).toISOString()});
        return reply({authorizationUrl:`${PROVIDER}/oauth/authorize?oauth_token=${encodeURIComponent(token.key)}`});
      }
      if(body.action==='complete'){
        if(!connection?.pending_cipher||Date.parse(connection.pending_expires_at)<=Date.now())return reply({error:'Срок подключения истёк. Нажми «Подключить» ещё раз.'},400);
        if(typeof body.verifier!=='string'||!/^\d{3,20}$/.test(body.verifier.trim()))return reply({error:'Введи цифровой код, показанный FatSecret.'},400);
        const pending=await cipher.open(connection.pending_cipher,user.id);
        const token=await provider('GET',`${PROVIDER}/oauth/access_token`,{oauth_verifier:body.verifier.trim()},pending,true);
        // Compare pending ciphertext to avoid replacing a concurrent/newer connection.
        const updated=await db(path+`&pending_cipher=eq.${encodeURIComponent(connection.pending_cipher)}`,'PATCH',{access_cipher:await cipher.seal(token,user.id),pending_cipher:null,pending_expires_at:null,connected_at:new Date().toISOString(),last_synced_at:null,last_sync_error:null});
        if(!updated.length)return reply({error:'Подключение изменилось. Начни заново.'},409);
        await db(`fatsecret_diary_cache?user_id=eq.${user.id}`,'DELETE');
        return reply({connected:true});
      }
      if(!connection?.access_cipher)return reply({error:'Сначала подключи аккаунт FatSecret.'},400);
      if(connection.last_synced_at&&Date.now()-Date.parse(connection.last_synced_at)<60000)return reply({error:'Повторное обновление доступно через минуту.'},429);
      syncUser=user.id;
      const token=await cipher.open(connection.access_cipher,user.id);
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const end=Math.floor(Date.parse(today+'T00:00:00Z')/86400000),start=end-13;
      const days=[];const weights=new Map();
      // Read fresh from FatSecret. No inference that an empty/partial diary means zero intake.
      for(let day=start;day<=end;day++){
        const data=await provider('GET',API,{method:'food_entries.get.v2',format:'json',date:String(day)},token);
        days.push({date:new Date(day*86400000).toISOString().slice(0,10),...summarizeEntries(data)});
      }
      const months=[...new Set(days.map(d=>d.date.slice(0,7)))];
      for(const month of months){
        const day=Math.floor(Date.parse(month+'-01T00:00:00Z')/86400000);
        const data=await provider('GET',API,{method:'weights.get_month.v2',format:'json',date:String(day)},token);
        for(const item of asArray(data.month?.day)){
          const n=Number(item.date_int),weight=Number(item.weight_kg);
          if(n>=start&&n<=end&&Number.isFinite(weight)&&weight>0)weights.set(n,weight);
        }
      }
      const snapshot={source:'FatSecret',from:days[0].date,to:days.at(-1).date,days:days.map((d,i)=>({...d,weight:weights.get(start+i)??null,completeness:'not_confirmed'}))};
      const saved=await db('rpc/save_fatsecret_snapshot','POST',{p_user:user.id,p_cipher:connection.access_cipher,p_payload:snapshot});
      if(saved!==true)return reply({error:'Подключение или доступ изменились. Обнови окно тренера.'},409);
      return reply({snapshot});
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const safe=message.startsWith('FatSecret')||message.startsWith('Не удалось сохранить')?message:'Не удалось выполнить подключение. Попробуй позже.';
      if(syncUser){try{await fetcher(`${envValue('SUPABASE_URL')}/rest/v1/fatsecret_connections?user_id=eq.${syncUser}`,{method:'PATCH',headers:{apikey:envValue('SUPABASE_SERVICE_ROLE_KEY'),Authorization:`Bearer ${envValue('SUPABASE_SERVICE_ROLE_KEY')}`,'Content-Type':'application/json'},body:JSON.stringify({last_sync_error:safe}),signal:AbortSignal.timeout(10000)});}catch{}}
      return reply({error:safe},502);
    }
  };
}
