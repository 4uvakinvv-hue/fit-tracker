import test from 'node:test';
import assert from 'node:assert/strict';
import {supersetGroup,recentResultsByExercise} from '../src/coach-presentation.js';

test('superset groups only consecutive exercises with the same label',()=>{
 const rows=[{exercise:'Жим'},{exercise:'Разгибание стоя',superset:'A'},{exercise:'Махи',superset:'A'},{exercise:'Пресс',superset:'B'},{exercise:'Икры',superset:'A'}];
 assert.equal(supersetGroup(rows,0),null);
 assert.deepEqual(supersetGroup(rows,1),{label:'A',position:1,size:2,first:true,last:false,nextNumber:3});
 assert.deepEqual(supersetGroup(rows,2),{label:'A',position:2,size:2,first:false,last:true,nextNumber:null});
 assert.equal(supersetGroup(rows,3),null,'a lone label is not a superset');
 assert.equal(supersetGroup(rows,4),null,'same label separated by another exercise is not joined');
 assert.equal(supersetGroup([{superset:' '},{superset:''}],0),null);
});

test('recent results keep the three newest executions per exercise, one per session',()=>{
 const sessions=[
  {date:'2026-11-02',base_rows:[{exercise:'Сгибание ног',sets:'3',reps:'10',weight:'52.3'},{exercise:'Сгибание ног',sets:'1',reps:'5',weight:'1'}],extra_rows:[]},
  {date:'2026-10-26',base_rows:[{exercise:' сгибание НОГ ',sets:'3',reps:'14',weight:'45'}]},
  {date:'2026-10-19',base_rows:[{exercise:'Жим',sets:'3',reps:'8',weight:'80'}],extra_rows:[{exercise:'Сгибание ног',sets:'3',reps:'13',weight:'43'}]},
  {date:'2026-10-16',base_rows:[{exercise:'Сгибание ног',sets:'3',reps:'12',weight:'41'}]}
 ];
 const recent=recentResultsByExercise(sessions,3);
 assert.deepEqual(recent['сгибание ног'].map(x=>[x.date,x.weight]),[['2026-11-02','52.3'],['2026-10-26','45'],['2026-10-19','43']]);
 assert.equal(recent['жим'].length,1);
 assert.deepEqual(recentResultsByExercise(null),{});
});
