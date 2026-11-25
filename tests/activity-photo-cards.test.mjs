import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('five actual activity picker choices have photography; Other stays unchanged', () => {
  assert.match(app, /ACTIVITIES\.map\(a=><button[^\n]*has-photo/);
  assert.match(app, /className="forma-card-image" src=\{ACTIVITY_PHOTOS\[a\.id\]\}/);
  assert.match(app, /className="activity-choice other-choice"/);
});

test('stats photo backgrounds fill the card, not the icon square', () => {
  assert.match(app, /className="gym-stat-card-v17 stat-wide photo-stat-card"/);
  assert.match(app, /className=\{'stat-card stat-card-v17 photo-stat-card /);
  assert.match(app, /className="series-stat-card-v110 photo-stat-card"/);
  assert.match(styles, /\.forma-card-image\s*\{[^}]*object-fit:cover/s);
  assert.match(styles, /\.stats-v17 \.photo-stat-card::before/);
  assert.doesNotMatch(app.match(/function V17StatCard\([\s\S]*?\n\}/)?.[0]||'', /stat-icon/);
});

test('all eight approved activity photos are bundled in the repository', () => {
  for(const name of ['gym','outdoor','workout','combat','crossfit','hike','steps','series']) {
    assert.equal(existsSync(join(new URL('../src/assets/activities/',import.meta.url).pathname, name+'.webp')),true, name+' missing');
  }
});

test('photo-card elements retain action handlers and existing statistics data', () => {
  assert.match(app, /className=\{\`activity-choice /); 
  assert.match(app, /onClick=\{\(\)=>onChoose\(a\.id\)\}/);
  assert.match(app, /onClick=\{\(\)=>onOpenHistory\('gym'\)\}/);
  assert.match(app, /onClick=\{onClick\}/);
  assert.match(app, /\{formatKg\(tonnage\)\}/);
});
