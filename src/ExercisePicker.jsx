import {useEffect,useRef,useState} from 'react';
import {findExercises} from './exercise-catalog.js';
export default function ExercisePicker({value,onChange,group='all',extra=[]}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');const input=useRef(null),opener=useRef(null);
 const options=findExercises(query,group,[value,...extra]);
 useEffect(()=>{if(!open)return;input.current?.focus();const key=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);opener.current?.focus();}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[open]);
 function choose(name){onChange(name);setOpen(false);opener.current?.focus();}
 return <>
  <button ref={opener} type="button" className="exercise-select-button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setQuery('');setOpen(true);}}>{value||'Выбрать упражнение'}<span>⌄</span></button>
  {open&&<div className="modal-backdrop exercise-picker-backdrop" onClick={()=>setOpen(false)}><section className="exercise-picker glass-card" role="dialog" aria-modal="true" aria-label="Выбор упражнения" onClick={e=>e.stopPropagation()}>
   <header><h3>Выбрать упражнение</h3><button type="button" aria-label="Закрыть поиск" onClick={()=>setOpen(false)}>×</button></header>
   <input ref={input} className="exercise-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск: жим гантелей, тяга…" aria-label="Поиск упражнений"/>
   <small>{options.length} вариантов · можно прокручивать</small>
   <div className="exercise-picker-list">{options.map(x=><button type="button" className={x.name===value?'selected':''} key={x.name} onClick={()=>choose(x.name)}>{x.name}</button>)}{!options.length&&<p>В каталоге пока нет такого варианта.</p>}</div>
   {query.trim()&&!options.some(x=>x.name===query.trim())&&<button type="button" className="secondary-dark" onClick={()=>choose(query.trim().slice(0,180))}>Использовать своё название: {query.trim().slice(0,80)}</button>}
   {value&&<button type="button" className="secondary-dark" onClick={()=>choose('')}>Очистить выбор</button>}
  </section></div>}
 </>;
}
