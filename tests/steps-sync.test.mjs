import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStepSamples,stepsFreshness,stepsReadStart,stepsStatusText,sumStepSamplesByDate,mergeStepRows,nextHourly55} from '../src/steps-sync.js';
const now=new Date(2026,9,13,6,30);
const sample=(day,value)=>({startDate:new Date(2026,9,day).toISOString(),value});
test('old provider response is stale, not a zero for today',()=>{
 const rows=normalizeStepSamples([sample(10,6643)],now);
 assert.deepEqual(stepsFreshness(rows,now),{latest:'2026-10-10',today:null,stale:true});
 assert.match(stepsStatusText('ready',rows,now),/Свежие шаги не поступили/);
});
test('fresh and genuine zero are distinct from absent days',()=>{
 const rows=normalizeStepSamples([sample(12,16737),sample(13,0)],now);
 assert.deepEqual(stepsFreshness(rows,now),{latest:'2026-10-13',today:0,stale:false});
 assert.equal(stepsFreshness([rows[0]],now).today,null);
 assert.equal(stepsFreshness([rows[0]],now).stale,false);
});
test('malformed and future values cannot overwrite recorded history',()=>{
 const rows=normalizeStepSamples([sample(12,16737),sample(12,16737),sample(14,100),sample(11,null),sample(10,-3),{startDate:'bad',value:100},sample(9,'bad')],now);
 assert.deepEqual(rows,[{date:'2026-10-12',steps:16737}]);
});
test('history permission controls read window and local midnight',()=>{
 const recent=stepsReadStart(now,{historyAccessAuthorized:false});
 assert.equal(recent.getDate(),14);assert.equal(recent.getMonth(),8);assert.equal(recent.getHours(),0);
 assert.equal(stepsReadStart(now,{historyAccessAuthorized:true}).getFullYear(),2025);
 assert.match(stepsStatusText('web',[],now),/Браузер/);
 assert.match(stepsStatusText('permission',[],now),/Нет разрешения/);
});


test('hourly buckets are summed by local day and merged with daily/stored maxima',()=>{
 const hours=[
   {startDate:new Date(2026,9,17,8).toISOString(),value:1200},
   {startDate:new Date(2026,9,17,9).toISOString(),value:1800},
   {startDate:new Date(2026,9,16,22).toISOString(),value:400}
 ];
 const hourly=sumStepSamplesByDate(hours,new Date(2026,9,17,18));
 assert.deepEqual(hourly,[
   {date:'2026-10-16',steps:400},
   {date:'2026-10-17',steps:3000}
 ]);
 assert.deepEqual(
   mergeStepRows([{date:'2026-10-17',steps:580}],hourly,[{date:'2026-10-17',steps:11000}]),
   [{date:'2026-10-16',steps:400},{date:'2026-10-17',steps:11000}]
 );
});

test('hourly scheduler runs at minute 55 including final 23:55',()=>{
 const evening=nextHourly55(new Date(2026,9,17,18,49,10));
 assert.equal(evening.getHours(),18);
 assert.equal(evening.getMinutes(),55);
 const late=nextHourly55(new Date(2026,9,17,22,58,0));
 assert.equal(late.getHours(),23);
 assert.equal(late.getMinutes(),55);
 const after=nextHourly55(new Date(2026,9,17,23,56,0));
 assert.equal(after.getDate(),18);
 assert.equal(after.getHours(),0);
 assert.equal(after.getMinutes(),55);
});
