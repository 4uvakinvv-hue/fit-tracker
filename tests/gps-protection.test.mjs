import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sanitizeGpsPoints,gpsSegmentAssessment} from '../src/gps-protection.js';

const p=(lat,lng,t,speedKmh=20,accuracy=8)=>({lat,lng,t,speedKmh,accuracy});

test('bike teleport/spoof points are removed and route returns to trusted track',()=>{
  const t=1_700_000_000_000;
  const points=[
    p(43.6000,39.7000,t,0),
    p(43.6000,39.7040,t+60_000,18),
    p(42.0000,40.3000,t+61_000,0,10),
    p(42.0002,40.3002,t+65_000,2,10),
    p(43.6000,39.7080,t+120_000,18,8),
    p(43.6000,39.7120,t+180_000,18,8),
  ];
  const clean=sanitizeGpsPoints(points,'bike');
  assert.equal(clean.spoofDetected,true);
  assert.ok(clean.filteredPoints>=2);
  assert.ok(clean.points.every(x=>x.lat>43));
  assert.equal(clean.points.at(-1).lng,39.7120);
});

test('180 km/h segment is impossible for bike but not automatically for motorcycle',()=>{
  const a=p(43.6,39.7,0,0);
  const b=p(43.6,39.711,20_000,180,8);
  assert.equal(gpsSegmentAssessment(a,b,'bike').trusted,false);
  assert.equal(gpsSegmentAssessment(a,b,'moto').trusted,true);
});

test('GPS reacquisition after a long outage starts a disconnected segment',()=>{
  const t=1_700_000_000_000;
  const clean=sanitizeGpsPoints([
    p(43.60,39.70,t,0),
    p(43.60,39.704,t+60_000,18),
    p(43.65,39.75,t+15*60_000,18),
    p(43.65,39.754,t+16*60_000,18),
  ],'bike');
  assert.ok(clean.discontinuities>=1);
  assert.equal(clean.points.some(x=>x.breakBefore===true),true);
});

test('very poor fixes are ignored',()=>{
  const t=1_700_000_000_000;
  const clean=sanitizeGpsPoints([
    p(43.60,39.70,t,0,8),
    p(43.61,39.71,t+60_000,20,300),
    p(43.60,39.704,t+120_000,18,8),
  ],'bike');
  assert.ok(clean.filteredPoints>=1);
  assert.equal(clean.points.some(x=>x.accuracy===300),false);
});

test('native flaneuring rejects bad/spoofed fixes and completed GPS sessions queue offline',async()=>{
  const store=await readFile('native/android/FlaneuringStore.java','utf8');
  const app=await readFile('src/App.jsx','utf8');
  assert.match(store,/getAccuracy\(\)>120f/);
  assert.match(store,/derived>320/);
  assert.match(store,/dt<=1200/);
  assert.match(store,/derived>80&&device<Math\.max\(25,derived\*\.35\)/);
  assert.match(app,/GPS_PENDING_STORAGE_KEY/);
  assert.match(app,/queuePendingGpsSession\(resultData\)/);
  assert.match(app,/syncPendingGpsSessions/);
});


test('a persistent spoof cluster is not trusted just because its local points look smooth',()=>{
  const t=1_700_000_000_000;
  const points=[
    p(43.6000,39.7000,t,0),
    p(43.6000,39.7040,t+60_000,18),
    p(42.0000,40.3000,t+61_000,5,8),
    p(42.0001,40.3001,t+70_000,5,8),
    p(42.0002,40.3002,t+80_000,5,8),
    p(42.0003,40.3003,t+90_000,5,8),
  ];
  const clean=sanitizeGpsPoints(points,'bike');
  assert.equal(clean.points.some(x=>x.lat<43),false);
  assert.ok(clean.filteredPoints>=4);
});
