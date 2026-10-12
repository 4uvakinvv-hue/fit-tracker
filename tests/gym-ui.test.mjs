import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
for(const key of ['window','document','localStorage','HTMLElement','HTMLInputElement','Event','MouseEvent'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.BroadcastChannel=undefined;
const React=await import('react'),{createRoot}=await import('react-dom/client');
await mkdir('.gym-test-build',{recursive:true});
await build({entryPoints:['src/GymTraining.jsx','src/TrainerWorkout.jsx'],outdir:'.gym-test-build',bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react-dom','@supabase/supabase-js'],plugins:[{name:'shared-supabase',setup(b){b.onResolve({filter:/supabase\.js$/},()=>({path:process.cwd()+'/src/supabase.js',external:true}));}}],outExtension:{'.js':'.mjs'}});
const {default:Gym}=await import(pathToFileURL(process.cwd()+'/.gym-test-build/GymTraining.mjs'));
const {default:Coach}=await import(pathToFileURL(process.cwd()+'/.gym-test-build/TrainerWorkout.mjs'));
const {supabase}=await import('../src/supabase.js');
const click=async el=>React.act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
async function input(el,value){await React.act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.includes(text));
let root;
const props={userId:'test-user',dateKey:'2026-10-12',setDateKey(){},sessions:[],gymTemplates:{chest:{baseRows:[{exercise:'Жим штанги лёжа',sets:'3',reps:'10',weight:'50'}]}},onSaveTemplate:async()=>{},onBack(){},onHistory(){},onSave:async()=>{},onTrainerRequest(){},onTrainerWorkout(){}};
async function mount(p=props){root=createRoot(document.getElementById('root'));await React.act(async()=>root.render(React.createElement(Gym,p)));}
async function unmount(){await React.act(async()=>root.unmount());}
test('manual draft survives unmount, reload and external template refresh',async()=>{
 localStorage.clear();await mount();const field=()=>document.querySelector('input[aria-label="Жим штанги лёжа: вес"]');await input(field(),'62,5');assert.equal(field().value,'62,5');
 await React.act(async()=>root.render(React.createElement(Gym,{...props,gymTemplates:{chest:{baseRows:[{exercise:'Жим штанги лёжа',weight:'100'}]}}})));assert.equal(field().value,'62,5');
 await unmount();await mount();assert.equal(field().value,'62,5');
 await click(button('Спина'));await click(button('Грудь'));assert.equal(field().value,'62,5');
 await click(document.querySelector('.exercise-select-button'));await input(document.querySelector('.exercise-search'),'жим гантелей');assert.ok([...document.querySelectorAll('.exercise-picker-list button')].some(b=>b.textContent.includes('отрицательным')));await click(button('отрицательным'));assert.ok(document.querySelector('.exercise-select-button').textContent.includes('отрицательным'));
 await unmount();await mount();assert.ok(document.querySelector('.exercise-select-button').textContent.includes('отрицательным'));await unmount();
});
test('save retains failed drafts and prevents simultaneous double completion',async()=>{
 localStorage.clear();let attempts=0,resolve;const p={...props,onSave:async()=>{attempts++;await new Promise(r=>{resolve=r})}};await mount(p);await input(document.querySelector('input[aria-label="Жим штанги лёжа: вес"]'),'61');
 await click(button('Сохранить тренировку'));await click(button('Сохраняем'));assert.equal(attempts,1);assert.ok([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).some(k=>k.includes('gym-draft')));
 await React.act(async()=>resolve());assert.equal([...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).filter(k=>k.includes('gym-draft')).length,0);await unmount();
 await mount({...props,onSave:async()=>{throw Error('offline')}});await input(document.querySelector('input[aria-label="Жим штанги лёжа: вес"]'),'63');await click(button('Сохранить тренировку'));assert.ok(document.querySelector('[role="alert"]').textContent.includes('offline'));await unmount();await mount();assert.equal(document.querySelector('input[aria-label="Жим штанги лёжа: вес"]').value,'63');await unmount();
});
// Supabase is bundled as a separate client in Coach; intercept its browser transport instead of asserting an invented live session.
test('coach starts with empty actual values and restores results after closure',async()=>{
 localStorage.clear();
 const plan={id:'00000000-0000-4000-8000-000000000001',title:'Тренировка',exercises:[{exercise:'Тяга с упором',sets:2,reps:'10–12',weight:25,comment:'Опора грудью'}]};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{const u=String(url);if(u.includes('/functions/v1/trainer-access'))return Response.json({active:true});if(u.includes('coach_workout_plans'))return Response.json(plan);if(u.includes('/sessions'))return Response.json([]);return Response.json({});};
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'test-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,100));});
 const field=()=>document.querySelector('input[aria-label="Тяга с упором: Вес, кг"]');assert.ok(field(),document.body.textContent);assert.equal(field().value,'');await input(field(),'23,5');await unmount();
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'test-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,100));});assert.equal(field().value,'23,5');await unmount();globalThis.fetch=original;
});
test.after(async()=>{supabase.auth.stopAutoRefresh();supabase.auth.broadcastChannel?.close();await rm('.gym-test-build',{recursive:true,force:true});dom.window.close();});
