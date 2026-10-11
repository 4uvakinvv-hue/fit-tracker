const enc = new TextEncoder();
export const escape = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export async function signedParameters(method, url, params, consumerKey, consumerSecret, token = {}, nonce = crypto.randomUUID(), timestamp = Math.floor(Date.now()/1000)) {
  const p = {...params, oauth_consumer_key:consumerKey, oauth_signature_method:'HMAC-SHA1', oauth_timestamp:String(timestamp), oauth_nonce:nonce, oauth_version:'1.0'};
  if(token.key) p.oauth_token=token.key;
  const normalized=Object.entries(p).map(([k,v])=>[escape(k),escape(v)]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(([k,v])=>`${k}=${v}`).join('&');
  const base=[method.toUpperCase(),escape(url),escape(normalized)].join('&');
  const key=await crypto.subtle.importKey('raw',enc.encode(`${escape(consumerSecret)}&${escape(token.secret||'')}`),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(base)));
  p.oauth_signature=btoa(String.fromCharCode(...bytes));
  return p;
}
export async function tokenCipher(secret) {
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(`Forma/FatSecret/token/v1:${secret}`));
  const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
  return {
    async seal(data,userId){
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(userId)},key,enc.encode(JSON.stringify(data))));
      return btoa(String.fromCharCode(...iv,...encrypted));
    },
    async open(value,userId){
      const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:enc.encode(userId)},key,bytes.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    }
  };
}
export const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
export function summarizeEntries(data) {
  const entries=asArray(data?.food_entries?.food_entry);
  const fields=['calories','protein','fat','carbohydrate'];
  if(!entries.length)return {entryCount:0,calories:null,protein:null,fat:null,carbohydrate:null};
  const result={entryCount:entries.length};
  for(const field of fields){
    const values=entries.map(e=>e[field]==null||e[field]===''?null:Number(e[field]));
    result[field]=values.some(v=>v===null||!Number.isFinite(v)||v<0)?null:Math.round(values.reduce((a,b)=>a+b,0)*100)/100;
  }
  return result;
}
