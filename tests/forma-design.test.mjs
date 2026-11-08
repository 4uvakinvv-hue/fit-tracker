import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FORMA_ACTIVITIES,QUICK_DEFAULT,cleanQuickActivities,allowedQuickActivity} from '../src/forma-design-contract.js';

const ids=['gym','bike','hike','run','crossfit','flaneuring','workout','combat'];

test('approved catalog has exactly eight distinct activities in approved visual order',()=>{
  assert.deepEqual(FORMA_ACTIVITIES.map(x=>x.id),ids);
  assert.equal(new Set(FORMA_ACTIVITIES.map(a=>a.label)).size,8);
  for(const a of FORMA_ACTIVITIES){assert.ok(a.label);assert.ok(a.caption);}
});
test('quick favorites default to gym and bike; deduplicate and reject unknown items',()=>{
  assert.deepEqual(QUICK_DEFAULT,['gym','bike']);
  assert.deepEqual(cleanQuickActivities(undefined),['gym','bike']);
  assert.deepEqual(cleanQuickActivities(['bike','hike','bike','unsafe','gym']),['bike','hike','gym']);
  assert.deepEqual(cleanQuickActivities([]),[]);
  assert.ok(allowedQuickActivity('flaneuring'));
  assert.ok(!allowedQuickActivity('outdoor'));
});
test('approved assets are bundled locally and no image depends on network',async()=>{
  for(const n of ['activities','hero','community','about','coach','splash','exercises']){
    const file='public/forma-design/'+n+'.webp';
    const data=await readFile(file);
    assert.ok(data.length>2000,file+' must be a viable image');
    assert.equal(data.subarray(0,4).toString(),'RIFF',file+' must be WebP');
    assert.equal(data.subarray(8,12).toString(),'WEBP');
  }
});
test('approved screen contracts remain part of the real app, not a separate mockup',async()=>{
  const app=await readFile('src/App.jsx','utf8');
  const gym=await readFile('src/GymTraining.jsx','utf8');
  const css=await readFile('src/forma-design-v1.css','utf8');
  assert.match(app,/className="main-screen home-no-scroll forma-home"/);
  assert.match(app,/className="forma-activity-grid"/);
  assert.match(app,/className="forma-distribution glass-card"/);
  assert.match(app,/className="forma-podium"/);
  assert.match(app,/className="forma-about-hero"/);
  assert.match(app,/forma-design\/splash\.webp/);
  assert.match(app,/onQuickActivity\(a\.id\)/);
  assert.match(app,/onToggleQuick\(a\.id\)/);
  assert.match(gym,/\.slice\(0,8\)/);
  assert.match(gym,/r\.sourceKind\|\|kind/);
  assert.match(gym,/className="forma-gym-save-row"/);
  assert.match(css,/--bg:#f7eee6/);
  assert.match(css,/overflow:hidden!important/);
  assert.doesNotMatch(css,/https?:\/\/unsplash/);
});
