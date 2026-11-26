import test from 'node:test';
import assert from 'node:assert/strict';
import {draftKey,readDraft,writeDraft,normalizedRows,initialWorkout,restoreCoachDraft,validateResults,normalizeResults,tonnage,workoutBlocks} from '../src/gym-drafts.js';
import {findExercises,EXERCISES} from '../src/exercise-catalog.js';
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('draft survives a fresh reader and is isolated by account, date and mode',()=>{const s=storage(),key=draftKey('user-a','manual','2026-10-12','custom');const d={id:'save-id',baseRows:[{exercise:'Тяга вне каталога',weight:'13,5',sets:'3',reps:'12',comment:'Заметка'}],extraRows:[]};writeDraft(s,key,d);assert.deepEqual(readDraft(s,key).baseRows,d.baseRows);assert.equal(readDraft(s,draftKey('user-b','manual','2026-10-12','custom')),null);assert.equal(readDraft(s,draftKey('user-a','coach','2026-10-12','custom')),null);assert.equal(readDraft(s,draftKey('user-a','manual','2026-10-13','custom')),null);assert.equal(readDraft(s,key).id,'save-id');});
test('bad storage cannot erase user input silently or restore invalid data',()=>{const s=storage();s.setItem('key','not-json');assert.equal(readDraft(s,'key'),null);assert.throws(()=>writeDraft({setItem(){throw Error('quota');}},'key',{baseRows:[],extraRows:[]}));});
test('coach fields start from suggestions while targets remain separate',()=>{const p={id:'plan',exercises:[{exercise:'Тяга',sets:2,reps:'10–12',weight:30,comment:'Упор грудью'}]};const d=initialWorkout(p);assert.equal(d.baseRows[0].targetWeight,30);assert.equal(d.baseRows[0].targetReps,'10–12');assert.equal(d.baseRows[0].weight,'30');assert.equal(d.baseRows[0].reps,'10');assert.equal(d.baseRows[0].sets,'2');assert.equal(d.baseRows[0].comment,'');assert.equal(d.baseRows[0].coachNote,'Упор грудью');assert.equal(validateResults(d.baseRows),null);});
test('decimal comma remains a real weight; incomplete results cannot be finalized',()=>{const rows=[{exercise:'Бицепс',weight:'13,5',sets:'3',reps:'12'}];assert.equal(validateResults(rows),null);assert.equal(normalizeResults(rows)[0].weight,'13.5');assert.equal(tonnage(rows),486);assert.ok(validateResults([{...rows[0],sets:''}]));assert.ok(validateResults([{...rows[0],reps:'10–12'}]));assert.equal(tonnage([{weight:30,sets:2,reps:8,weightBasis:'per_hand'}]),960);});
test('rows never truncate an existing longer workout',()=>{const rows=Array.from({length:12},(_,i)=>({exercise:String(i)}));assert.equal(normalizedRows(rows,8).length,12);});
test('catalog searches variants and preserves exercises missing from catalog',()=>{assert.ok(EXERCISES.length>=150);assert.ok(findExercises('жим гантелей').some(x=>x.name.includes('отрицательным')));assert.ok(findExercises('горизонтальная тяга').some(x=>x.name.includes('одной рукой')));assert.ok(findExercises('бицепс').length>0);assert.ok(findExercises('Мой редкий жим','all',['Мой редкий жим']).length===1);});

test('legacy blank coach drafts get suggestions once without replacing entered results',()=>{const plan={id:'plan',exercises:[{exercise:'Тяга',sets:2,reps:'10–12',weight:25}]};const old={id:'stable-session-id',planId:'plan',baseRows:[{exercise:'Тяга',targetSets:2,targetReps:'10–12',targetWeight:25,sets:'',reps:'9,5',weight:'23.5',comment:'Моя заметка'}],extraRows:[]};const next=restoreCoachDraft(old,plan);assert.equal(next.id,old.id);assert.equal(next.baseRows[0].sets,'2');assert.equal(next.baseRows[0].reps,'9,5');assert.equal(next.baseRows[0].weight,'23.5');assert.equal(next.baseRows[0].comment,old.baseRows[0].comment);next.baseRows[0].weight='';assert.equal(restoreCoachDraft(next,plan).baseRows[0].weight,'');assert.equal(validateResults([{exercise:'Тяга',sets:2,reps:'9,5',weight:25}]),null);assert.equal(normalizeResults([{reps:'9,5'}])[0].reps,'9.5');});

test('manual blocks preserve all movements and count only adjacent supersets',()=>{
 const rows=Array.from({length:9},(_,index)=>({exercise:`Movement ${index}`}));
 rows[6].superset='A';
 rows[7].superset='A';
 const blocks=workoutBlocks(rows);
 assert.equal(blocks.length,8);
 assert.equal(blocks[6].length,2);
 assert.deepEqual(blocks.flat(),rows);
 assert.equal(workoutBlocks([{exercise:'First',superset:'A'},{exercise:'Middle'},{exercise:'Last',superset:'A'}]).length,3);
 assert.equal(workoutBlocks([...rows,{exercise:'   '}]).length,8);
 assert.equal(workoutBlocks(rows.map(({superset,...row})=>row)).length,9);
});

test('individual approaches round-trip and count assistance and dumbbells per set',()=>{
 const rows=[
  {exercise:'Махи гантелями',weightBasis:'per_hand',approaches:[{reps:12,weight:5},{reps:8,weight:'7,5'}]},
  {exercise:'Подтягивания в гравитроне',bodyWeight:90,approaches:[{reps:8,weight:30},{reps:6,weight:35}]},
 ];
 assert.equal(validateResults(rows),null);
 const normalized=normalizeResults(rows);
 assert.equal(normalized[0].sets,'2');
 assert.equal(normalized[0].approaches[1].weight,'7.5');
 assert.equal(tonnage(normalized),1050);
});

test('monthly templates fill the intended slots and history repeat keeps actual sets',async()=>{
 const {monthlyTemplates,repeatTemplate}=await import('../src/gym-monthly.js');
 for(const days of [2,3]){
  const november=monthlyTemplates('2026-11-26',days);
  assert.deepEqual(november,monthlyTemplates('2026-12-01',days));
  assert.deepEqual(Object.values(november).map(slot=>slot.baseRows.length),days===2?[7,6,0,0]:[7,7,6,0]);
  assert.equal(november.chest.baseRows[0].weight,'');
 }
 const approaches=[{reps:'8',weight:'50'},{reps:'6',weight:'55'}];
 const session={date:'2026-11-14',baseRows:[{exercise:'Жим',approaches,superset:'A',comment:'История'}],extraRows:[{exercise:'Тяга',superset:'A'}]};
 const repeated=repeatTemplate(session);
 assert.deepEqual(repeated.baseRows.map(row=>row.exercise),['Жим','Тяга']);
 assert.deepEqual(repeated.baseRows[0].approaches,approaches);
 assert.equal(repeated.baseRows[0].comment,undefined);
 assert.equal(workoutBlocks(repeated.baseRows).length,1);
 assert.equal(session.baseRows[0].comment,'История');
});
