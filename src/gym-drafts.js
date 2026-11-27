import {rowVolume} from './coach-volume.js';
import {supersetGroup} from './coach-presentation.js';
export const GROUPS=[{id:'chest',label:'Грудь',icon:'◈'},{id:'back',label:'Спина',icon:'╫'},{id:'legs',label:'Ноги',icon:'⋔'},{id:'custom',label:'Своё',icon:'✦'}];
export const blankRows=n=>Array.from({length:n},()=>({exercise:'',sets:'',reps:'',weight:'',comment:''}));
export const numeric=value=>Number(String(value??'').trim().replace(',','.'));
export function normalizedRows(rows,n){return Array.from({length:Math.max(n,rows?.length||0)},(_,i)=>({...blankRows(1)[0],...rows?.[i]}));}
export function draftKey(userId,mode,date,group){return `forma:gym-draft:v1:${userId}:${mode}:${date}:${group}`;}
export function readDraft(storage,key){try{const data=JSON.parse(storage.getItem(key));return data?.version===1&&Array.isArray(data.baseRows)&&Array.isArray(data.extraRows)?data:null;}catch{return null;}}
export function writeDraft(storage,key,data){storage.setItem(key,JSON.stringify({...data,version:1,updatedAt:new Date().toISOString()}));}
export function setManualGroup(storage,userId,group){
 try{storage.setItem(`forma:gym-selection:${userId}`,JSON.stringify({group}));}catch{}
}
export function manualDraft(storage,userId,group,date){
 const currentKey=draftKey(userId,'manual',date,group);
 const prefix=`forma:gym-draft:v1:${userId}:manual:`;
 let latest={key:currentKey,draft:null};
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index);
  if(!key?.startsWith(prefix)||!key.endsWith(`:${group}`))continue;
  const draft=readDraft(storage,key);
  if(draft&&(!latest.draft||String(draft.updatedAt??'')>String(latest.draft.updatedAt??'')))latest={key,draft};
 }
 return latest;
}

const decimal=value=>String(value??'').replace(',','.');
export function exerciseApproaches(row){
 if(Array.isArray(row.approaches))return row.approaches;
 const count=numeric(row.sets);
 if(!Number.isInteger(count)||count<1||count>50)return [];
 return Array.from({length:count},()=>({reps:row.reps??'',weight:row.weight??''}));
}

export function normalizeResults(rows){
 return rows.map(row=>({...row,sets:String(row.approaches?.length??row.sets??''),
  reps:decimal(row.reps),weight:decimal(row.weight),
  ...(Array.isArray(row.approaches)&&{approaches:row.approaches.map(({reps,weight})=>({reps:decimal(reps),weight:decimal(weight)}))}),
 }));
}

export function validateResults(rows){
 for(const row of rows.filter(r=>r.exercise)){
  const sets=row.approaches?.length??numeric(row.sets);
  if(!Number.isInteger(sets)||sets<1||sets>50)return 'Укажи число подходов от 1 до 50 для каждого упражнения.';
  for(const {reps,weight} of row.approaches??[row]){
   if(!Number.isFinite(numeric(reps))||numeric(reps)<1||numeric(reps)>200)return 'Укажи число повторений от 1 до 200 для каждого подхода.';
   if(String(weight??'').trim()===''||!Number.isFinite(numeric(weight))||numeric(weight)<0)return 'Укажи вес для каждого подхода; для собственного веса можно 0.';
  }
 }
 return null;
}
export function tonnage(rows){return rows.reduce((sum,row)=>sum+(rowVolume(row)??0),0);}
export function todayMoscow(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function suggestedReps(row){const value=row.startReps??String(row.reps??'').match(/\d+(?:[.,]\d+)?/)?.[0];return value===undefined?'':String(value).replace(',','.');}
export function initialWorkout(plan){return {id:crypto.randomUUID(),planId:plan.id,prefillVersion:1,baseRows:plan.exercises.map(r=>({...r,coachNote:r.comment||r.coachNote||'',comment:'',targetSets:r.sets,targetReps:r.reps,targetWeight:r.weight,sets:String(r.sets??''),reps:suggestedReps(r),weight:String(r.weight??'')})),extraRows:[]};}
export function restoreCoachDraft(draft,plan){
 if(!draft)return initialWorkout(plan);
 if(draft.prefillVersion===1)return draft;
 return {...draft,prefillVersion:1,baseRows:draft.baseRows.map((r,i)=>{const p=plan.exercises[i]||{};return {...r,sets:r.sets===undefined||r.sets===''?String(r.targetSets??p.sets??''):r.sets,reps:r.reps===undefined||r.reps===''?suggestedReps({reps:r.targetReps??p.reps,startReps:p.startReps}):r.reps,weight:r.weight===undefined||r.weight===''?String(r.targetWeight??p.weight??''):r.weight};})};
}

// Preserve separate result rows while counting adjacent supersets as one block.
export function workoutBlocks(rows){
 const populated=rows.filter(row=>String(row.exercise||'').trim());
 const blocks=[];
 for(let index=0;index<populated.length;index++){
  const group=supersetGroup(populated,index);
  if(!group||group.first)blocks.push([]);
  blocks[blocks.length-1].push(populated[index]);
 }
 return blocks;
}
