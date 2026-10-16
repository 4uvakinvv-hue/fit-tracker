import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminUsersHandler} from '../supabase/functions/admin-users/handler.js';

const owner='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
const member='33333333-3333-4333-8333-333333333333';

function fixture(user=owner){
  const calls=[];
  const env=k=>({SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'})[k];
  const fetcher=async(url,opts={})=>{
    calls.push({url,opts});
    if(url.endsWith('/auth/v1/user'))return Response.json({id:user,email:'owner@example.test'});
    if(url.includes('/auth/v1/admin/users?'))return Response.json({users:[
      {id:owner,email:'owner@example.test',created_at:'2026-01-01T00:00:00Z',email_confirmed_at:'2026-01-01T00:01:00Z',last_sign_in_at:'2026-01-02T00:00:00Z',user_metadata:{name:'Boss'}},
      {id:member,email:'member@example.test',created_at:'2026-01-03T00:00:00Z',email_confirmed_at:null,last_sign_in_at:null,user_metadata:{name:'Member'}}
    ]});
    if(url.includes('/rest/v1/profiles?'))return Response.json([{id:member,name:'Ксюша',joined_at:'2026-01-03'}]);
    if(url.endsWith('/auth/v1/admin/users/'+member)&&opts.method==='DELETE')return new Response(null,{status:204});
    return new Response('not found',{status:404});
  };
  const handler=createAdminUsersHandler(env,fetcher);
  return {calls,run:(body,auth='Bearer jwt',origin='https://4uvakinvv-hue.github.io')=>handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:auth,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}

test('non-owner cannot list or delete auth users',async()=>{
  const f=fixture(member);
  assert.equal((await f.run({action:'list'})).status,403);
  assert.equal((await f.run({action:'delete',user_id:member})).status,403);
});

test('owner lists sanitized users including email confirmation status',async()=>{
  const f=fixture();
  const res=await f.run({action:'list'}),body=await res.json();
  assert.equal(res.status,200);
  assert.equal(body.users.length,2);
  const user=body.users.find(x=>x.id===member);
  assert.equal(user.email,'member@example.test');
  assert.equal(user.name,'Ксюша');
  assert.equal(user.email_confirmed_at,null);
});

test('owner can delete another user but never self',async()=>{
  const f=fixture();
  assert.equal((await f.run({action:'delete',user_id:member})).status,200);
  assert.equal((await f.run({action:'delete',user_id:owner})).status,400);
});
