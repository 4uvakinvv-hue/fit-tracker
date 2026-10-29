import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyweightMode,effectiveLoad,rowVolume,workoutVolume,formatPreviousDate,failureType} from '../src/coach-volume.js';

test('ordinary exercise and a pair of dumbbells',()=>{
 assert.equal(rowVolume({exercise:'Жим штанги лёжа',sets:3,reps:10,weight:80}),2400);
 assert.equal(rowVolume({exercise:'Жим гантелей',sets:3,reps:10,weight:20,weightBasis:'per_hand'}),1200);
});
test('pull-ups and parallel-bar dips use body mass plus added load',()=>{
 assert.equal(bodyweightMode('Подтягивания широким хватом'),'bodyweight');
 assert.equal(bodyweightMode('Отжимания на брусьях'),'bodyweight');
 assert.equal(rowVolume({exercise:'Подтягивания',sets:3,reps:8,weight:20,bodyWeight:90}),2640);
 assert.equal(rowVolume({exercise:'Отжимания на брусьях',sets:3,reps:10,weight:0,bodyWeight:90}),2700);
});
test('gravitron uses bodyweight minus assistance',()=>{
 assert.equal(bodyweightMode('Гравитрон — подтягивания'),'assisted');
 assert.equal(effectiveLoad({exercise:'Гравитрон',weight:25,bodyWeight:100}),75);
 assert.equal(rowVolume({exercise:'Гравитрон',sets:1,reps:10,weight:25,bodyWeight:100}),750);
 assert.equal(effectiveLoad({exercise:'Гравитрон',weight:110,bodyWeight:100}),0);
});
test('missing own weight is not a fabricated zero load',()=>{
 assert.equal(rowVolume({exercise:'Подтягивания',sets:3,reps:10,weight:0}),null);
 assert.equal(workoutVolume([{exercise:'Подтягивания',sets:3,reps:10,weight:0}]),null);
});
test('live edits change volume',()=>{
 const rows=[{exercise:'Жим лёжа',sets:3,reps:10,weight:10},{exercise:'Тяга',sets:2,reps:10,weight:35}];
 assert.equal(workoutVolume(rows),1000);
 assert.equal(workoutVolume([{...rows[0],sets:4},rows[1]]),1100);
});
test('failure type respects the training day',()=>{
 assert.equal(failureType({trainToFailure:true},{title:'Средний день'}),'technical');
 assert.equal(failureType({trainToFailure:true},{title:'Тяжёлый день'}),'full');
 assert.equal(failureType({trainToFailure:true},{title:'Лёгкий день'}),null);
});
test('previous date shows calendar weekday after date',()=>{
 assert.match(formatPreviousDate('2026-10-21'),/^21\.10\s*\(ср\)$/);
});
