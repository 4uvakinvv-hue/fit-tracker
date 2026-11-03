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
async function input(el,value){await React.act(async()=>{const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
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
test('coach screen prefills suggestions, collapses notes and preserves edited results',async()=>{
 localStorage.clear();
 const plan={id:'00000000-0000-4000-8000-000000000001',title:'Тренировка',notes:'Разминка и общее правило восстановления',exercises:[{exercise:'Тяга с упором',sets:2,reps:'10–12',weight:25,comment:'Опора грудью'}]};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{const u=String(url);if(u.includes('/functions/v1/trainer-access'))return Response.json({active:true});if(u.includes('coach_workout_plans'))return Response.json(plan);if(u.includes('/sessions'))return Response.json([]);return Response.json({});};
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'test-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,100));});
 const field=()=>document.querySelector('input[aria-label="Тяга с упором: Вес, кг"]');assert.ok(field(),document.body.textContent);assert.equal(field().value,'25');assert.equal(document.querySelector('input[aria-label="Тяга с упором: Подходы"]').value,'2');assert.equal(document.querySelector('input[aria-label="Тяга с упором: Повторения, ср."]').value,'10');assert.ok(document.querySelector('main.coach-workout-screen'));assert.equal(document.querySelector('.modal-backdrop'),null);assert.equal(document.querySelector('#coach-general-notes'),null);assert.ok(document.querySelector('textarea.coach-wishes-input'));assert.equal(document.querySelector('.coach-comment-editor'),null);assert.equal(document.querySelector('.coach-rir-fields'),null);
 const heading=document.querySelector('.coach-workout-heading'),summary=document.querySelector('.coach-volume-summary'),firstExercise=document.querySelector('.coach-exercise-card');
 assert.equal(document.querySelector('input[type="date"]'),null);assert.ok(summary.textContent.includes('Тоннаж тренировки:'));assert.ok(summary.textContent.includes('500 кг'));assert.ok(heading.compareDocumentPosition(summary)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(summary.compareDocumentPosition(firstExercise)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
 await click(button('Общие рекомендации'));assert.ok(document.querySelector('#coach-general-notes').textContent.includes('Разминка'));await click(document.querySelector('button[aria-label="Тяга с упором: комментарий"]'));assert.ok(document.querySelector('textarea'));await input(field(),'23,5');assert.ok(summary.textContent.includes('470 кг'));await input(document.querySelector('textarea.coach-wishes-input'),'Больше внимания ягодицам');await unmount();
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'test-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,100));});assert.equal(field().value,'23,5');assert.equal(document.querySelector('textarea.coach-wishes-input').value,'Больше внимания ягодицам');await unmount();globalThis.fetch=original;
});
test('coach completion assigns the current Moscow date without a user date field',async()=>{
 localStorage.clear();let saved;
 const plan={id:'00000000-0000-4000-8000-000000000002',title:'Сегодняшняя тренировка',exercises:[{exercise:'Жим лёжа',sets:2,reps:8,weight:40}]};
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{const u=String(url);if(u.includes('/functions/v1/trainer-access'))return Response.json({active:true});if(u.includes('coach_workout_plans'))return Response.json(plan);if(u.includes('/sessions'))return Response.json([]);return Response.json({});};
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'date-user',onClose(){},onSave:async payload=>{saved=payload;}}));await new Promise(r=>setTimeout(r,100));});
 assert.equal(document.querySelector('input[type="date"]'),null);await click(button('Сохранить тренировку'));
 const expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 assert.equal(saved.date,expected);await unmount();globalThis.fetch=original;
});
test('coach cards show three latest results and superset badges',async()=>{
 localStorage.clear();
 const plan={id:'00000000-0000-4000-8000-000000000003',title:'Грудь',exercises:[
  {exercise:'Жим штанги лёжа',sets:3,reps:'8–10',weight:80,comment:'Отдых 3 минуты.'},
  {exercise:'Разгибание рук стоя на верхнем блоке',sets:3,reps:'10–12',weight:30,superset:'A',comment:'Отдых 2 минуты.'},
  {exercise:'Махи гантелями в стороны стоя',sets:3,reps:'12–15',weight:10,weightBasis:'per_hand',superset:'A',comment:'Отдых 90 секунд после пары.'}]};
 const history=[
  {date:'2026-11-02',base_rows:[{exercise:'Махи гантелями в стороны стоя',sets:'3',reps:'12',weight:'12'}]},
  {date:'2026-10-30',base_rows:[{exercise:'Жим штанги лёжа',sets:'3',reps:'7',weight:'90'},{exercise:'Махи гантелями в стороны стоя',sets:'4',reps:'12',weight:'12'}]},
  {date:'2026-10-26',base_rows:[{exercise:'Махи гантелями в стороны стоя',sets:'4',reps:'16',weight:'10'}]},
  {date:'2026-10-21',base_rows:[{exercise:'Жим штанги лёжа',sets:'3',reps:'8',weight:'80'},{exercise:'Махи гантелями в стороны стоя',sets:'3',reps:'15',weight:'9'}]}];
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>{const u=String(url);if(u.includes('/functions/v1/trainer-access'))return Response.json({active:true});if(u.includes('coach_workout_plans'))return Response.json(plan);if(u.includes('/sessions')&&u.includes('base_rows'))return Response.json(history);if(u.includes('/sessions'))return Response.json([]);return Response.json({});};
 root=createRoot(document.getElementById('root'));await React.act(async()=>{root.render(React.createElement(Coach,{userId:'history-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,100));});
 const cards=[...document.querySelectorAll('.coach-exercise-card')];assert.equal(cards.length,3,document.body.textContent);
 const lines=card=>[...card.querySelectorAll('.coach-last-result')].map(x=>x.textContent);
 assert.ok(cards[0].querySelector('.coach-last-results').textContent.startsWith('Прошлые:'));
 assert.deepEqual(lines(cards[0]).map(x=>x.slice(0,5)),['30.10','21.10']);
 assert.deepEqual(lines(cards[2]).map(x=>x.slice(0,5)),['02.11','30.10','26.10'],'only the three newest, newest first');
 assert.ok(lines(cards[2])[0].includes('3 × 12 · 12 кг'));
 assert.equal(cards[1].querySelector('.coach-last-results'),null);
 assert.equal(cards[0].querySelector('.coach-superset-badge'),null);
 assert.equal(cards[1].querySelector('.coach-superset-badge').textContent,'Суперсет A · 1/2');
 assert.equal(cards[2].querySelector('.coach-superset-badge').textContent,'Суперсет A · 2/2');
 assert.equal(cards[1].querySelector('.coach-superset-rest').textContent,'Без отдыха → упражнение 3');
 assert.ok(cards[2].querySelector('.coach-card-info>small').textContent.includes('Отдых 90 секунд после пары'));
 assert.ok(cards[1].classList.contains('coach-superset-continues')&&cards[2].classList.contains('coach-superset-continued'));
 await unmount();globalThis.fetch=original;
});
test('coach training control is prominent and rejects inactive access',async()=>{
 localStorage.clear();
 let opened=0;
 const original=globalThis.fetch;
 globalThis.fetch=async(url)=>String(url).includes('/functions/v1/trainer-access')?Response.json({active:false}):Response.json({});
 await mount({...props,onTrainerWorkout(){opened++}});
 await React.act(async()=>new Promise(r=>setTimeout(r,90)));
 const control=button('Тренировка от тренера');
 assert.ok(control);
 assert.ok(document.querySelector('.gym-coach-top')?.contains(control));
 await click(control);
 assert.equal(opened,0);
 assert.ok(document.querySelector('[role="status"]')?.textContent||document.body.textContent.includes('Заказать тренера'));
 assert.ok(button('Заказать тренера'));
 await unmount();
 globalThis.fetch=original;
});
test('new authorized members see one-time intake before first plan',async()=>{
 localStorage.clear();
 const old=globalThis.fetch;
 globalThis.fetch=async(url)=>{
  const u=String(url);
  if(u.includes('/functions/v1/trainer-access'))return Response.json({active:true});
  if(u.includes('coach_workout_plans'))return Response.json(null);
  if(u.includes('coach_intakes'))return Response.json(null);
  return Response.json([]);
 };
 root=createRoot(document.getElementById('root'));
 await React.act(async()=>{root.render(React.createElement(Coach,{userId:'intake-user',onClose(){},onSave:async()=>{}}));await new Promise(r=>setTimeout(r,110));});
 assert.ok(document.querySelector('.coach-intake-form'),document.body.textContent);
 assert.ok(document.querySelector('input[type="number"][min="18"]'));
 assert.ok(document.body.textContent.includes('Главная цель'));
 assert.ok(document.body.textContent.includes('Отправить и подготовить тренировку'));
 await unmount();
 globalThis.fetch=old;
});
test.after(async()=>{supabase.auth.stopAutoRefresh();supabase.auth.broadcastChannel?.close();await rm('.gym-test-build',{recursive:true,force:true});dom.window.close();});
