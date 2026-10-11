import test from 'node:test';
import assert from 'node:assert/strict';
import {signedParameters,tokenCipher,summarizeEntries} from '../supabase/functions/fatsecret/oauth.js';
import {createHandler} from '../supabase/functions/fatsecret/handler.js';
const userId='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
test('OAuth signature agrees with published OAuth 1.0 HMAC-SHA1 example',async()=>{
  const p=await signedParameters('GET','http://photos.example.net/photos',{file:'vacation.jpg',size:'original'},'dpf43f3p2l4k3l03','kd94hf93k423kf44',{key:'nnch734d00sl2jdk',secret:'pfkkdhi9sl3r4s00'},'kllo9940pd9333jh',1191242096);
  assert.equal(p.oauth_signature,'tR3+Ty81lMeYAr/Fid0kMTYa/WM=');
});
test('encrypted tokens are user-bound and tamper evident',async()=>{
  const cipher=await tokenCipher('development-only-secret');
  const token={key:'private-token',secret:'private-secret'};
  const data=await cipher.seal(token,userId);
  assert.deepEqual(await cipher.open(data,userId),token);
  assert.ok(!data.includes(token.key));
  await assert.rejects(cipher.open(data,'other-user'));
  await assert.rejects((await tokenCipher('different-secret')).open(data,userId));
});
test('empty and invalid diaries do not become zero intake',()=>{
  assert.equal(summarizeEntries({}).calories,null);
  assert.equal(summarizeEntries({food_entries:{food_entry:{calories:'invalid'}}}).calories,null);
  assert.equal(summarizeEntries({food_entries:{food_entry:[{calories:'100'},{calories:'50.5'}]}}).calories,150.5);
});
function fixture({authUser=userId,providerFailure=false}={}){
  const env={SUPABASE_URL:'https://database.test',SUPABASE_ANON_KEY:'publishable',SUPABASE_SERVICE_ROLE_KEY:'server',FATSECRET_CONSUMER_KEY:'consumer',FATSECRET_CONSUMER_SECRET:'consumer-secret'};
  let connection=null,cache=null,providerCalls=0;
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
  const fetcher=async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user')return authUser?json({id:authUser}):json({},401);
    if(u.hostname==='database.test'){
      const value=options.body?JSON.parse(options.body):null;
      if(u.pathname.endsWith('fatsecret_connections')){
        if(!options.method||options.method==='GET')return json(connection?[connection]:[]);
        if(options.method==='DELETE'){connection=null;return json([]);}
        if(options.method==='PATCH'&&u.searchParams.has('pending_cipher')&&u.searchParams.get('pending_cipher')!==`eq.${connection.pending_cipher}`)return json([]);
        connection={...connection,...value};return json([connection]);
      }
      if(u.pathname.endsWith('fatsecret_diary_cache')){cache=options.method==='DELETE'?null:value;return json(cache?[cache]:[]);}
    }
    providerCalls++;
    if(providerFailure)return new Response('oauth_problem=signature_invalid',{status:401});
    if(u.pathname.endsWith('/request_token'))return new Response('oauth_token=request-token&oauth_token_secret=request-secret&oauth_callback_confirmed=true');
    if(u.pathname.endsWith('/access_token'))return new Response('oauth_token=access-token&oauth_token_secret=access-secret');
    if(u.searchParams.get('method')==='food_entries.get.v2')return json({food_entries:{food_entry:[{calories:'300',protein:'20',fat:'10',carbohydrate:'35'}]}});
    if(u.searchParams.get('method')==='weights.get_month.v2')return json({month:{day:[]}});
    throw new Error('Unexpected URL');
  };
  const handler=createHandler(k=>env[k],fetcher);
  const invoke=(body,authorization='Bearer user-jwt',origin='https://4uvakinvv-hue.github.io')=>handler(new Request('https://function.test',{method:'POST',headers:{Authorization:authorization,Origin:origin},body:JSON.stringify(body)}));
  return {handler,invoke,env,get connection(){return connection;},get cache(){return cache;},get providerCalls(){return providerCalls;}};
}
test('missing authentication, wrong account, and foreign origins cannot call provider',async()=>{
  const f=fixture();assert.equal((await f.invoke({action:'begin'},'')).status,401);
  assert.equal((await f.invoke({action:'begin'},'Bearer jwt','https://evil.test')).status,403);
  const other=fixture({authUser:'someone-else'});assert.equal((await other.invoke({action:'begin'})).status,403);
  assert.equal(f.providerCalls,0);assert.equal(other.providerCalls,0);
});
test('complete flow stores encrypted tokens and produces an expiring fresh report',async()=>{
  const f=fixture();
  assert.equal((await f.invoke({action:'sync'})).status,400);
  const begin=await (await f.invoke({action:'begin'})).json();
  assert.equal(new URL(begin.authorizationUrl).hostname,'authentication.fatsecret.com');
  assert.ok(!JSON.stringify(f.connection).includes('request-secret'));
  assert.equal((await f.invoke({action:'complete',verifier:'not-a-code'})).status,400);
  assert.equal((await f.invoke({action:'complete',verifier:'123456'})).status,200);
  assert.ok(!JSON.stringify(f.connection).includes('access-token'));
  const r=await (await f.invoke({action:'sync'})).json();
  assert.equal(r.snapshot.days.length,14);assert.equal(r.snapshot.days[0].calories,300);
  assert.equal(r.snapshot.days[0].weight,null);assert.equal(r.snapshot.days[0].completeness,'not_confirmed');
  assert.equal(f.cache.user_id,userId);
  assert.ok(Date.parse(f.cache.expires_at)-Date.parse(f.cache.fetched_at)<=23*3600000+1000);
  assert.equal((await f.invoke({action:'sync'})).status,429);
  await f.invoke({action:'disconnect'});assert.equal(f.connection,null);assert.equal(f.cache,null);
});
test('provider failure never leaks raw response or creates a connected account',async()=>{
  const f=fixture({providerFailure:true});const r=await f.invoke({action:'begin'});
  assert.equal(r.status,502);assert.ok(!(await r.text()).includes('signature_invalid'));assert.equal(f.connection,null);
});
test('health reports presence of secrets without returning values',async()=>{
  const f=fixture();const r=await f.handler(new Request('https://function.test'));
  assert.deepEqual(await r.json(),{service:'Forma FatSecret',configured:true});
});
