import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generate,warmRules,START,END,isWarm,winterColor} from '../scripts/winter-recolor.mjs';

const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');

test('every season-independent warm color has a generated winter override',()=>{
 const current=css.slice(css.indexOf(START),css.indexOf(END)+END.length)+'\n';
 assert.ok(warmRules(css).length>0);
 assert.equal(current,generate(css),'run `node scripts/winter-recolor.mjs` after adding or changing a rule with orange/amber/brown colors');
});

test('winter recolor maps warm colors to cool ones and keeps activity identities distinct',()=>{
 assert.ok(isWarm('#ffad45')&&isWarm('rgba(55,31,24,.24)'));
 assert.ok(!isWarm('#65caff')&&!isWarm('rgba(0,0,0,.3)')&&!isWarm('#ffffff'));
 for(const c of ['#ffad45','#f4e8df','rgba(92,46,26,.34)'])assert.ok(!isWarm(winterColor(c)),c);
 assert.notEqual(winterColor('#ff9d62','.combat'),winterColor('#ff9d62','.week-day'));
});

test('winter uses white snowflakes, never autumn leaves, and respects reduced motion',async()=>{
 const svg=await readFile(new URL('../src/assets/snowflake.svg',import.meta.url),'utf8');
 assert.match(svg,/stroke="#fff"/);
 const winter=css.slice(css.indexOf('/* Forma 2.1 — winter treatment'));
 assert.match(winter,/\.app-shell-dark\.season-winter \.season-leaf-icon,[\s\S]*?mask:url\('\.\/assets\/snowflake\.svg'\)/);
 assert.ok(!/autumn-leaf/.test(winter),'no leaves in the winter treatment');
 assert.match(winter,/@media \(prefers-reduced-motion:reduce\)\{\.app-shell-dark\.season-winter::after\{animation:none\}\}/);
 for(const rule of winter.matchAll(/([^{}]+)\{[^{}]*\}/g)){
  const sel=rule[1].replace(/\/\*[\s\S]*?\*\//g,'').trim();
  if(!sel||sel.startsWith('@')||/^(from|to)\b/.test(sel))continue;
  for(const part of sel.split(','))assert.match(part,/season-winter/,`winter rule must be winter-scoped: ${part.trim()}`);
 }
});
