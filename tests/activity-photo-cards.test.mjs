import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const picker = app.slice(app.indexOf('function AddTraining('), app.indexOf('function ScreenBack('));

test('five approved photo cards have no extra icons or duplicated labels', () => {
  assert.match(picker, /ACTIVITIES\.map\(a=><button[^\n]*approved-photo-card/);
  assert.match(picker, /aria-label=\{a\.label\}/);
  assert.match(picker, /className="forma-card-image approved-card-image" src=\{APPROVED_PICKER_CARDS\[a\.id\]\}/);
  assert.doesNotMatch(picker, /<ActivityGlyph/);
  assert.match(picker, /className="activity-choice other-choice approved-other-choice"/);
  assert.doesNotMatch(picker, /<span>＋<\/span>/);
  assert.match(picker, /onClick=\{\(\)=>onChoose\(a\.id\)\}/);
});

test('approved photo-card design matches exact screenshot crops without extra gradients', () => {
  assert.match(styles, /\.activity-choice\.approved-photo-card::before\s*\{\s*display:none!important/);
  assert.match(styles, /\.activity-choice\.approved-photo-card > \.approved-card-image\s*\{[\s\S]*?object-fit:fill!important/);
  assert.match(styles, /\.activity-choice\.approved-photo-card > \.approved-card-fallback\s*\{\s*display:none!important/);
});

test('gym picker fills its cell proportionally and anchors the embedded title', () => {
  assert.match(app, /id: 'gym', label: 'Тренажёрка', icon: '[^']+', accent: 'violet'/);
  assert.match(styles, /\.approved-photo-card\.violet > \.approved-card-image\s*\{[^}]*object-fit:cover!important;[^}]*object-position:left bottom!important/);
});

test('all five picker assets are exact, lossless crops from approved reference', () => {
  const hashes = {
    gym:'27818169a617080f56d4e13be85966e6a8bbcf50b6a8f82b87aa2a1e3b45a600',
    outdoor:'bb08f3e86a68be9b80a099b4082c42c6cf3d2e3653b9cef1795448745598fe7c',
    workout:'8864565c58ff08cb7e51b11da9265b56816ddd3d325956cfe742402037fa2ca0',
    combat:'4e8bc63877ffc1ca3b281cdc0b5f67a599dd396791c89603f0ad892732e326a4',
    crossfit:'ca56a3a5b886c72d62d53db7cbd57b08c4f38f87a8ac7f91eed82bd040930b2e',
  };
  for(const [name,sha] of Object.entries(hashes)){
    const file=join(new URL('../src/assets/activities/',import.meta.url).pathname,'approved-'+name+'.png');
    assert.ok(existsSync(file), name+' is missing');
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),sha,name+' differs from approved screenshot');
  }
  const reference=new URL('../docs/references/2026-11-25_activities_FINAL_APPROVED.png',import.meta.url);
  assert.ok(existsSync(reference),'The approved screenshot reference must be in the repository');
});

test('stats photos fill their cards behind live values and history links', () => {
  assert.match(app, /className="gym-stat-card-v17 stat-wide photo-stat-card"/);
  assert.match(app, /className=\{'stat-card stat-card-v17 photo-stat-card /);
  assert.match(app, /className="series-stat-card-v110 photo-stat-card"/);
  assert.match(styles, /\.forma-card-image\s*\{[^}]*object-fit:cover/s);
  assert.match(styles, /\.stats-v17 \.photo-stat-card::before/);
  assert.doesNotMatch(app.match(/function V17StatCard\([\s\S]*?\n\}/)?.[0]||'', /stat-icon/);
  assert.match(app, /onClick=\{\(\)=>onOpenHistory\('gym'\)\}/);
  assert.match(app, /onClick=\{onClick\}/);
  assert.match(app, /\{formatKg\(tonnage\)\}/);
});

test('statistics photo assets are bundled locally', () => {
  for(const name of ['gym','outdoor','workout','combat','crossfit','hike','steps','series','moto']) {
    assert.ok(existsSync(join(new URL('../src/assets/activities/',import.meta.url).pathname,name+'.webp')),name+' missing');
  }
});
