export const GROUPS=[{id:'chest',label:'Грудь',icon:'◈'},{id:'back',label:'Спина',icon:'╫'},{id:'legs',label:'Ноги',icon:'⋔'},{id:'custom',label:'Своё',icon:'✦'}];
export const blankRows=n=>Array.from({length:n},()=>({exercise:'',sets:'',reps:'',weight:'',comment:''}));
export const numeric=value=>Number(String(value??'').trim().replace(',','.'));
export function normalizedRows(rows,n){return Array.from({length:Math.max(n,rows?.length||0)},(_,i)=>({...blankRows(1)[0],...rows?.[i]}));}
export function draftKey(userId,mode,date,group){return `forma:gym-draft:v1:${userId}:${mode}:${date}:${group}`;}
export function readDraft(storage,key){try{const data=JSON.parse(storage.getItem(key));return data?.version===1&&Array.isArray(data.baseRows)&&Array.isArray(data.extraRows)?data:null;}catch{return null;}}
export function writeDraft(storage,key,data){storage.setItem(key,JSON.stringify({...data,version:1,updatedAt:new Date().toISOString()}));}
export function normalizeResults(rows){return rows.map(r=>({...r,weight:String(r.weight??'').replace(',','.'),sets:String(r.sets??''),reps:String(r.reps??'')}));}
export function validateResults(rows){for(const r of rows.filter(x=>x.exercise)){if(!Number.isInteger(numeric(r.sets))||numeric(r.sets)<1||numeric(r.sets)>50)return 'Укажи число подходов от 1 до 50 для каждого упражнения.';if(!Number.isInteger(numeric(r.reps))||numeric(r.reps)<1||numeric(r.reps)>200)return 'Укажи фактическое число повторений для каждого упражнения.';if(String(r.weight??'').trim()===''||!Number.isFinite(numeric(r.weight))||numeric(r.weight)<0)return 'Укажи вес для каждого упражнения; для собственного веса можно 0.';}return null;}
export function tonnage(rows){return rows.reduce((sum,r)=>sum+(numeric(r.sets)||0)*(numeric(r.reps)||0)*(numeric(r.weight)||0)*(r.weightBasis==='per_hand'?2:1),0);}
export function todayMoscow(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function initialWorkout(plan){return {id:crypto.randomUUID(),planId:plan.id,baseRows:plan.exercises.map(r=>({...r,coachNote:r.comment||r.coachNote||'',comment:'',targetSets:r.sets,targetReps:r.reps,targetWeight:r.weight,sets:'',reps:'',weight:'',rir:''})),extraRows:[]};}
