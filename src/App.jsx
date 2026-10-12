import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import TrainerModal from './TrainerModal.jsx';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BackgroundGeolocation } from '@capgo/background-geolocation';
import { Health } from '@capgo/capacitor-health';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';

const APP_VERSION = '1.10.0';
const ANDROID_APK_URL = 'https://github.com/4uvakinvv-hue/fit-tracker/releases/download/android-current/forma-android.apk';
const IOS_INSTALL_URL = 'https://4uvakinvv-hue.github.io/fit-tracker/';

const OUTDOOR_MODES = [
  { id: 'bike', label: 'Вело', icon: '🚴', accent: 'amber', bonusAvgLimit: 50 },
  { id: 'run', label: 'Бег', icon: '🏃', accent: 'run', bonusAvgLimit: 30 },
  { id: 'hike', label: 'ПВД / Поход', icon: '△', accent: 'hike' },
  { id: 'moto', label: 'Мото', icon: '🏍️', accent: 'moto' },
];

const ACTIVITIES = [
  { id: 'gym', label: 'Тренажёрка', icon: '🏋︎', accent: 'violet' },
  { id: 'outdoor', label: 'Вело / Бег / ПВД / Мото', icon: '⌁', accent: 'amber' },
  { id: 'workout', label: 'Воркаут', icon: '┬', accent: 'coral' },
  { id: 'combat', label: 'Единоборства', icon: '🥊', accent: 'combat' },
  { id: 'crossfit', label: 'CrossFit', icon: '⚡', accent: 'crossfit' },
];

const GYM_GROUPS = [
  { id: 'chest', label: 'Грудь', icon: '◈' },
  { id: 'back', label: 'Спина', icon: '╫' },
  { id: 'legs', label: 'Ноги', icon: '⋔' },
  { id: 'custom', label: 'Своё', icon: '✦' },
];

const BASE_EXERCISES = {
  chest: ['Жим штанги лёжа','Жим гантелей лёжа','Жим в тренажёре','Отжимания на брусьях','Отжимания с весом','Жим штанги на наклонной'],
  back: ['Подтягивания','Тяга вертикального блока','Тяга горизонтального блока','Тяга штанги в наклоне','Тяга гантели к поясу','Становая тяга'],
  legs: ['Приседания со штангой','Жим ногами','Выпады','Румынская тяга','Болгарские выпады','Гакк-присед'],
};

const ACCESSORY_EXERCISES = [
  'Махи гантелей в стороны','Жим гантелей сидя','Разведения в наклоне','Тяга каната к лицу',
  'Подъём гантелей на бицепс','Сгибание рук со штангой','Французский жим','Разгибание рук на блоке',
  'Скручивания на пресс','Подъём ног на пресс','Подъёмы на носки',
];

function localDateKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function dateFromKey(key){const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d,12);}
function addDays(date,amount){const r=new Date(date);r.setDate(r.getDate()+amount);return r;}
function mondayOf(date){
  const r=new Date(date);
  const offset=(r.getDay()+6)%7;
  r.setDate(r.getDate()-offset);
  r.setHours(12,0,0,0);
  return r;
}
function addMonths(date,amount){const r=new Date(date);r.setMonth(r.getMonth()+amount);return r;}
function addYears(date,amount){const r=new Date(date);r.setFullYear(r.getFullYear()+amount);return r;}
function daysBetween(a,b){return Math.round((dateFromKey(b)-dateFromKey(a))/86400000);}
function formatDate(key,options={day:'numeric',month:'long'}){return new Intl.DateTimeFormat('ru-RU',options).format(dateFromKey(key));}
function formatDateShort(key){return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(dateFromKey(key));}
function activityMeta(type){
  return ACTIVITIES.find(a=>a.id===type)
    ||OUTDOOR_MODES.find(a=>a.id===type)
    ||(type==='walk'?{id:'walk',label:'Прогулка',icon:'🚶',accent:'green'}:null)
    ||(type==='steps'?{id:'steps',label:'Шаги',icon:'👣',accent:'green'}:null);
}
function activityLabel(item){return item?.customTitle||activityMeta(item?.type)?.label||'';}
const ALL_GYM_EXERCISES=[...new Set([...Object.values(BASE_EXERCISES).flat(),...ACCESSORY_EXERCISES,
  'Горизонтальная тяга с опорой груди','Сгибание ног в тренажёре','Сгибание рук на бицепс в блоке',
])];

function makeRows(n){return Array.from({length:n},()=>({exercise:'',sets:'',reps:'',weight:'',comment:''}));}
function normalizeRows(rows,n){return Array.from({length:n},(_,i)=>({
  exercise:rows?.[i]?.exercise||'',
  sets:rows?.[i]?.sets??'',
  reps:rows?.[i]?.reps??'',
  weight:rows?.[i]?.weight??'',
  comment:rows?.[i]?.comment||''
}));}
function rowTonnage(row){
  return Math.max(0,Number(row?.sets)||0)*Math.max(0,Number(row?.reps)||0)*Math.max(0,Number(row?.weight)||0);
}
function workoutTonnage(baseRows=[],extraRows=[]){
  return [...baseRows,...extraRows].reduce((sum,row)=>sum+rowTonnage(row),0);
}
function formatKg(value){return Math.round(Number(value)||0).toLocaleString('ru-RU');}
function stepPoints(steps){
  return Math.max(0,Number(steps)||0)>=15000?5:0;
}
function mapSession(row){
  return {
    ...row,
    gymGroup:row.gym_group,baseRows:row.base_rows||[],extraRows:row.extra_rows||[],
    workoutText:row.workout_text||'',combatType:row.combat_type||'',
    hikeDays:Number(row.hike_days)||0,hikeDistance:Number(row.hike_distance)||0,
    ratingEligible:row.rating_eligible===true,trackingMode:row.tracking_mode||'manual',
    gpsVerified:row.gps_verified===true,movingDuration:Number(row.moving_duration)||0,
    avgSpeed:row.avg_speed==null?null:(Number(row.avg_speed)||0),maxSpeed:Number(row.max_speed)||0,
    routePoints:Array.isArray(row.route_points)?row.route_points:[],
    startedAt:row.started_at||null,endedAt:row.ended_at||null,
    editedAt:row.edited_at||null,distanceCorrected:row.distance_corrected===true,
    stopDuration:Number(row.stop_duration)||0,stopCount:Number(row.stop_count)||0,
    transportDistance:Number(row.transport_distance)||0,
    confirmed:row.confirmed!==false,
  };
}
function isFuture(key){return key>localDateKey();}
function isQualifyingSession(s){return s.confirmed!==false&&s.date<=localDateKey()&&(s.type!=='walk'||Number(s.steps||0)>=10000);}
function isRatingSession(s){return s.confirmed!==false&&s.ratingEligible===true&&s.date<=localDateKey()&&['gym','bike','run','workout','hike','combat','crossfit','moto'].includes(s.type);}
function isStatsSession(s){return s.confirmed!==false&&s.date<=localDateKey();}
function isHistorySession(s){return s.confirmed!==false&&s.date<=localDateKey();}
function ratingActiveDates(sessions,dailySteps=[],expeditionDays=[]){
  const set=new Set();
  sessions.filter(isRatingSession).forEach(s=>set.add(s.date));
  dailySteps.filter(x=>Number(x.steps||0)>=15000&&x.date<=localDateKey()).forEach(x=>set.add(x.date));
  expeditionDays.filter(x=>x.verified!==false&&x.event_date<=localDateKey()).forEach(x=>set.add(x.event_date));
  return [...set].sort();
}
function streakState(sessions,dailySteps=[],expeditionDays=[],asOfKey=localDateKey()){
  const season=seasonMeta(dateFromKey(asOfKey));
  const dates=ratingActiveDates(sessions,dailySteps,expeditionDays).filter(d=>d>=season.start&&d<=asOfKey);
  let streak=0,closedSeries=0,prevCounted=null,recoveryDate=null,lastClosureDate=null;
  for(const date of dates){
    if(recoveryDate&&date===recoveryDate){
      recoveryDate=null;prevCounted=null;streak=0;
      continue;
    }
    if(recoveryDate&&date>recoveryDate){
      recoveryDate=null;prevCounted=null;streak=0;
    }
    if(prevCounted&&daysBetween(prevCounted,date)===1)streak+=1;
    else streak=1;
    prevCounted=date;
    if(streak===6){
      closedSeries+=1;lastClosureDate=date;
      recoveryDate=localDateKey(addDays(dateFromKey(date),1));
      prevCounted=null;streak=0;
    }
  }
  const isRecovery=!!lastClosureDate&&localDateKey(addDays(dateFromKey(lastClosureDate),1))===asOfKey;
  const latest=dates[dates.length-1]||null;
  let day=lastClosureDate===asOfKey?6:streak;
  if(isRecovery)day=0;
  else if(latest&&daysBetween(latest,asOfKey)>1)day=0;
  return {day,closedSeries,isRecovery,lastClosureDate,activeToday:dates.includes(asOfKey)};
}
function currentStreakLength(sessions,dailySteps=[],expeditionDays=[]){return streakState(sessions,dailySteps,expeditionDays).day;}
function gpsBonusForSession(s){
  if(!s?.gpsVerified||s.avgSpeed==null)return 0;
  const distance=Number(s.distance||s.hikeDistance||0);
  const avg=Number(s.avgSpeed);
  return s.type==='bike'&&distance>100&&Number.isFinite(avg)&&avg<=50?5:0;
}
function canEditSession(s){
  if(!s?.created_at)return false;
  const created=new Date(s.created_at).getTime();
  return Number.isFinite(created)&&Date.now()-created<=24*60*60*1000;
}
function average(values){const clean=values.map(Number).filter(Number.isFinite);return clean.length?clean.reduce((a,b)=>a+b,0)/clean.length:0;}
function haversineKm(a,b){
  const R=6371,rad=n=>n*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function classifyHikeRoute(points=[]){
  const out=points.map(p=>({...p,segment:'walk'}));
  let candidate=[],candidateSeconds=0,inTransport=false;
  const markCandidate=()=>{candidate.forEach(i=>{if(out[i])out[i].segment='transport';});};
  for(let i=1;i<out.length;i++){
    const a=out[i-1],b=out[i],dt=Math.max(0,(Number(b.t)-Number(a.t))/1000);
    if(dt<=0||dt>180){candidate=[];candidateSeconds=0;inTransport=false;continue;}
    const km=haversineKm(a,b),derived=km/(dt/3600);
    const device=Number.isFinite(Number(b.speedKmh))?Math.max(0,Number(b.speedKmh)):null;
    const speed=device==null?derived:device;
    if(speed>10){
      candidate.push(i);candidateSeconds+=dt;
      if(inTransport||candidateSeconds>=45){inTransport=true;markCandidate();}
    }else{
      candidate=[];candidateSeconds=0;inTransport=false;
    }
  }
  return out;
}
function summarizeRoute(points=[],type='bike'){
  if(points.length<2)return {points:[...points],distance:0,totalSeconds:0,movingSeconds:0,stopSeconds:0,stopCount:0,transportDistance:0,avgSpeed:0,maxSpeed:0};
  const prepared=type==='hike'?classifyHikeRoute(points):points.map(p=>({...p}));
  let distance=0,movingSeconds=0,stopSeconds=0,stopCount=0,transportDistance=0,maxSpeed=0,candidateStop=0,candidateDistance=0;
  const stopLogic=type==='bike'||type==='run'||type==='moto';
  const threshold=type==='bike'?1.8:type==='run'?1.0:3.0;
  const minStopSeconds=type==='moto'?120:10;
  const flushCandidate=()=>{if(candidateStop>=minStopSeconds){stopSeconds+=candidateStop;stopCount+=1;}else{movingSeconds+=candidateStop;distance+=candidateDistance;}candidateStop=0;candidateDistance=0;};
  for(let i=1;i<prepared.length;i++){
    const a=prepared[i-1],b=prepared[i],dt=Math.max(0,(Number(b.t)-Number(a.t))/1000);if(dt<=0)continue;
    const km=haversineKm(a,b),derived=km/(dt/3600),device=Number.isFinite(Number(b.speedKmh))?Math.max(0,Number(b.speedKmh)):null,observed=device==null?derived:device;
    maxSpeed=Math.max(maxSpeed,observed);
    if(type==='hike'){
      if(b.segment==='transport'){transportDistance+=km;continue;}
      distance+=km;movingSeconds+=dt;continue;
    }
    if(!stopLogic){distance+=km;movingSeconds+=dt;continue;}
    const accuracyOk=(a.accuracy==null||Number(a.accuracy)<=60)&&(b.accuracy==null||Number(b.accuracy)<=60);
    if(dt>(type==='moto'?240:15)){flushCandidate();distance+=km;movingSeconds+=dt;continue;}
    const jitterLimit=type==='moto'?0.015:0.006;
    const stationary=accuracyOk&&observed<threshold&&km<jitterLimit;
    if(stationary){candidateStop+=dt;candidateDistance+=km;}else{flushCandidate();distance+=km;movingSeconds+=dt;}
  }
  flushCandidate();
  const totalSeconds=Math.max(0,(Number(prepared[prepared.length-1].t)-Number(prepared[0].t))/1000);
  movingSeconds=Math.max(0,Math.min(totalSeconds,movingSeconds));
  const avgSpeed=movingSeconds>0?distance/(movingSeconds/3600):0;
  return {points:prepared,distance,totalSeconds,movingSeconds,stopSeconds,stopCount,transportDistance,avgSpeed,maxSpeed};
}
function compactRoutePoints(points=[],max=1200){
  if(points.length<=max)return points;
  const stride=Math.ceil(points.length/max),out=points.filter((_,i)=>i%stride===0);
  if(out[out.length-1]!==points[points.length-1])out.push(points[points.length-1]);return out;
}
function routePlot(points=[],width=100,height=60,pad=5){
  if(!points.length)return [];
  const avgLat=points.reduce((s,p)=>s+Number(p.lat||0),0)/points.length,cos=Math.cos(avgLat*Math.PI/180)||1;
  const raw=points.map(p=>({x:Number(p.lng||0)*cos,y:Number(p.lat||0)})),xs=raw.map(p=>p.x),ys=raw.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(maxX-minX,1e-7),dy=Math.max(maxY-minY,1e-7);
  const scale=Math.min((width-pad*2)/dx,(height-pad*2)/dy),usedW=dx*scale,usedH=dy*scale,ox=(width-usedW)/2,oy=(height-usedH)/2;
  return raw.map((p,i)=>({x:ox+(p.x-minX)*scale,y:height-(oy+(p.y-minY)*scale),segment:points[i]?.segment||'walk'}));
}
function formatDuration(seconds){
  const total=Math.max(0,Math.round(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return h?`${h} ч ${String(m).padStart(2,'0')} мин`:`${m} мин ${String(s).padStart(2,'0')} сек`;
}
function downloadRoutePng(data,type,dateKey){
  const points=data.routePoints||data.points||[];if(points.length<2)return;
  const mode=activityMeta(type)||{label:'Маршрут'},canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
  const ctx=canvas.getContext('2d'),themes={bike:['#171f2c','#f2aa45','#ffd68a'],run:['#1d1825','#ec7566','#ffc0aa'],hike:['#13221d','#63d3a1','#bcebcf']},[bg,line,accent]=themes[type]||themes.bike;
  ctx.fillStyle=bg;ctx.fillRect(0,0,canvas.width,canvas.height);
  const g=ctx.createRadialGradient(920,90,20,920,90,520);g.addColorStop(0,line+'44');g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#f6f4f2';ctx.font='700 48px system-ui,sans-serif';ctx.fillText(`Форма · ${mode.label}`,58,72);
  ctx.fillStyle='#9aa8b5';ctx.font='26px system-ui,sans-serif';ctx.fillText(formatDate(dateKey,{day:'numeric',month:'long',year:'numeric'}),58,112);
  const plot=routePlot(points,720,400,28);
  if(plot.length){ctx.save();ctx.translate(50,170);ctx.lineWidth=10;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(plot[0].x,plot[0].y);plot.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();ctx.fillStyle='#72e6a9';ctx.beginPath();ctx.arc(plot[0].x,plot[0].y,13,0,Math.PI*2);ctx.fill();const last=plot[plot.length-1];ctx.fillStyle=accent;ctx.beginPath();ctx.arc(last.x,last.y,13,0,Math.PI*2);ctx.fill();ctx.restore();}
  const distance=Number(data.distance)||0,avg=Number(data.avgSpeed??data.avg_speed)||0,max=Number(data.maxSpeed??data.max_speed)||0,total=Number(data.totalSeconds??data.duration)||0,moving=Number(data.movingSeconds??data.movingDuration??data.moving_duration)||0;
  const metrics=[['Дистанция',`${distance.toFixed(1)} км`],['Общее время',formatDuration(total)],['В движении',formatDuration(moving)],['Средняя скорость',`${avg.toFixed(1)} км/ч`],['Максимальная скорость',`${max.toFixed(1)} км/ч`]];
  let y=205;metrics.forEach(([label,value])=>{ctx.fillStyle='#8f9ca8';ctx.font='22px system-ui,sans-serif';ctx.fillText(label,820,y);ctx.fillStyle='#ffffff';ctx.font='700 32px system-ui,sans-serif';ctx.fillText(value,820,y+36);y+=90;});
  canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`forma-${type}-${dateKey}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);},'image/png');
}
let formaAudioContext=null;
function ensureAudioContext(){
  try{if(!formaAudioContext)formaAudioContext=new (window.AudioContext||window.webkitAudioContext)();if(formaAudioContext.state==='suspended')formaAudioContext.resume().catch(()=>{});return formaAudioContext;}catch{return null;}
}
function playTone(freq=880,duration=.1,volume=.08,type='sine',delay=0){
  const ctx=ensureAudioContext();if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+delay;o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+duration+.03);
}
function playMetalStrike(delay=0,strong=false){
  const ctx=ensureAudioContext();if(!ctx)return;
  const base=strong?410:445,partials=[1,1.37,1.91,2.72,3.66,5.12];
  partials.forEach((p,i)=>playTone(base*p,strong?1.25:.9,(strong?.23:.18)/(1+i*.46),i%2?'triangle':'sine',delay));
  const length=Math.floor(ctx.sampleRate*(strong?.22:.14)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.025));
  const src=ctx.createBufferSource(),gain=ctx.createGain(),t=ctx.currentTime+delay;src.buffer=buffer;gain.gain.setValueAtTime(strong?.24:.18,t);gain.gain.exponentialRampToValueAtTime(.0001,t+(strong?.32:.22));src.connect(gain);gain.connect(ctx.destination);src.start(t);
}
function playRoundGong(){playMetalStrike(0,false);navigator.vibrate?.([65,35,95]);}
function playFinalGong(){playMetalStrike(0,true);playMetalStrike(.62,true);playMetalStrike(1.24,true);navigator.vibrate?.([110,70,110,70,150]);}
function playCoinEffect(){
  ensureAudioContext();const notes=[[1750,0],[2400,.055],[1380,.13],[2050,.19],[2850,.29],[1580,.38],[2320,.5]];
  notes.forEach(([f,d],i)=>{playTone(f,.22,.16,'triangle',d);playTone(f*1.52,.14,.075,'sine',d+.012);});
  navigator.vibrate?.([24,25,42]);
}
function playBonusHookahEffect(){
  ensureAudioContext();[[660,0],[880,.12],[1100,.24],[1320,.4]].forEach(([f,d])=>{playTone(f,.42,.15,'sine',d);playTone(f*2,.25,.055,'triangle',d+.015);});navigator.vibrate?.([35,35,70,40,90]);
}
async function requestDeviceNotificationPermission(){
  try{if(Capacitor.isNativePlatform()){const res=await LocalNotifications.requestPermissions();return res?.display==='granted';}if('Notification' in window){return (await Notification.requestPermission())==='granted';}}catch(err){console.warn('Forma notification permission',err);}return false;
}
async function showDeviceNotification(title,body,id=Date.now()){
  try{if(Capacitor.isNativePlatform()){const perm=await LocalNotifications.checkPermissions();if(perm?.display!=='granted')return;await LocalNotifications.schedule({notifications:[{id:Math.abs(Number(id)||Date.now())%2147483000,title,body,schedule:{at:new Date(Date.now()+120)}}]});}else if('Notification' in window&&Notification.permission==='granted'){new Notification(title,{body,icon:import.meta.env.BASE_URL+'icon.svg'});}}catch(err){console.warn('Forma device notification failed',err);}
}
function feedCategory(type){return type==='new_user'?'new_user':(type==='gps_started'||type==='gps_finished'?'gps':'activity');}
function feedEventCopy(event){
  const name=event.actor_name||'Участник',p=event.payload||{},meta=activityMeta(event.activity_type),label=meta?.label||event.activity_type||'активность';
  if(event.event_type==='new_user')return {title:'Новый участник',body:'К Forma присоединился '+name};
  if(event.event_type==='gps_started')return {title:name+' начал тренировку',body:label+' · GPS-запись началась'};
  if(event.event_type==='gps_finished'){const km=Number(p.distance||0),extra=km?' · '+km.toFixed(1)+' км':'';return {title:name+' завершил тренировку',body:(event.title||label)+extra};}
  const km=Number(p.distance||0),days=Number(p.hike_days||0),extra=km?' · '+km.toFixed(1)+' км':(days?' · '+days+' дн.':'');return {title:name,body:(event.title||label)+extra};
}
function routeMetrics(data,type){
  const distance=Number(data.distance)||0,total=Number(data.totalSeconds??data.duration)||0,moving=Number(data.movingSeconds??data.movingDuration??data.moving_duration)||0,stops=Number(data.stopCount??data.stop_count)||0,stopSeconds=Number(data.stopSeconds??data.stopDuration??data.stop_duration)||0,transport=Number(data.transportDistance??data.transport_distance)||0,avg=Number(data.avgSpeed??data.avg_speed)||0,max=Number(data.maxSpeed??data.max_speed)||0;
  if(type==='hike'){
    const rows=[['Пешком',distance.toFixed(1)+' км'],['Общее время',formatDuration(total)]];
    if(transport>0)rows.push(['Транспорт',transport.toFixed(1)+' км']);
    return rows;
  }
  const rows=[['Дистанция',distance.toFixed(1)+' км'],['Общее время',formatDuration(total)]];
  if(type==='bike'||type==='run'||type==='moto'){
    rows.push(['В движении',formatDuration(moving)]);
    rows.push([type==='moto'?'Отдых':'Остановки',stops+' · '+formatDuration(stopSeconds)]);
  }
  rows.push(['Средняя скорость',avg.toFixed(1)+' км/ч'],['Максимальная скорость',max.toFixed(1)+' км/ч']);
  return rows;
}
function drawRoutePoster(data,type,dateKey,transparent=false){
  const points=data.routePoints||data.points||[];if(points.length<2)return null;const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d'),meta=activityMeta(type)||{label:'Маршрут'},themes={bike:['#111a26','#f2aa45','#ffd68a'],run:['#21171e','#ec7566','#ffc0aa'],hike:['#102019','#63d3a1','#bcebcf'],moto:['#17181c','#f0b34e','#f8dc9a']},theme=themes[type]||themes.bike,bg=theme[0],line=theme[1],accent=theme[2];
  if(!transparent){ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1920);const g=ctx.createRadialGradient(820,180,20,820,180,760);g.addColorStop(0,line+'55');g.addColorStop(1,'#00000000');ctx.fillStyle=g;ctx.fillRect(0,0,1080,1920);}ctx.textBaseline='alphabetic';ctx.shadowColor=transparent?'rgba(0,0,0,.8)':'transparent';ctx.shadowBlur=transparent?14:0;ctx.fillStyle='#fff';ctx.font='800 58px system-ui,sans-serif';ctx.fillText('Форма · '+meta.label,70,105);ctx.fillStyle=transparent?'#fff':'#aab5c0';ctx.font='32px system-ui,sans-serif';ctx.fillText(formatDate(dateKey,{day:'numeric',month:'long',year:'numeric'}),70,155);
  const plot=routePlot(points,930,920,55);if(plot.length){ctx.save();ctx.translate(75,230);ctx.lineWidth=14;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=line;for(let i=1;i<plot.length;i++){ctx.setLineDash(plot[i].segment==='transport'?[28,20]:[]);ctx.beginPath();ctx.moveTo(plot[i-1].x,plot[i-1].y);ctx.lineTo(plot[i].x,plot[i].y);ctx.stroke();}ctx.setLineDash([]);ctx.fillStyle='#65e6a8';ctx.beginPath();ctx.arc(plot[0].x,plot[0].y,17,0,Math.PI*2);ctx.fill();const last=plot[plot.length-1];ctx.fillStyle=accent;ctx.beginPath();ctx.arc(last.x,last.y,17,0,Math.PI*2);ctx.fill();ctx.restore();}
  const metrics=routeMetrics(data,type),cellH=160,startY=1235;metrics.forEach(([label,value],i)=>{const col=i%2,row=Math.floor(i/2),x=70+col*500,y=startY+row*cellH;if(!transparent){ctx.fillStyle='rgba(255,255,255,.055)';ctx.beginPath();ctx.roundRect(x,y,440,130,24);ctx.fill();}ctx.fillStyle=transparent?'rgba(255,255,255,.9)':'#95a4b2';ctx.font='28px system-ui,sans-serif';ctx.fillText(label,x+22,y+40);ctx.fillStyle='#fff';ctx.font='800 40px system-ui,sans-serif';ctx.fillText(value,x+22,y+92);});return canvas;
}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});}
async function saveCanvasPng(canvas,filename){
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG не создан');
  if(Capacitor.isNativePlatform()){const data=await blobToBase64(blob);let file;try{file=await Filesystem.writeFile({path:filename,data,directory:Directory.Documents,recursive:true});}catch(err){console.warn('Forma Documents PNG fallback',err);file=await Filesystem.writeFile({path:filename,data,directory:Directory.Cache});}try{await Share.share({title:'Forma · маршрут',url:file.uri,dialogTitle:'Сохранить или отправить PNG'});}catch(err){console.warn('Forma PNG share',err);}return 'PNG готов';}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1600);return 'PNG скачан';
}
async function exportRoutePng(data,type,dateKey,transparent=false){const canvas=drawRoutePoster(data,type,dateKey,transparent);if(!canvas)throw new Error('Для экспорта нужен GPS-маршрут');return saveCanvasPng(canvas,'forma-'+type+'-'+dateKey+(transparent?'-transparent':'')+'.png');}

function withDynamicNumbers(list){
  const eligible=[...list]
    .filter(isQualifyingSession)
    .sort((a,b)=>a.date.localeCompare(b.date)||String(a.created_at||'').localeCompare(String(b.created_at||''))||String(a.id).localeCompare(String(b.id)));
  const map=new Map(eligible.map((s,i)=>[s.id,i+1]));
  return list.map(s=>({...s,displayNumber:map.get(s.id)||null}));
}

function seasonKey(date=new Date()){
  const m=date.getMonth()+1;
  if(m===12||m<=2)return 'winter';
  if(m<=5)return 'spring';
  if(m<=8)return 'summer';
  return 'autumn';
}

function seasonMeta(date=new Date()){
  const m=date.getMonth()+1;
  let start,name;
  if(m===12){start=new Date(date.getFullYear(),11,1,12);name='зима';}
  else if(m<=2){start=new Date(date.getFullYear()-1,11,1,12);name='зима';}
  else if(m<=5){start=new Date(date.getFullYear(),2,1,12);name='весна';}
  else if(m<=8){start=new Date(date.getFullYear(),5,1,12);name='лето';}
  else {start=new Date(date.getFullYear(),8,1,12);name='осень';}
  const end=addDays(addMonths(start,3),-1);
  const day=daysBetween(localDateKey(start),localDateKey(date))+1;
  const total=daysBetween(localDateKey(start),localDateKey(end))+1;
  const previousStart=addMonths(start,-3);
  const pm=previousStart.getMonth()+1;
  const previousName=pm===12?'зима':pm===3?'весна':pm===6?'лето':'осень';
  return {name,start:localDateKey(start),end:localDateKey(end),day,total,previousName};
}

const HOOKAH_PHASE_50=[2,2,1,2,2,2,1,2,2,2,2,2,2,1];
const HOOKAH_PHASE_40=[2,1,2,1,2,1,1,2,1,2,1,2,1,1];
function hookahDayPlan(dateKey,programStartOn){
  if(!programStartOn||dateKey<programStartOn)return {phase:60,slots:2,slotValue:500,label:'Базовый режим'};
  const d=daysBetween(programStartOn,dateKey);
  if(d<14)return {phase:50,slots:HOOKAH_PHASE_50[Math.max(0,d)%14],slotValue:500,label:'50 / месяц'};
  if(d<28)return {phase:40,slots:HOOKAH_PHASE_40[(d-14)%14],slotValue:500,label:'40 / месяц'};
  const cycle=(d-28)%30;
  return {phase:30,slots:1,slotValue:cycle%3===2?666:667,label:'30 / месяц'};
}
function ordinaryHookahEvents(events=[]){return events.filter(h=>!h.isBonus);}
function hookahCountForDate(events,key){return ordinaryHookahEvents(events).filter(h=>h.event_date===key).length;}
function hookahEarningForDay(events,key,programStartOn){
  const plan=hookahDayPlan(key,programStartOn),used=Math.min(hookahCountForDate(events,key),plan.slots);
  return Math.max(0,plan.slots-used)*plan.slotValue;
}
function hookahBonusState(events=[],todayKey=localDateKey()){
  const date=dateFromKey(todayKey);
  if(date.getDay()!==0)return {eligible:false,used:false,weekCount:0};
  const monday=localDateKey(addDays(date,-6)),saturday=localDateKey(addDays(date,-1));
  const weekCount=ordinaryHookahEvents(events).filter(h=>h.event_date>=monday&&h.event_date<=saturday).length;
  const used=events.some(h=>h.event_date===todayKey&&h.isBonus);
  return {eligible:weekCount<=2&&!used,used,weekCount};
}

function pointEvents(sessions,dailySteps=[],hookahEvents=[],expeditionDays=[]){
  const season=seasonMeta(),byDate=new Map();
  function day(date){if(!byDate.has(date))byDate.set(date,{date,gpsBonus:0,createdAt:''});return byDate.get(date);}
  sessions.filter(s=>isRatingSession(s)&&s.date>=season.start&&s.date<=season.end).forEach(s=>{const d=day(s.date);d.gpsBonus=Math.max(d.gpsBonus,gpsBonusForSession(s));d.createdAt=String(s.created_at||d.createdAt||'');});
  dailySteps.filter(x=>x.date>=season.start&&x.date<=season.end&&Number(x.steps||0)>=15000).forEach(x=>day(x.date));
  expeditionDays.filter(x=>x.verified!==false&&x.event_date>=season.start&&x.event_date<=season.end).forEach(x=>day(x.event_date));
  const ordered=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),events=[];
  let streak=0,closed=0,prevCounted=null,recoveryDate=null,penaltyAnchor=null,sportBalance=0;
  for(const d of ordered){
    let recoveryActivity=false;
    if(recoveryDate&&d.date===recoveryDate){
      recoveryActivity=true;prevCounted=null;streak=0;penaltyAnchor=d.date;recoveryDate=null;
    }else{
      if(recoveryDate&&d.date>recoveryDate){penaltyAnchor=recoveryDate;prevCounted=null;streak=0;recoveryDate=null;}
      if(penaltyAnchor){
        const gap=daysBetween(penaltyAnchor,d.date),penalty=Math.max(gap-4,0);
        if(penalty>0){const applied=Math.min(sportBalance,penalty);sportBalance-=applied;if(applied>0)events.push({id:'pause-'+d.date,date:d.date,delta:-applied,reasons:'Пауза: −1 за каждый день после трёх дней без активности'});}
      }
      if(prevCounted&&daysBetween(prevCounted,d.date)===1)streak+=1;else streak=1;
      prevCounted=d.date;penaltyAnchor=d.date;
    }
    let streakBonus=recoveryActivity?0:Math.max(streak-1,0);
    const delta=5+streakBonus+d.gpsBonus;sportBalance+=delta;
    const reasons=['Активный день: +5'];
    if(recoveryActivity)reasons.push('День восстановления · серия не продолжается');
    else if(streakBonus)reasons.push('Серия '+streak+' дн.: +'+streakBonus);
    if(d.gpsBonus)reasons.push('GPS-вело более 100 км: +5');
    events.push({id:'activity-'+d.date,date:d.date,createdAt:d.createdAt,delta,reasons:reasons.join(' · ')});
    if(!recoveryActivity&&streak===6){closed+=1;recoveryDate=localDateKey(addDays(dateFromKey(d.date),1));penaltyAnchor=recoveryDate;prevCounted=null;streak=0;}
  }
  const anchor=recoveryDate||penaltyAnchor;
  if(anchor){const penalty=Math.max(daysBetween(anchor,localDateKey())-3,0),applied=Math.min(sportBalance,penalty);if(applied>0)events.push({id:'inactivity-'+localDateKey(),date:localDateKey(),delta:-applied,reasons:'Нет активности более трёх дней: −1 за день'});}
  hookahEvents.filter(h=>!h.isBonus&&h.event_date>=season.start&&h.event_date<=season.end).forEach(h=>events.push({id:'hookah-'+h.id,date:h.event_date,createdAt:h.smoked_at||'',delta:-2,reasons:'Вредная привычка'}));
  hookahEvents.filter(h=>h.isBonus&&h.event_date>=season.start&&h.event_date<=season.end).forEach(h=>events.push({id:'hookah-bonus-'+h.id,date:h.event_date,createdAt:h.smoked_at||'',delta:0,reasons:'Бонусный кальян · 0 баллов'}));
  return events.sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
}
function scoreHint(sessions,dailySteps=[],expeditionDays=[]){
  const state=streakState(sessions,dailySteps,expeditionDays);
  if(state.isRecovery)return 'Серия №'+state.closedSeries+' закрыта · сегодня восстановление';
  const dates=ratingActiveDates(sessions,dailySteps,expeditionDays);if(!dates.length)return 'Первый активный день даст +5 баллов';
  const latest=dates[dates.length-1],gap=daysBetween(latest,localDateKey());
  if(gap===0&&state.day)return 'Серия: день '+state.day+' из 6 · сегодня уже в зачёте';
  if(gap<=1){const next=Math.min(6,(state.day||0)+1),bonus=Math.max(0,next-1);return bonus?'Сегодня: +5 +'+bonus+' за серию':'Сегодня начинается новая серия: +5';}
  return 'Серия прервана · новый активный день даст +5';
}

function sessionValue(s){
  if(s.type==='bike'||s.type==='run'||s.type==='moto')return s.distance?`${Number(s.distance).toLocaleString('ru-RU')} км`:'Без километража';
  if(s.type==='walk')return s.steps?`${Number(s.steps).toLocaleString('ru-RU')} шагов`:'Без шагов';
  if(s.type==='workout')return s.workoutText?'Описание':'Воркаут';
  if(s.type==='combat')return s.combatType||'Единоборства';
  if(s.type==='hike'){const km=Number(s.distance||s.hikeDistance||0),days=Math.max(Number(s.hikeDays)||1,1);return km?`${km.toLocaleString('ru-RU')} км`:`${days} дн.`;}
  if(s.type==='gym')return GYM_GROUPS.find(g=>g.id===s.gymGroup)?.label||'Тренажёрка';
  if(s.type==='crossfit')return s.duration?formatDuration(s.duration):'CrossFit';
  return '';
}

function ActivityGlyph({type,className=''}) {
  if(type==='outdoor') return <svg className={'activity-svg route-activity-icon '+className} viewBox="0 0 64 64" aria-hidden="true"><circle cx="11" cy="49" r="5"/><circle cx="53" cy="15" r="5"/><path d="M16 47c12-2 8-18 21-20 8-1 8-9 11-10"/><path d="m43 14 5 3-3 5"/></svg>;
  if(type==='run') return <span className={className}>🏃</span>;
  if(type==='bike') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><circle cx="16" cy="43" r="10"/><circle cx="49" cy="43" r="10"/><path d="M16 43 27 24l10 19H16Zm11-19h11l11 19M25 18h9m4 6 6-7h6m-1 0 5 2"/></svg>;
  if(type==='workout') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M10 12v42M54 12v42M10 16h44"/><circle cx="32" cy="25" r="5"/><path d="M32 30v15M32 33 21 22M32 33l11-11M32 45l-8 9M32 45l8 9"/></svg>;
  if(type==='steps') return <span className={className}>👣</span>;
  if(type==='hike') return <svg className={`activity-svg ${className}`} viewBox="0 0 64 64" aria-hidden="true"><path d="M5 51 23 23l9 14 8-12 19 26H5Z"/><path d="m18 31 5-8 5 8m8 2 4-8 5 7"/><path d="M12 51h40"/></svg>;
  if(type==='moto') return <span className={className}>🏍️</span>;
  if(type==='crossfit') return <span className={className}>⚡</span>;
  const meta=activityMeta(type);
  return <span className={className}>{meta?.icon||'•'}</span>;
}

function Brand({compact=false}){
  return <div className={`logo-lockup ${compact?'compact':''}`}>
    <img className="brand-app-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt=""/>
    <span>Форма</span>
  </div>;
}

function SplashScreen({progress=8,stage='Запуск приложения'}){
  const value=Math.max(0,Math.min(100,Math.round(Number(progress)||0)));
  return <main className="splash-screen splash-v18">
    <img className="splash-v18-image" src={`${import.meta.env.BASE_URL}splash-v1.8.jpg`} alt="Форма"/>
    <div className="splash-v18-overlay"/>
    <div className="splash-v18-progress">
      <div className="splash-v18-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={value}><i style={{width:value+'%'}}/></div>
      <strong>{stage}</strong>
    </div>
  </main>;
}

function AuthScreen(){
  const [loginEmail,setLoginEmail]=useState('');
  const [loginPassword,setLoginPassword]=useState('');
  const [registerOpen,setRegisterOpen]=useState(false);
  const [name,setName]=useState('');
  const [registerEmail,setRegisterEmail]=useState('');
  const [registerPassword,setRegisterPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState('');

  async function login(e){
    e.preventDefault();
    setBusy('login');setMessage('');
    try{
      const {error}=await supabase.auth.signInWithPassword({email:loginEmail.trim(),password:loginPassword});
      if(error)throw error;
    }catch(err){setMessage(err.message||'Не получилось войти.');}
    finally{setBusy('');}
  }

  async function register(e){
    e.preventDefault();
    setBusy('register');setMessage('');
    try{
      if(!name.trim())throw new Error('Укажи имя.');
      const {data,error}=await supabase.auth.signUp({
        email:registerEmail.trim(),
        password:registerPassword,
        options:{
          data:{name:name.trim(),app_name:'Форма'},
          emailRedirectTo:'https://4uvakinvv-hue.github.io/fit-tracker/'
        }
      });
      if(error)throw error;
      if(!data.session)setMessage('Аккаунт создан. На почту отправлено письмо подтверждения для приложения «Форма».');
    }catch(err){setMessage(err.message||'Не получилось зарегистрироваться.');}
    finally{setBusy('');}
  }

  return <main className={`onboarding dark-screen auth-screen season-${seasonKey()}`}>
    <Brand/>
    <p className="brand-subtitle season-brand-label">Сезон {seasonMeta().name.toUpperCase()}</p>
    <h1>Вход</h1>
    <p className="soft-text">Уже зарегистрированы — просто войдите. Новый участник может создать аккаунт ниже на этом же экране.</p>

    <form className="glass-card onboarding-form login-form" onSubmit={login}>
      <label className="dark-field"><span>E-mail</span><input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} placeholder="Пароль" required/></label>
      <button className="gradient-button" disabled={busy==='login'}>{busy==='login'?'Входим…':'Войти'}</button>
    </form>

    <div className="register-entry">
      <span>Впервые в «Форме»?</span>
      <button onClick={()=>{setRegisterOpen(v=>!v);setMessage('');}}>{registerOpen?'Свернуть регистрацию':'Регистрация'}</button>
    </div>

    {registerOpen&&<form className="glass-card onboarding-form register-form" onSubmit={register}>
      <label className="dark-field"><span>Имя</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя в рейтинге" required/></label>
      <label className="dark-field"><span>E-mail</span><input type="email" value={registerEmail} onChange={e=>setRegisterEmail(e.target.value)} placeholder="you@example.com" required/></label>
      <label className="dark-field"><span>Пароль</span><input type="password" value={registerPassword} onChange={e=>setRegisterPassword(e.target.value)} placeholder="Минимум 6 символов" minLength={6} required/></label>
      <button className="gradient-button" disabled={busy==='register'}>{busy==='register'?'Создаём аккаунт…':'Создать аккаунт'}</button>
    </form>}

    {message&&<p className="auth-message auth-global-message">{message}</p>}
    <p className="build-version">Версия {APP_VERSION}</p>
    <p style={{fontSize:11}}><a href="https://platform.fatsecret.com">Powered by fatsecret Platform API</a></p>
  </main>;
}
export default function App(){
  const [authSession,setAuthSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [members,setMembers]=useState([]);
  const [previousTop5,setPreviousTop5]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [schedule,setSchedule]=useState({});
  const [gymTemplates,setGymTemplates]=useState({});
  const [dailySteps,setDailySteps]=useState([]);
  const [expeditionDays,setExpeditionDays]=useState([]);
  const [isBoss,setIsBoss]=useState(false);
  const [trainerOpen,setTrainerOpen]=useState(false);
  const [hookahEvents,setHookahEvents]=useState([]);
  const [adminNotifications,setAdminNotifications]=useState([]);
  const [hookahStartedOn,setHookahStartedOn]=useState(localDateKey());
  const [hookahProgramStartedOn,setHookahProgramStartedOn]=useState('2026-10-12');
  const [undoHookahId,setUndoHookahId]=useState(null);
  const [saveNotice,setSaveNotice]=useState('');
  const [stepsStatus,setStepsStatus]=useState('loading');
  const [stepsSyncing,setStepsSyncing]=useState(false);
  const [screen,setScreen]=useState('home');
  const [selectedDateKey,setSelectedDateKey]=useState(localDateKey());
  const [draftDateKey,setDraftDateKey]=useState(localDateKey());
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [booting,setBooting]=useState(true);
  const [bootProgress,setBootProgress]=useState(8);
  const [bootStage,setBootStage]=useState('Запуск приложения');
  const bootStartedAt=useRef(Date.now());

  const numberedSessions=useMemo(()=>withDynamicNumbers(sessions),[sessions]);

  useEffect(()=>{
    let active=true;
    let initialized=false;
    const timeout=new Promise(resolve=>setTimeout(()=>resolve({data:{session:null}}),2600));
    const finishAfterMinimum=()=>{
      const wait=Math.max(0,2000-(Date.now()-bootStartedAt.current));
      setTimeout(()=>{if(active)setBooting(false);},wait);
    };

    setBootProgress(12);setBootStage('Проверяем вход');
    Promise.race([supabase.auth.getSession().catch(()=>({data:{session:null}})),timeout]).then(result=>{
      if(!active)return;
      initialized=true;
      const next=result?.data?.session||null;
      setBootProgress(next?28:100);
      setBootStage(next?'Загружаем профиль':'Готово');
      setAuthSession(next);
      if(!next)finishAfterMinimum();
    });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(!active)return;
      setAuthSession(next);
      if(!next&&initialized){
        setBootProgress(100);setBootStage('Готово');
        const wait=Math.max(0,2000-(Date.now()-bootStartedAt.current));
        setTimeout(()=>{if(active)setBooting(false);},wait);
      }
    });

    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    window.history.replaceState({...window.history.state,formaScreen:'home',formaDepth:0},'');
    setScreen('home');
    const onPop=e=>setScreen(e.state?.formaScreen||'home');
    window.addEventListener('popstate',onPop);
    return ()=>window.removeEventListener('popstate',onPop);
  },[]);

  useEffect(()=>{
    let handle;
    NativeApp.addListener('backButton',()=>{
      const depth=window.history.state?.formaDepth||0;
      if(depth>0)window.history.back();
      else NativeApp.minimizeApp().catch(()=>{});
    }).then(h=>{handle=h;}).catch(()=>{});

    return ()=>{handle?.remove?.();};
  },[]);

  useEffect(()=>{
    let handle;
    NativeApp.addListener('appStateChange',async({isActive})=>{
      if(!isActive)return;

      try{
        const timeout=new Promise(resolve=>setTimeout(()=>resolve(null),5000));
        const refreshed=await Promise.race([
          supabase.auth.refreshSession().catch(()=>null),
          timeout
        ]);
        const nextSession=refreshed?.data?.session;

        if(nextSession){
          setAuthSession(nextSession);
          await loadData(true,nextSession);
          await syncSteps(false,nextSession);
          return;
        }

        const {data}=await supabase.auth.getSession();
        if(data?.session){
          setAuthSession(data.session);
          await loadData(true,data.session);
          await syncSteps(false,data.session);
        }
      }catch(err){
        console.warn('Forma resume refresh failed',err);
      }
    }).then(h=>{handle=h;}).catch(()=>{});

    return ()=>{handle?.remove?.();};
  },[]);

  useEffect(()=>{
    let active=true;
    if(authSession?.user){
      setBooting(true);setBootProgress(34);setBootStage('Загружаем данные');
      (async()=>{
        const ok=await loadData(false,authSession,{onProgress:(p,label)=>{if(active){setBootProgress(p);setBootStage(label);}}});
        if(!active)return;
        if(!ok){
          const wait=Math.max(0,2000-(Date.now()-bootStartedAt.current));
          setTimeout(()=>{if(active)setBooting(false);},wait);
          return;
        }
        setBootProgress(82);setBootStage('Синхронизируем шаги');
        await syncSteps(false,authSession);
        if(!active)return;
        setBootProgress(100);setBootStage('Готово');
        const wait=Math.max(0,2000-(Date.now()-bootStartedAt.current));
        setTimeout(()=>{if(active)setBooting(false);},wait);
      })();
    }else{
      setLoading(false);setProfile(null);setMembers([]);setPreviousTop5([]);
      setSessions([]);setSchedule({});setGymTemplates({});setDailySteps([]);
      setIsBoss(false);setHookahEvents([]);setAdminNotifications([]);setUndoHookahId(null);
      setStepsStatus('loading');
    }
    return ()=>{active=false;};
  },[authSession?.user?.id]);

  useEffect(()=>{
    if(!isBoss||!authSession?.user)return;
    let active=true;

    const refresh=async()=>{
      try{
        const {data,error}=await supabase
          .from('admin_notifications')
          .select('id,type,title,member_name,member_email,created_at,read_at')
          .eq('recipient_user_id',authSession.user.id)
          .order('created_at',{ascending:false})
          .limit(200);
        if(error)throw error;
        if(active)setAdminNotifications(data||[]);
      }catch(err){
        console.warn('Forma admin notifications refresh failed',err);
      }
    };

    refresh();
    const timer=setInterval(refresh,30000);
    return ()=>{active=false;clearInterval(timer);};
  },[isBoss,authSession?.user?.id]);


  async function syncSteps(requestPermission=false,sessionOverride=authSession){
    if(!sessionOverride?.user||stepsSyncing)return;
    setStepsSyncing(true);

    async function loadStoredSteps(){
      const start=addYears(new Date(),-1);
      start.setHours(0,0,0,0);
      const {data,error}=await supabase
        .from('daily_steps')
        .select('date,steps')
        .eq('user_id',sessionOverride.user.id)
        .gte('date',localDateKey(start))
        .order('date',{ascending:true});
      if(error)throw error;
      const rows=(data||[]).map(x=>({date:x.date,steps:Number(x.steps)||0}));
      setDailySteps(rows);
      return rows;
    }

    try{
      const availability=await Health.isAvailable();
      if(!availability?.available){
        const stored=await loadStoredSteps();
        setStepsStatus(stored.length?'synced':'web');
        return;
      }

      const authOptions={read:['steps'],write:[],requestHistoryAccess:true};
      let authorization=await Health.checkAuthorization(authOptions);

      if(!authorization?.readAuthorized?.includes('steps')){
        if(!requestPermission){
          setStepsStatus('permission');
          return;
        }

        authorization=await Health.requestAuthorization(authOptions);
        if(!authorization?.readAuthorized?.includes('steps')){
          setStepsStatus('permission');
          return;
        }
      }

      const start=addYears(new Date(),-1);
      start.setHours(0,0,0,0);
      const end=new Date();

      const result=await Health.queryAggregated({
        dataType:'steps',
        startDate:start.toISOString(),
        endDate:end.toISOString(),
        bucket:'day',
        aggregation:'sum',
      });

      const userId=sessionOverride.user.id;
      const byDate=new Map();

      (result?.samples||[]).forEach(sample=>{
        const date=localDateKey(new Date(sample.startDate));
        const value=Math.max(0,Math.round(Number(sample.value)||0));
        byDate.set(date,Math.max(value,byDate.get(date)||0));
      });

      const rows=[...byDate.entries()].map(([date,steps])=>({
        user_id:userId,
        date,
        steps,
        source:'health_connect',
        updated_at:new Date().toISOString(),
      }));

      if(rows.length){
        const {error}=await supabase.from('daily_steps').upsert(rows,{onConflict:'user_id,date'});
        if(error)throw error;
      }

      await loadStoredSteps();
      setStepsStatus('ready');
      await loadData(true,sessionOverride);
    }catch(err){
      console.warn('Forma steps sync failed',err);
      setStepsStatus('error');
    }finally{
      setStepsSyncing(false);
    }
  }

  function navigate(next){
    if(next===screen)return;
    const depth=(window.history.state?.formaDepth||0)+1;
    window.history.pushState({...window.history.state,formaScreen:next,formaDepth:depth},'');
    setScreen(next);
  }

  function goBack(fallback='home'){
    const depth=window.history.state?.formaDepth||0;
    if(depth>0)window.history.back();
    else setScreen(fallback);
  }

  function resetHome(){
    const depth=window.history.state?.formaDepth||0;
    if(depth>0)window.history.go(-depth);
    else setScreen('home');
  }

  async function loadData(silent=false,sessionOverride=authSession,progress={}){
    if(!sessionOverride?.user)return;
    if(!silent){
      setLoading(true);
      setLoadError('');
    }
    const userId=sessionOverride.user.id;

    try{
      progress.onProgress?.(44,'Подключаемся к базе');
      const queries=Promise.all([
        supabase.from('profiles').select('*').eq('id',userId).single(),
        supabase.rpc('current_leaderboard'),
        supabase.rpc('previous_season_top5'),
        supabase.from('sessions').select('*').eq('user_id',userId).order('date',{ascending:true}).order('created_at',{ascending:true}),
        supabase.from('plans').select('*').eq('user_id',userId),
        supabase.from('gym_templates').select('*').eq('user_id',userId),
        supabase.from('daily_steps').select('date,steps').eq('user_id',userId).gte('date',localDateKey(addYears(new Date(),-1))).order('date',{ascending:true}),
        supabase.from('expedition_days').select('event_date,distance,point_count,verified').eq('user_id',userId).gte('event_date',localDateKey(addYears(new Date(),-1))).order('event_date',{ascending:true}),
        supabase.from('boss_users').select('user_id,hookah_started_on,hookah_program_started_on').eq('user_id',userId).maybeSingle(),
        supabase.from('hookah_events').select('id,event_date,smoked_at,is_bonus').eq('user_id',userId).order('smoked_at',{ascending:true}),
        supabase.from('admin_notifications').select('id,type,title,member_name,member_email,created_at,read_at').eq('recipient_user_id',userId).order('created_at',{ascending:false}).limit(200),
      ]);

      const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),9000));
      const [profileRes,leaderRes,previousRes,sessionsRes,plansRes,templatesRes,stepsRes,expeditionRes,bossRes,hookahRes,notificationsRes]=await Promise.race([queries,timeout]);
      progress.onProgress?.(68,'Собираем тренировки и статистику');

      if(profileRes.error)throw profileRes.error;
      if(leaderRes.error)throw leaderRes.error;
      if(previousRes.error)throw previousRes.error;

      const leaderboard=leaderRes.data||[];
      const me=leaderboard.find(x=>x.id===userId);
      if(profileRes.data)setProfile({...profileRes.data,points:me?.points||0,rank:me?.rank||null,seriesCount:Number(me?.series_count)||0});
      setMembers(leaderboard);
      setPreviousTop5(previousRes.data||[]);
      const loadedSessions=(sessionsRes.data||[]).map(mapSession);
      setSessions(loadedSessions);

      const plans={};
      (plansRes.data||[]).forEach(p=>{
        const completedOnDate=loadedSessions.some(s=>s.date===p.date&&isQualifyingSession(s));
        const forcedStatus=completedOnDate?'completed':'planned';
        plans[p.date]={type:p.type,status:forcedStatus,customTitle:p.custom_title||'',updatedAt:p.updated_at};
      });
      setSchedule(plans);

      const templates={};
      (templatesRes.data||[]).forEach(t=>{templates[t.gym_group]={baseRows:t.base_rows||[],extraRows:t.extra_rows||[]};});
      setGymTemplates(templates);
      setDailySteps((stepsRes.data||[]).map(x=>({date:x.date,steps:Number(x.steps)||0})));
      setExpeditionDays((expeditionRes.data||[]).map(x=>({...x,distance:Number(x.distance)||0,pointCount:Number(x.point_count)||0})));
      const boss=!!bossRes.data;
      setIsBoss(boss);
      setHookahStartedOn(bossRes.data?.hookah_started_on||localDateKey());
      setHookahProgramStartedOn(bossRes.data?.hookah_program_started_on||'2026-10-12');
      setHookahEvents(boss?(hookahRes.data||[]).map(h=>({...h,isBonus:h.is_bonus===true})):[]);
      setAdminNotifications(boss?(notificationsRes.data||[]):[]);
      progress.onProgress?.(78,'Подготавливаем главный экран');
      return true;
    }catch(err){
      console.error('Forma load error',err);
      if(!silent)setLoadError('Не удалось связаться с общей базой. Проверь интернет и нажми «Повторить».');
      return false;
    }finally{
      if(!silent)setLoading(false);
    }
  }

  async function savePlan(date,type,customTitle='',status='planned'){
    if(!authSession?.user)return;
    const finalStatus=isFuture(date)?'planned':status;
    const {error}=await supabase.from('plans').upsert({
      user_id:authSession.user.id,date,type,custom_title:customTitle||null,status:finalStatus,updated_at:new Date().toISOString()
    });
    if(error)throw error;
    setSchedule(cur=>({...cur,[date]:{type,status:finalStatus,customTitle,updatedAt:Date.now()}}));
  }

  async function deletePlan(date){
    if(!authSession?.user)return;
    await supabase.from('plans').delete().eq('user_id',authSession.user.id).eq('date',date);
    setSchedule(cur=>{const next={...cur};delete next[date];return next;});
  }

  async function sendProposal(title){
    if(!authSession?.user||!title.trim())return;
    const {error}=await supabase.from('activity_proposals').insert({user_id:authSession.user.id,title:title.trim()});
    if(error)throw error;
  }

  function openAdd(){
    setDraftDateKey(selectedDateKey||localDateKey());
    navigate('add-training');
  }

  async function chooseType(type){
    if(type==='outdoor'){navigate('outdoor');return;}
    await savePlan(draftDateKey,type,'','planned');navigate(type);
  }

  async function saveSession(payload){
    if(isFuture(payload.date)){
      await savePlan(payload.date,payload.type,payload.title||'','planned');
      setSelectedDateKey(payload.date);
      resetHome();
      return;
    }

    const lowWalk=payload.type==='walk'&&Number(payload.steps||0)<10000;
    const row={
      user_id:authSession.user.id,
      number:null,
      type:payload.type,
      date:payload.date,
      title:payload.title||null,
      distance:payload.distance??null,
      duration:payload.duration??null,
      steps:payload.steps??null,
      workout_text:payload.workoutText||null,
      combat_type:payload.combatType||null,
      hike_days:payload.hikeDays??null,
      hike_distance:payload.hikeDistance??null,
      gym_group:payload.gymGroup||null,
      base_rows:payload.baseRows||null,
      extra_rows:payload.extraRows||null,
      rating_eligible:payload.ratingEligible??(payload.type==='moto'?false:(payload.date===localDateKey())),
      tracking_mode:payload.trackingMode||'manual',
      gps_verified:payload.gpsVerified===true,
      moving_duration:payload.movingDuration??null,
      stop_duration:payload.stopDuration??null,
      stop_count:payload.stopCount??0,
      transport_distance:payload.transportDistance??null,
      avg_speed:payload.avgSpeed??null,
      max_speed:payload.maxSpeed??null,
      route_points:payload.routePoints||null,
      started_at:payload.startedAt||null,
      ended_at:payload.endedAt||null,
      confirmed:true,
    };

    const {error}=await supabase.from('sessions').insert(row);
    if(error)throw error;

    await savePlan(payload.date,payload.type,payload.title||'',lowWalk?'planned':'completed');
    if(payload.type==='gym'){
      const tonnage=workoutTonnage(payload.baseRows||[],payload.extraRows||[]);
      setSaveNotice(`Тренировка сохранена · тоннаж ${formatKg(tonnage)} кг`);
      setTimeout(()=>setSaveNotice(''),3500);
    }
    setSelectedDateKey(payload.date);
    await loadData();
    resetHome();
  }

  async function saveExpedition(payload){
    if(!authSession?.user)throw new Error('Нужно войти в Forma.');
    const days=(payload.days||[]).filter(d=>d.date&&Number(d.pointCount||0)>=2);
    if(!days.length)throw new Error('Недостаточно контрольных GPS-точек для подтверждения дней похода.');
    const row={
      user_id:authSession.user.id,number:null,type:'hike',date:payload.startDate,
      title:payload.title||'Многодневный поход',distance:payload.distance??0,duration:payload.duration??null,
      hike_days:days.length,hike_distance:payload.distance??0,rating_eligible:false,
      tracking_mode:'expedition',gps_verified:true,moving_duration:payload.movingDuration??null,
      transport_distance:payload.transportDistance??null,route_points:payload.routePoints||null,
      started_at:payload.startedAt||null,ended_at:payload.endedAt||null,confirmed:true,
    };
    const {data:sessionRow,error}=await supabase.from('sessions').insert(row).select('id').single();
    if(error)throw error;
    const dayRows=days.map(d=>({
      session_id:sessionRow.id,user_id:authSession.user.id,event_date:d.date,
      distance:Math.max(0,Number(d.distance)||0),point_count:Math.max(0,Number(d.pointCount)||0),verified:true,
    }));
    const {error:dayError}=await supabase.from('expedition_days').insert(dayRows);
    if(dayError){await supabase.from('sessions').delete().eq('id',sessionRow.id);throw dayError;}
    await savePlan(payload.startDate,'hike',row.title,'completed');
    setSelectedDateKey(payload.startDate);
    await loadData();
    resetHome();
  }

  async function updateSession(id,patch={}){
    const target=sessions.find(s=>s.id===id);
    if(!target)throw new Error('Тренировка не найдена.');
    if(!canEditSession(target))throw new Error('Редактирование доступно только 24 часа после сохранения.');

    const changes={
      title:(patch.title??target.title??activityMeta(target.type)?.label??'').trim()||null,
      edited_at:new Date().toISOString(),
    };
    if(['bike','run','hike','moto'].includes(target.type)&&patch.distance!==undefined){
      const nextDistance=Math.max(0,Number(patch.distance)||0);
      changes.distance=nextDistance;
      changes.distance_corrected=Math.abs(nextDistance-Number(target.distance||target.hikeDistance||0))>0.0001||target.distanceCorrected;
      if(target.type==='hike')changes.hike_distance=nextDistance;
    }

    const {error}=await supabase.from('sessions').update(changes).eq('id',id).eq('user_id',authSession.user.id);
    if(error)throw error;
    await savePlan(target.date,target.type,changes.title||'','completed');
    await loadData(true);
  }

  async function deleteSession(id){
    const target=sessions.find(s=>s.id===id);
    if(!target)return;

    const {error}=await supabase.from('sessions').delete().eq('id',id);
    if(error)throw error;

    const remaining=sessions
      .filter(s=>s.id!==id&&s.date===target.date&&isHistorySession(s))
      .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));

    if(remaining.length){
      const last=remaining[0];
      await savePlan(last.date,last.type,last.title||'',isQualifyingSession(last)?'completed':'planned');
    }else{
      await deletePlan(target.date);
    }

    await loadData();
  }

  async function saveTemplate(group,baseRows,extraRows){
    const {error}=await supabase.from('gym_templates').upsert({
      user_id:authSession.user.id,gym_group:group,base_rows:baseRows,extra_rows:extraRows,updated_at:new Date().toISOString()
    });
    if(error)throw error;
    setGymTemplates(cur=>({...cur,[group]:{baseRows,extraRows}}));
  }

  async function addHookah(){
    if(!isBoss||!authSession?.user)return;
    const today=localDateKey();
    const {data,error}=await supabase.from('hookah_events').insert({
      user_id:authSession.user.id,
      event_date:today,
      is_bonus:false,
    }).select('id,event_date,smoked_at,is_bonus').single();
    if(error)throw error;
    setUndoHookahId(data.id);
    setTimeout(()=>setUndoHookahId(cur=>cur===data.id?null:cur),15000);
    await loadData(true);
  }

  async function addBonusHookah(){
    if(!isBoss||!authSession?.user)return;
    ensureAudioContext();
    const {data,error}=await supabase.rpc('claim_hookah_bonus');
    if(error)throw error;
    if(data?.length)playBonusHookahEffect();
    await loadData(true);
  }

  async function undoHookah(){
    if(!isBoss||!undoHookahId)return;
    const {error}=await supabase.from('hookah_events').delete().eq('id',undoHookahId).eq('user_id',authSession.user.id);
    if(error)throw error;
    setUndoHookahId(null);
    await loadData(true);
  }

  async function markNotificationsRead(){
    if(!isBoss||!authSession?.user)return;
    const unread=adminNotifications.filter(n=>!n.read_at).map(n=>n.id);
    if(!unread.length)return;
    const readAt=new Date().toISOString();
    const {error}=await supabase
      .from('admin_notifications')
      .update({read_at:readAt})
      .in('id',unread)
      .eq('recipient_user_id',authSession.user.id);
    if(error)throw error;
    setAdminNotifications(cur=>cur.map(n=>unread.includes(n.id)?{...n,read_at:readAt}:n));
  }

  function requestTrainer(){setTrainerOpen(true);}

  if(booting||(authSession&&loading))return <SplashScreen progress={bootProgress} stage={bootStage}/>;
  if(!authSession)return <AuthScreen/>;
  if(loadError)return <main className="onboarding dark-screen"><Brand/><h1>Связь с базой</h1><p className="soft-text">{loadError}</p><div className="glass-card onboarding-form"><button className="gradient-button" onClick={loadData}>Повторить</button></div></main>;

  return <div className={`app-shell-dark season-${seasonKey()} screen-${screen}`}>
    {screen==='home'&&<Home schedule={schedule} sessions={numberedSessions} profile={profile} dailySteps={dailySteps} expeditionDays={expeditionDays} saveNotice={saveNotice} isBoss={isBoss} adminNotifications={adminNotifications} onTrainer={requestTrainer} onMarkNotificationsRead={markNotificationsRead} hookahEvents={hookahEvents} hookahProgramStartedOn={hookahProgramStartedOn} canUndoHookah={!!undoHookahId} onHookah={addHookah} onBonusHookah={addBonusHookah} onUndoHookah={undoHookah} stepsStatus={stepsStatus} stepsSyncing={stepsSyncing} onEnableSteps={()=>syncSteps(true,authSession)} onOpenSteps={()=>navigate('steps-history')} onOpenFeed={()=>navigate('feed')} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey} onSavePlan={savePlan} onDeletePlan={deletePlan} onProposal={sendProposal} onOpenWorkout={openAdd}/>} 
    {screen==='history'&&<History sessions={numberedSessions} onDelete={deleteSession} onUpdate={updateSession}/>}
    {screen.startsWith('history-')&&screen!=='steps-history'&&<History sessions={numberedSessions} onDelete={deleteSession} onUpdate={updateSession} filterType={screen.slice(8)}/>} 
    {screen==='steps-history'&&<StepsHistoryV17 dailySteps={dailySteps} onBack={()=>goBack('home')}/>}
    {screen==='stats'&&<StatisticsV17 sessions={numberedSessions} dailySteps={dailySteps} isBoss={isBoss} hookahEvents={hookahEvents} hookahStartedOn={hookahStartedOn} hookahProgramStartedOn={hookahProgramStartedOn} profile={profile} memberCount={members.length} onOpenMembers={()=>navigate('members')} onOpenHistory={type=>navigate('history-'+type)} onOpenSteps={()=>navigate('steps-history')}/>} 
    {screen==='members'&&<MembersV17 members={members} profile={profile} previousTop5={previousTop5}/>} 
    {screen==='feed'&&<FeedScreen profile={profile}/>} 
    {screen==='add-training'&&<AddTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} onProposal={sendProposal} onBack={()=>goBack('home')} onChoose={chooseType}/>}
    {screen==='gym'&&<GymTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} gymTemplates={gymTemplates} onSaveTemplate={saveTemplate} onBack={()=>goBack('add-training')} onHistory={()=>navigate('gym-history')} onSave={saveSession} onTrainerRequest={requestTrainer}/>}
    {screen==='gym-history'&&<GymHistory sessions={numberedSessions.filter(s=>s.type==='gym'&&isHistorySession(s))} onBack={()=>goBack('gym')}/>}
    {screen==='outdoor'&&<OutdoorTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onSave={saveSession} onSaveExpedition={saveExpedition}/>} 
    {screen==='crossfit'&&<CrossFitTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} onBack={()=>goBack('add-training')} onSave={saveSession}/>} 
    {screen==='workout'&&<WorkoutTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('workout-history')} onSave={saveSession}/>}
    {screen==='workout-history'&&<WorkoutHistory sessions={numberedSessions.filter(s=>s.type==='workout'&&isHistorySession(s))} onBack={()=>goBack('workout')}/>}
    {screen==='combat'&&<CombatTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('combat-history')} onSave={saveSession}/>}
    {screen==='combat-history'&&<CombatHistory sessions={numberedSessions.filter(s=>s.type==='combat'&&isHistorySession(s))} onBack={()=>goBack('combat')}/>}
    {screen==='hike'&&<HikeTraining dateKey={draftDateKey} setDateKey={setDraftDateKey} sessions={numberedSessions} onBack={()=>goBack('add-training')} onHistory={()=>navigate('hike-history')} onSave={saveSession}/>}
    {screen==='hike-history'&&<HikeHistory sessions={numberedSessions.filter(s=>s.type==='hike'&&isHistorySession(s))} onBack={()=>goBack('hike')}/>}
    {screen==='about'&&<AboutScreen isBoss={isBoss}/>}
    {trainerOpen&&<TrainerModal onClose={()=>setTrainerOpen(false)}/>}
    {screen==='why'&&<WhyScreen onBack={()=>goBack('home')}/>} 
    <FeedNotificationBridge userId={profile?.id} onOpenFeed={()=>navigate('feed')}/>
    <BottomNav screen={screen} onNavigate={navigate}/>
  </div>;
}

function BottomNav({screen,onNavigate}){
  const homeScreens=['add-training','gym','gym-history','outdoor','bike','workout','workout-history','combat','combat-history','hike','hike-history','crossfit','why'];
  const active=homeScreens.includes(screen)?'home':(screen==='history'||screen.startsWith('history-')||screen==='steps-history'?'':screen);
  const items=[['home','⌂','Главная'],['feed','◉','Лента'],['stats','▤','Статистика'],['members','♟','Участники'],['about','ⓘ','О приложении']];
  return <nav className="bottom-nav five">
    {items.map(([key,icon,label])=><button key={key} className={active===key?'active':''} onClick={()=>onNavigate(key)}><span className="nav-icon">{icon}</span>{label}</button>)}
  </nav>;
}

function Home({schedule,sessions,profile,dailySteps,expeditionDays,saveNotice,isBoss,adminNotifications,onTrainer,onMarkNotificationsRead,hookahEvents,hookahProgramStartedOn,canUndoHookah,onHookah,onBonusHookah,onUndoHookah,stepsStatus,stepsSyncing,onEnableSteps,onOpenSteps,onOpenFeed,selectedDateKey,setSelectedDateKey,onSavePlan,onDeletePlan,onProposal,onOpenWorkout}){
  const [pointsOpen,setPointsOpen]=useState(false);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const events=pointEvents(sessions,dailySteps,hookahEvents,expeditionDays).slice(-10).reverse();
  const unreadNotifications=(adminNotifications||[]).filter(n=>!n.read_at).length;
  const todayKey=localDateKey();
  const todayPlan=hookahDayPlan(todayKey,hookahProgramStartedOn);
  const todayHookahs=hookahCountForDate(hookahEvents,todayKey);
  const sevenStart=localDateKey(addDays(new Date(),-6));
  const sevenHookahs=ordinaryHookahEvents(hookahEvents).filter(h=>h.event_date>=sevenStart&&h.event_date<=todayKey).length;
  const sevenSlots=Array.from({length:7},(_,i)=>hookahDayPlan(localDateKey(addDays(dateFromKey(sevenStart),i)),hookahProgramStartedOn).slots).reduce((a,b)=>a+b,0);
  const todayMoney=hookahEarningForDay(hookahEvents,todayKey,hookahProgramStartedOn);
  const bonusState=hookahBonusState(hookahEvents,todayKey);
  const season=seasonMeta();
  const seasonProgress=Math.max(0,Math.min(100,(season.day/season.total)*100));
  const streakInfo=streakState(sessions,dailySteps,expeditionDays);
  const streak=streakInfo.day;
  const stepHistory=[...(dailySteps||[])].filter(x=>x.date<=todayKey).sort((a,b)=>b.date.localeCompare(a.date));
  const stepAverageSource=stepHistory.length>=30?stepHistory.slice(0,30):stepHistory;
  const averageSteps30=stepAverageSource.length?Math.round(stepAverageSource.reduce((sum,x)=>sum+Number(x.steps||0),0)/stepAverageSource.length):0;

  return <main className="main-screen home-no-scroll">
    <header className="topbar home-topbar">
      <div className="home-brand-block">
        <div className="brand-admin-row">
          <Brand compact/>
          <FeedBell onOpen={onOpenFeed}/>
          {isBoss&&<button className="admin-bell" onClick={async()=>{setNotificationsOpen(true);await onMarkNotificationsRead();}} aria-label="Уведомления администратора">
            <span>🛡</span>{unreadNotifications>0&&<b>{unreadNotifications>9?'9+':unreadNotifications}</b>}
          </button>}
        </div>
        <div className="season-title-row">
          <span>Сезон</span>
          <strong>{season.name.toUpperCase()}</strong>
          <i className="season-leaf-icon" aria-hidden="true"/>
        </div>
        <p className="season-motto">Движение. Дисциплина. Результат.</p>
      </div>

      <div className="score-wrap">
        <button className="score-card season-score-card" onClick={()=>setPointsOpen(true)}>
          <div className="score-main-row">
            <span className="score-star">★</span>
            <strong>Баллы: {profile?.points||0}</strong>
            <b>›</b>
          </div>
          <div className="score-day-row">
            <span>День {season.day} из {season.total}</span>
            <i className="season-leaf-icon small" aria-hidden="true"/>
          </div>
          <span className="season-progress-track"><i style={{width:`${seasonProgress}%`}}/></span>
        </button>
        <small>{scoreHint(sessions,dailySteps,expeditionDays)}</small>
      </div>
    </header>

    <button className="trainer-button home-trainer-button" onClick={onTrainer}>Заказать тренера</button>
    <div className="home-quick-row">
      {isBoss&&<section className="hookah-quick-card">
        <div className="hookah-money"><small>Сегодня можно заработать</small><strong>{todayMoney.toLocaleString('ru-RU')} ₽</strong><em>{todayPlan.label} · доступно {todayPlan.slots}</em></div>
        <div className="hookah-seven"><small>За 7 дней</small><strong>{sevenHookahs} из {sevenSlots}</strong></div>
        {bonusState.eligible&&<button className="hookah-bonus-button" onClick={onBonusHookah}><strong>Бонусный кальян</strong><small>Заработан за неделю · 0 ₽ · 0 баллов</small></button>}
        <button className="hookah-button" onClick={onHookah}>Выкуренный кальян</button>
        {canUndoHookah&&<button className="hookah-undo" onClick={onUndoHookah}>Отменить последнее</button>}
      </section>}
      <button
        className={`today-steps-chip ${stepsStatus}`}
        onClick={['permission','error'].includes(stepsStatus)?onEnableSteps:onOpenSteps}
        disabled={stepsSyncing}
      >
        <span className="steps-foot">👣</span>
        <span>
          <strong>{['ready','synced'].includes(stepsStatus)
            ?(dailySteps.find(x=>x.date===localDateKey())?.steps||0).toLocaleString('ru-RU')
            :stepsSyncing?'Синхронизация…':'Шаги за сегодня'}</strong>
          <small>{
            stepsStatus==='ready'?'шагов сегодня'
            :stepsStatus==='synced'?'синхронизировано с приложением'
            :stepsStatus==='web'?'появятся после синхронизации приложения'
            :stepsStatus==='unavailable'?'Нет системного источника шагов'
            :'Подключить автоматический шагомер'
          }</small>
          {averageSteps30>0&&<em>среднее: {averageSteps30.toLocaleString('ru-RU')} / день</em>}
        </span>
      </button>
    </div>

    <DateWheelV17 schedule={schedule} dailySteps={dailySteps} selectedDateKey={selectedDateKey} setSelectedDateKey={setSelectedDateKey}/>
    <StreakStrip streak={streak} state={streakInfo}/>

    <button className="gradient-button workout-cta" onClick={onOpenWorkout}><span>＋</span>Добавить тренировку<b>›</b></button>
    <p className="helper-text">Выбранная дата: {formatDate(selectedDateKey)}.</p>
    {saveNotice&&<div className="save-toast">✓ {saveNotice}</div>}

    {notificationsOpen&&<div className="modal-backdrop" onClick={()=>setNotificationsOpen(false)}>
      <section className="admin-notifications-modal" onClick={e=>e.stopPropagation()}>
        <header>
          <div><small>Босс</small><h2>Уведомления</h2></div>
          <button onClick={()=>setNotificationsOpen(false)}>×</button>
        </header>
        {!adminNotifications.length&&<div className="empty-state compact-empty">Новых событий пока нет.</div>}
        <button className="secondary-dark" onClick={()=>{setNotificationsOpen(false);onTrainer();}}>Заявки и доступ к тренеру</button>
        <div className="admin-notification-list">
          {adminNotifications.map(n=><article key={n.id} className={!n.read_at?'unread':''}>
            <span className="admin-notification-icon">{n.type==='trainer_request'?'♟':'👤'}</span>
            <div>
              <strong>{n.title}</strong>
              <small>{n.member_name||'Пользователь'}{n.member_email?' · '+n.member_email:''}</small>
              <em>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(n.created_at))}</em>
            </div>
          </article>)}
        </div>
      </section>
    </div>}

    {pointsOpen&&<div className="modal-backdrop" onClick={()=>setPointsOpen(false)}>
      <section className="points-modal" onClick={e=>e.stopPropagation()}>
        <header><div><small>Сезон {season.name}</small><h2>История баллов</h2></div><button onClick={()=>setPointsOpen(false)}>×</button></header>
        {!events.length&&<div className="empty-state compact-empty">Начислений в этом сезоне пока нет.</div>}
        <div className="points-events">{events.map(event=><article key={event.id}>
          <div><strong>{formatDate(event.date,{day:'numeric',month:'long'})}</strong><small>{event.reasons}</small></div>
          <b className={event.delta>=0?'plus':'minus'}>{event.delta>=0?'+':''}{event.delta}</b>
        </article>)}</div>
      </section>
    </div>}
  </main>;
}

function StreakStrip({streak=0,state=null}){
  if(state?.isRecovery){
    return <section className="streak-recovery-card"><small>СЕРИЯ №{state.closedSeries} ЗАКРЫТА</small><strong>Отличная работа.</strong><p>Сегодня — восстановление. Отдыхай.</p></section>;
  }
  const filled=Math.min(Math.max(Number(streak)||0,0),6);
  return <section className="streak-strip"><div className="streak-caption"><strong>Серия</strong><span>{streak?streak+' из 6':'начни сегодня'}</span></div><div className="streak-dots">{[0,1,2,3,4,5].map(i=><div className="streak-step" key={i}><span className={i<filled?'filled':''}>{i<filled?'✓':''}</span><small>{i===0?'старт':'+'+i}</small></div>)}</div></section>;
}
function WhyScreen({onBack}){
  return <main className="sub-screen why-screen">
    <ScreenBack onBack={onBack} title="О чём это приложение"/>

    <section className="why-intro glass-card">
      <span className="why-kicker">Форма</span>
      <h1>Не про идеальные тренировки.<br/>Про то, чтобы чаще двигаться.</h1>
      <p>Неважно, что именно ты делаешь: идёшь в зал, катаешься на велосипеде, гуляешь, занимаешься на турниках или уходишь в поход. Всё это — активность.</p>
    </section>

    <div className="why-flow">
      <section>
        <h2>Сделал что-то активное — зафиксируй это</h2>
        <p>Со временем ты начинаешь видеть не отдельные тренировки, а картину целиком: как часто двигаешься, сколько уже сделал, где выпал из ритма и насколько стал активнее за месяц, полгода или год.</p>
      </section>

      <section>
        <h2>Баллы — не оценка твоей физической формы</h2>
        <p>Они показывают регулярность. За активность начисляются баллы, стабильность поощряется, а длинные паузы постепенно снижают рейтинг.</p>
        <blockquote>Лучше регулярно делать хоть что-то, чем раз в месяц совершать спортивный подвиг.</blockquote>
      </section>

      <section>
        <h2>Здесь засчитывается разная жизнь</h2>
        <p>Сегодня велосипед. Завтра прогулка. Через день тренажёрка. На выходных поход. Для «Формы» важнее не вид спорта, а то, что ты продолжаешь двигаться.</p>
      </section>

      <section>
        <h2>Статистика нужна не для отчёта</h2>
        <p>Через несколько недель уже трудно вспомнить, сколько ты действительно тренировался, ходил или проехал. «Форма» сохраняет это и показывает реальную картину.</p>
        <blockquote>«Ого. А я вообще-то нормально двигаюсь» — или наоборот: «Что-то я выпал». И оба вывода полезны.</blockquote>
      </section>

      <section>
        <h2>Рейтинг — немного игры</h2>
        <p>Сезонный рейтинг добавляет азарт: можно догонять друзей, удерживать своё место или просто закончить новый сезон лучше прошлого. Каждый сезон — новый старт.</p>
      </section>

      <section>
        <h2>Планы не считаются результатом</h2>
        <p>Тренировку можно запланировать заранее, но в статистику и рейтинг попадает только то, что реально состоялось.</p>
      </section>
    </div>

    <section className="why-final">
      <span>Главная идея</span>
      <h2>Не нужно перестраивать жизнь вокруг приложения.</h2>
      <p>Живи как обычно. Просто замечай свою активность и сохраняй её.</p>
      <strong>Главная цель — самому двигаться чуть больше, чем раньше.</strong>
    </section>
  </main>;
}

function AboutScreen({isBoss=false}){
  const [iosHelp,setIosHelp]=useState(false);

  function openAndroid(){
    window.open(ANDROID_APK_URL,'_blank','noopener,noreferrer');
  }

  function openIos(){
    setIosHelp(true);
    window.open(IOS_INSTALL_URL,'_blank','noopener,noreferrer');
  }

  return <main className="tab-screen about-screen about-tab-screen">
    <p className="eyebrow-dark">Форма</p>
    <h1>О приложении</h1>

    <section className="why-intro glass-card about-concept-hero">
      <h2>Не про идеальные тренировки.<br/>Про то, чтобы чаще двигаться.</h2>
      <p>Неважно, что именно ты делаешь: идёшь в зал, катаешься на велосипеде, занимаешься на турниках, единоборствами или уходишь в поход. Задача «Формы» — чтобы движения в жизни становилось больше.</p>
    </section>

    <section className="about-principles">
      <article><strong>Сделал — зафиксируй</strong><p>Так отдельные тренировки складываются в реальную картину твоей активности.</p></article>
      <article><strong>Баллы — за регулярность</strong><p>Они не измеряют твою физическую форму. Лучше делать хоть что-то регулярно, чем раз в месяц совершать спортивный подвиг.</p></article>
      <article><strong>Статистика — про факты</strong><p>Через месяц ты уже видишь не ощущения, а сколько реально тренировался, прошёл, проехал и поднял.</p></article>
      <article><strong>Рейтинг — немного игры</strong><p>Догоняй друзей, держи ритм и начинай каждый сезон с нового старта.</p></article>
    </section>

    <section className="why-final about-main-idea">
      <span>Главная идея</span>
      <h2>Не перестраивай жизнь вокруг приложения.</h2>
      <p>Живи как обычно. Просто замечай свою активность и сохраняй её.</p>
      <strong>Цель — самому двигаться чуть больше, чем раньше.</strong>
    </section>

    <details className="points-structure glass-card">
      <summary>Структура начисления баллов <span>⌄</span></summary>
      <div>
        <p><strong>Главное правило:</strong> рейтинг ценит регулярность, а не количество тренировок за один день.</p>
        <p><b>Активный день: +5.</b> Зал, CrossFit, воркаут, единоборства, вело, бег, хайкинг или 15 000+ шагов — вид активности не важен. Даже если активностей несколько, базовые +5 за день начисляются один раз.</p>
        <p><b>Серия:</b> второй активный день подряд даёт +1, третий +2, четвёртый +3, пятый +4, шестой +5. На этом цикл заканчивается. Седьмой день заложен как день отдыха и восстановления. Если вы всё равно тренируетесь на седьмой день, активность засчитывается и даёт базовые +5, но бонус серии снова начинается с нуля как новый шестидневный цикл.</p>
        <p><b>Пропуск:</b> один пропущенный день обрывает серию. После трёх дней без активности спортивный рейтинг уменьшается на 1 балл за каждый следующий день, но спортивная часть не падает ниже нуля.</p>
        <p><b>Задним числом:</b> запись остаётся в истории и статистике, но рейтинговых баллов не даёт и серию не восстанавливает.</p>
        <p><b>GPS:</b> скачки мгновенной скорости не останавливают запись — маршрут сохраняется целиком. Велопоездка более 100 км получает дополнительный +5 только если средняя скорость не выше 50 км/ч. Для бега и хайкинга записи со средней скоростью выше 30 км/ч всё равно сохраняются и дают обычные баллы активного дня, но не считаются корректными для дополнительных GPS-бонусов.</p>
        {isBoss&&<p><b>Вредная привычка:</b> −2 за каждую отмеченную запись. Только этот персональный штраф может увести итоговый рейтинг ниже нуля.</p>}
      </div>
    </details>

    <section className="about-hero glass-card">
      <Brand compact/>
      <p>Некоммерческий проект Василия Чувакина, созданный для повышения личной активности каждого человека. Приложение спроектировано исходя из видения автора; предложения по настройке, новым функциям и конструктивная обратная связь приветствуются.</p>
    </section>

    <section className="download-card glass-card">
      <h2>Установить «Форму»</h2>
      <p>Выберите своё устройство.</p>

      <button className="platform-download android-download" onClick={openAndroid}>
        <span className="platform-icon">A</span>
        <span><strong>Android</strong><small>Скачать актуальный установочный APK</small></span>
        <b>↓</b>
      </button>

      <button className="platform-download ios-download" onClick={openIos}>
        <span className="platform-icon apple-mark">●</span>
        <span><strong>iPhone / iOS</strong><small>Установить через Safari без App Store</small></span>
        <b>›</b>
      </button>

      {iosHelp&&<div className="ios-install-help">
        <strong>На iPhone:</strong>
        <span>откройте ссылку в Safari → «Поделиться» → «На экран Домой» → «Добавить».</span>
      </div>}
    </section>

    <section className="about-signature">
      <p>С благодарностью всем и каждому, кто пользуется этим приложением.</p>
      <p>Здоровья вам и яркой жизни.</p>
      <strong>Чувакин Василий</strong>
      <small>Форма · версия {APP_VERSION}</small>
    </section>
  </main>;
}

function DateWheel({schedule,dailySteps,selectedDateKey,setSelectedDateKey}){
  const selectedDate=dateFromKey(selectedDateKey);
  const activeMonday=mondayOf(selectedDate);
  const weekStarts=[addDays(activeMonday,-7),activeMonday,addDays(activeMonday,7)];
  const todayKey=localDateKey();
  const weekdayShort=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  function chooseDate(key){
    setSelectedDateKey(key);
    navigator.vibrate?.(7);
  }

  return <section className="week-calendar-shell">
    <div className="week-columns">
      {weekStarts.map((weekStart,weekIndex)=>{
        const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
        const firstKey=localDateKey(days[0]);
        const lastKey=localDateKey(days[6]);

        return <article className={`week-column ${weekIndex===1?'active-week':'side-week'}`} key={firstKey}>
          <header>
            <span>{weekIndex===1?'Эта неделя':weekIndex===0?'Предыдущая':'Следующая'}</span>
            <small>{formatDate(firstKey,{day:'numeric',month:'short'})} — {formatDate(lastKey,{day:'numeric',month:'short'})}</small>
          </header>

          <div className="week-days">
            {days.map((date,i)=>{
              const key=localDateKey(date);
              const selected=key===selectedDateKey;
              const item=schedule[key];
              const trainingCompleted=item?.status==='completed';
              const stepsForDay=Number((dailySteps||[]).find(x=>x.date===key)?.steps||0);
              const stepsCompleted=!trainingCompleted&&stepsForDay>=15000;
              const displayType=trainingCompleted?item?.type:(stepsCompleted?'steps':item?.type);
              const meta=activityMeta(displayType);
              const completed=trainingCompleted||stepsCompleted;
              const today=key===todayKey;

              return <button
                type="button"
                key={key}
                className={`week-day ${selected?'selected':''} ${today?'today':''}`}
                onClick={()=>chooseDate(key)}
              >
                <span className="week-day-date">
                  <b>{weekdayShort[i]}</b>
                  <strong>{date.getDate()}</strong>
                </span>
                <span className={`week-day-activity ${meta?.accent||''}`}>
                  {meta?<ActivityGlyph type={displayType} className={meta.accent}/>:null}
                </span>
                <span className={`week-day-status ${completed?'completed':''}`}>{completed?'✓':''}</span>
              </button>;
            })}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function AddTraining({dateKey,setDateKey,onProposal,onBack,onChoose}){
  const [otherOpen,setOtherOpen]=useState(false);
  const [text,setText]=useState('');
  const [sent,setSent]=useState(false);

  async function submit(){
    if(!text.trim())return;
    await onProposal(text.trim());
    setText('');setSent(true);
  }

  return <main className="sub-screen add-training-screen">
    <ScreenBack onBack={onBack}/>
    <p className="eyebrow-dark">Новая запись</p>
    <h1>Добавить тренировку</h1>

    <label className="date-control add-date-compact">
      <span>Дата</span>
      <input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/>
    </label>

    <div className="activity-grid add-grid compact-activity-grid">
      {ACTIVITIES.map(a=><button key={a.id} className={`activity-choice ${a.accent}`} onClick={()=>onChoose(a.id)}>
        <ActivityGlyph type={a.id} className={a.accent}/>
        <strong>{a.label}</strong>
      </button>)}
      <button className="activity-choice other-choice" onClick={()=>{setOtherOpen(true);setSent(false);}}>
        <span>＋</span><strong>Другое</strong>
      </button>
    </div>

    {otherOpen&&<div className="modal-backdrop" onClick={()=>setOtherOpen(false)}>
      <section className="other-modal glass-card" onClick={e=>e.stopPropagation()}>
        <header><h2>Предложить активность</h2><button onClick={()=>setOtherOpen(false)}>×</button></header>
        <label className="dark-field"><span>Название активности</span><input value={text} onChange={e=>{setText(e.target.value);setSent(false);}} placeholder="Например: плавание" autoFocus/></label>
        <button className="secondary-dark" onClick={submit}>Отправить на модерацию</button>
        {sent&&<p className="success-line">Отправлено админу на согласование.</p>}
      </section>
    </div>}
  </main>;
}

function ScreenBack({onBack,title}){
  return <div className="screen-back-row"><button className="back-button" onClick={onBack}>‹</button>{title&&<strong>{title}</strong>}</div>;
}

function GymTraining({dateKey,setDateKey,sessions,gymTemplates,onSaveTemplate,onBack,onHistory,onSave,onTrainerRequest}){
  const [group,setGroup]=useState('chest');
  const [baseRows,setBaseRows]=useState(makeRows(3));
  const [extraRows,setExtraRows]=useState(makeRows(5));
  const [error,setError]=useState('');
  const previousGym=sessions.filter(s=>s.type==='gym'&&isHistorySession(s));
  const averageGymTonnage=previousGym.length?previousGym.reduce((sum,s)=>sum+workoutTonnage(s.baseRows||[],s.extraRows||[]),0)/previousGym.length:0;

  useEffect(()=>{
    const t=gymTemplates[group];
    if(group==='custom'){
      setBaseRows(normalizeRows(t?.baseRows,8));
      setExtraRows([]);
    }else{
      setBaseRows(normalizeRows(t?.baseRows,3));
      setExtraRows(normalizeRows(t?.extraRows,5));
    }
    setError('');
  },[group,gymTemplates]);

  function update(kind,index,field,value){
    const setter=kind==='base'?setBaseRows:setExtraRows;
    setter(cur=>cur.map((row,i)=>i===index?{...row,[field]:value}:row));
  }

  async function save(){
    if(![...baseRows,...extraRows].some(r=>r.exercise)){
      setError('Выбери хотя бы одно упражнение.');
      return;
    }
    const templateBase=baseRows.map(({comment,...row})=>row);
    const templateExtra=extraRows.map(({comment,...row})=>row);
    const tonnage=workoutTonnage(baseRows,extraRows);
    await onSaveTemplate(group,templateBase,templateExtra);
    await onSave({type:'gym',date:dateKey,gymGroup:group,baseRows,extraRows,title:GYM_GROUPS.find(g=>g.id===group)?.label||'Тренажёрка'});
  }


  return <main className="sub-screen gym-screen">
    <ScreenBack onBack={onBack} title="Тренировка"/>
    <label className="date-control compact-date"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>

    <div className="gym-tabs">{GYM_GROUPS.map(g=><button key={g.id} className={group===g.id?'active':''} onClick={()=>setGroup(g.id)}><span>{g.icon}</span>{g.label}</button>)}</div>

    {group==='custom'
      ?<ExerciseBlock title="Упражнения" subtitle="Любые упражнения из общего списка" rows={baseRows} options={ALL_GYM_EXERCISES} kind="base" onChange={update} accent="mint"/>
      :<>
        <ExerciseBlock title="База" subtitle="Основные упражнения на выбранную группу" rows={baseRows} options={BASE_EXERCISES[group]} kind="base" onChange={update} accent="mint"/>
        <ExerciseBlock title="Доп" subtitle="Дельты, руки, пресс и другие мелкие группы" rows={extraRows} options={ACCESSORY_EXERCISES} kind="extra" onChange={update} accent="violet"/>
      </>}

    <div className="tonnage-summary"><span>Тоннаж тренировки</span><strong>{formatKg(workoutTonnage(baseRows,extraRows))} кг</strong>{averageGymTonnage>0&&<small>Средний тоннаж: {formatKg(averageGymTonnage)} кг / тренировку</small>}</div>

    {error&&<p className="error-line">{error}</p>}
    <button className="gradient-button save-training" onClick={save}><span>▣</span>{isFuture(dateKey)?'Запланировать тренировку':'Сохранить тренировку'}<b>›</b></button>

    <div className="gym-bottom-actions">
      <button className="previous-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
      <button className="trainer-button" onClick={onTrainerRequest}><span>♟</span>Заказать тренера</button>
    </div>
  </main>;
}

function ExerciseBlock({title,subtitle,rows,options,kind,onChange,accent}){
  const [openComment,setOpenComment]=useState(null);

  return <section className={`exercise-block ${accent}`}>
    <header><div><h2>{title}</h2><p>{subtitle}</p></div><span>{rows.length} упражнений</span></header>
    <div className="exercise-head"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span><span></span></div>

    <div className="exercise-rows">{rows.map((row,i)=><div className="exercise-row-wrap" key={i}>
      <div className="exercise-row">
        <select value={row.exercise} onChange={e=>onChange(kind,i,'exercise',e.target.value)}><option value="">Выбрать упражнение</option>{options.map(o=><option key={o}>{o}</option>)}</select>
        <input inputMode="numeric" value={row.sets} onChange={e=>onChange(kind,i,'sets',e.target.value)} placeholder="3"/>
        <input inputMode="numeric" value={row.reps} onChange={e=>onChange(kind,i,'reps',e.target.value)} placeholder="10"/>
        <div className="weight-input"><input inputMode="decimal" value={row.weight} onChange={e=>onChange(kind,i,'weight',e.target.value)} placeholder="0"/><small>кг</small></div>
        <button className={`exercise-note-button ${row.comment?'has-note':''}`} onClick={()=>setOpenComment(openComment===i?null:i)} type="button" aria-label="Комментарий">▤</button>
      </div>

      {openComment===i&&<div className="exercise-comment-row">
        <input value={row.comment||''} onChange={e=>onChange(kind,i,'comment',e.target.value)} placeholder="Комментарий к упражнению"/>
        <button type="button" onClick={()=>setOpenComment(null)}>Сохранить</button>
      </div>}
    </div>)}</div>
  </section>;
}
function GymHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие тренировки"/>
    {!ordered.length&&<div className="empty-state">Сохранённых тренировок пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      const group=GYM_GROUPS.find(g=>g.id===s.gymGroup);
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon">{group?.icon||'🏋︎'}</span>
          <span><strong>Тренировка №{s.displayNumber||'—'} · {group?.label||'Тренажёрка'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body">
          {s.gymGroup==='custom'
            ?<ReadonlyExerciseBlock title="Упражнения" rows={s.baseRows||[]}/>
            :<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>}
          <div className="history-tonnage">Тоннаж: <strong>{formatKg(workoutTonnage(s.baseRows||[],s.extraRows||[]))} кг</strong></div>
        </div>}
      </article>;
    })}</div>
  </main>;
}

function ReadonlyExerciseBlock({title,rows}){
  const visible=rows.filter(r=>r.exercise);
  if(!visible.length)return null;

  return <section className="readonly-block">
    <h3>{title}</h3>
    <div className="readonly-head"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span></div>
    {visible.map((r,i)=><div className="readonly-row-wrap" key={i}>
      <div className="readonly-row"><span>{r.exercise}</span><span>{r.sets||'—'}</span><span>{r.reps||'—'}</span><span>{r.weight||'—'} кг</span></div>
      {r.comment&&<div className="readonly-comment">▤ {r.comment}</div>}
    </div>)}
  </section>;
}
function WorkoutTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [text,setText]=useState('');
  const [saving,setSaving]=useState(false);
  const count=sessions.filter(s=>s.type==='workout'&&isQualifyingSession(s)).length;

  async function save(){
    if(!text.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'workout',
        date:dateKey,
        title:'Воркаут',
        workoutText:text.trim(),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen workout-training-screen">
    <ScreenBack onBack={onBack} title="Воркаут"/>

    <section className="metric-hero">
      <ActivityGlyph type="workout" className="coral"/>
      <div><small>Всего воркаутов</small><strong>{count}</strong></div>
    </section>

    <section className="glass-card simple-form workout-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field workout-description-field">
        <span>Опиши свою тренировку</span>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Например: подтягивания 5×10, брусья 4×15, пресс..." rows={7}/>
      </label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!text.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
  </main>;
}

function WorkoutHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие воркауты"/>
    {!ordered.length&&<div className="empty-state">Сохранённых воркаутов пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon"><ActivityGlyph type="workout" className="coral"/></span>
          <span><strong>Тренировка №{s.displayNumber||'—'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body workout-history-text">{s.workoutText||'Описание не сохранено.'}</div>}
      </article>;
    })}</div>
  </main>;
}

function CombatTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [combatType,setCombatType]=useState('');
  const [saving,setSaving]=useState(false);
  const count=sessions.filter(s=>s.type==='combat'&&isQualifyingSession(s)).length;
  const suggestions=['Бокс','ММА','Борьба','Самбо','Дзюдо','BJJ','Кикбоксинг','Муай-тай','Карате','Тхэквондо'];

  async function save(){
    if(!combatType.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'combat',
        date:dateKey,
        title:combatType.trim(),
        combatType:combatType.trim(),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen combat-training-screen">
    <ScreenBack onBack={onBack} title="Единоборства"/>

    <section className="metric-hero combat-metric-hero">
      <ActivityGlyph type="combat" className="combat"/>
      <div><small>Всего тренировок</small><strong>{count}</strong></div>
    </section>

    <section className="glass-card simple-form combat-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field">
        <span>Вид единоборства</span>
        <input list="combat-types" value={combatType} onChange={e=>setCombatType(e.target.value)} placeholder="Например: бокс"/>
        <datalist id="combat-types">{suggestions.map(x=><option value={x} key={x}/>)}</datalist>
      </label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!combatType.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие тренировки<b>›</b></button>
  </main>;
}

function CombatHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="История единоборств"/>
    {!ordered.length&&<div className="empty-state">Сохранённых тренировок пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon combat">🥊</span>
          <span><strong>Тренировка №{s.displayNumber||'—'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body combat-history-detail"><strong>{s.combatType||s.title||'Единоборства'}</strong></div>}
      </article>;
    })}</div>
  </main>;
}

function HikeTraining({dateKey,setDateKey,sessions,onBack,onHistory,onSave}){
  const [name,setName]=useState('');
  const [days,setDays]=useState('1');
  const [distance,setDistance]=useState('');
  const [saving,setSaving]=useState(false);

  const list=sessions.filter(s=>s.type==='hike'&&isHistorySession(s));
  const totalDays=list.reduce((sum,s)=>sum+Math.max(Number(s.hikeDays)||1,1),0);
  const totalDistance=list.reduce((sum,s)=>sum+(Number(s.hikeDistance)||0),0);

  async function save(){
    if(!name.trim())return;
    setSaving(true);
    try{
      await onSave({
        type:'hike',
        date:dateKey,
        title:name.trim(),
        hikeDays:Math.max(Number(days)||1,1),
        hikeDistance:Math.max(Number(distance)||0,0),
      });
    }finally{
      setSaving(false);
    }
  }

  return <main className="sub-screen hike-training-screen">
    <ScreenBack onBack={onBack} title="ПВД / Поход"/>
    <section className="metric-hero hike-metric-hero">
      <ActivityGlyph type="hike" className="hike"/>
      <div><small>Всего походов</small><strong>{list.length}</strong><em>{totalDays} дн. · {totalDistance.toLocaleString('ru-RU')} км</em></div>
    </section>

    <section className="glass-card simple-form hike-form">
      <label className="date-control embedded"><span>Дата начала</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название похода</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Например: Ачишхо" required/></label>
      <div className="hike-fields">
        <label className="dark-field"><span>Количество дней</span><input inputMode="numeric" type="number" min="1" value={days} onChange={e=>setDays(e.target.value)} placeholder="1"/></label>
        <label className="dark-field"><span>Расстояние, км</span><input inputMode="decimal" type="number" min="0" step="0.1" value={distance} onChange={e=>setDistance(e.target.value)} placeholder="18"/></label>
      </div>
      <small className="hike-points-note">Ручная запись сохранится в истории. Для зачёта каждого дня многодневного похода используй офлайн-GPS с контрольными точками.</small>
      <button className="gradient-button save-simple" onClick={save} disabled={saving||!name.trim()}>
        {saving?'Сохраняю…':isFuture(dateKey)?'Запланировать поход':'Сохранить поход'}
      </button>
    </section>

    <button className="previous-button workout-history-button" onClick={onHistory}><span>◴</span>Предыдущие походы<b>›</b></button>
  </main>;
}

function HikeHistory({sessions,onBack}){
  const ordered=[...sessions].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(ordered[0]?.id||null);

  return <main className="sub-screen">
    <ScreenBack onBack={onBack} title="Предыдущие ПВД / походы"/>
    {!ordered.length&&<div className="empty-state">Сохранённых походов пока нет.</div>}
    <div className="accordion-list">{ordered.map(s=>{
      const open=s.id===openId;
      return <article className={`history-accordion ${open?'open':''}`} key={s.id}>
        <button className="accordion-title" onClick={()=>setOpenId(open?null:s.id)}>
          <span className="accordion-icon"><ActivityGlyph type="hike" className="hike"/></span>
          <span><strong>{s.displayNumber?`Тренировка №${s.displayNumber} · `:''}{s.title||'Поход'}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></span>
          <b>{open?'⌃':'⌄'}</b>
        </button>
        {open&&<div className="accordion-body hike-history-detail">
          <strong>{s.title||'Поход'}</strong>
          <span>{Math.max(Number(s.hikeDays)||1,1)} дн.</span>
          <span>{Number(s.hikeDistance||0).toLocaleString('ru-RU')} км</span>
          <small>Баллы за дни: +{5*Math.max(Number(s.hikeDays)||1,1)}</small>
        </div>}
      </article>;
    })}</div>
  </main>;
}

function HikeStats({count,days,distance}){
  return <article className="stat-card hike hike-stat-card">
    <span className="stat-icon"><ActivityGlyph type="hike" className="hike"/></span>
    <div className="hike-stat-copy"><small>Походы</small>
    <div className="hike-stat-values">
      <span><strong>{count.toLocaleString('ru-RU')}</strong><em>походов</em></span>
      <span><strong>{days.toLocaleString('ru-RU')}</strong><em>дней</em></span>
      <span><strong>{Number(distance||0).toLocaleString('ru-RU')}</strong><em>км</em></span>
    </div></div>
  </article>;
}

function RouteSketch({points=[]}){
  const plot=routePlot(points,100,60,5);
  return <div className="route-sketch"><svg viewBox="0 0 100 60" role="img" aria-label="Схема маршрута">
    {plot.slice(1).map((p,i)=><line key={i} className={p.segment==='transport'?'transport':''} x1={plot[i].x} y1={plot[i].y} x2={p.x} y2={p.y} vectorEffect="non-scaling-stroke"/>)}
    {plot.length>0&&<circle className="route-start" cx={plot[0].x} cy={plot[0].y} r="2.4"/>}
    {plot.length>1&&<circle className="route-finish" cx={plot[plot.length-1].x} cy={plot[plot.length-1].y} r="2.4"/>}
  </svg></div>;
}
function RouteFullscreen({session,onClose}){
  const type=session.type||session.mode||'bike',points=session.routePoints||session.points||[],meta=activityMeta(type)||OUTDOOR_MODES[0];
  const [msg,setMsg]=useState('');
  async function exp(transparent){try{setMsg(await exportRoutePng(session,type,session.date||localDateKey(),transparent));}catch(err){setMsg(err.message||'Не получилось сохранить PNG');}}
  return <div className={'route-fullscreen '+type}><button className="route-fullscreen-close" onClick={onClose}>×</button><div className="route-fullscreen-inner"><header><small>Форма · {meta.label}</small><h2>{session.title||meta.label}</h2><span>{formatDate(session.date||localDateKey(),{day:'numeric',month:'long',year:'numeric'})}</span></header><RouteSketch points={points}/>{type==='hike'&&Number(session.transportDistance??session.transport_distance||0)>0&&<p className="route-legend"><i/> пешком <i className="transport"/> транспорт</p>}<div className="route-fullscreen-metrics">{routeMetrics(session,type).map(([label,value])=><span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div><div className="route-export-actions"><button onClick={()=>exp(false)}>PNG</button><button onClick={()=>exp(true)}>PNG без фона</button></div>{msg&&<em>{msg}</em>}</div></div>;
}
function RouteResultCard({session,compact=false}){
  const [fullscreen,setFullscreen]=useState(false),[exportMsg,setExportMsg]=useState('');
  const type=session.type||session.mode||'bike',points=session.routePoints||session.points||[],meta=activityMeta(type)||OUTDOOR_MODES[0];
  const gpsLabel=session.gpsVerified===false?'Ручная запись':session.trackingMode==='expedition'?'GPS · многодневный офлайн':session.distanceCorrected?'GPS · километраж скорректирован':'GPS · подтверждено';
  async function exp(transparent){try{setExportMsg(await exportRoutePng(session,type,session.date||localDateKey(),transparent));}catch(err){setExportMsg(err.message||'Не получилось сохранить PNG');}}
  return <><section className={'route-result-card '+type+(compact?' compact':'')}><header><span>{meta.icon}</span><div><small>{gpsLabel}</small><strong>{session.title||meta.label}</strong></div></header>{points.length>1&&<button type="button" className="route-sketch-open" onClick={()=>setFullscreen(true)}><RouteSketch points={points}/><small>Нажмите, чтобы открыть маршрут на весь экран</small></button>}{type==='hike'&&Number(session.transportDistance??session.transport_distance||0)>0&&<p className="route-legend compact"><i/> пешком <i className="transport"/> транспорт</p>}<div className="route-metrics">{routeMetrics(session,type).map(([label,value])=><span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div>{points.length>1&&<div className="route-export-actions compact-actions"><button type="button" onClick={()=>exp(false)}>PNG</button><button type="button" onClick={()=>exp(true)}>PNG без фона</button></div>}{exportMsg&&<em className="route-export-message">{exportMsg}</em>}</section>{fullscreen&&<RouteFullscreen session={session} onClose={()=>setFullscreen(false)}/>}</>;
}

const EXPEDITION_STORAGE_KEY='forma-expedition-v110';
function loadExpeditionDraft(){
  try{const raw=localStorage.getItem(EXPEDITION_STORAGE_KEY);return raw?JSON.parse(raw):null;}catch{return null;}
}
function persistExpeditionDraft(draft){
  try{if(draft)localStorage.setItem(EXPEDITION_STORAGE_KEY,JSON.stringify(draft));else localStorage.removeItem(EXPEDITION_STORAGE_KEY);}catch{}
}
function expeditionDays(points=[]){
  const prepared=classifyHikeRoute(points),map=new Map();
  prepared.forEach(p=>{const key=localDateKey(new Date(Number(p.t)||Date.now()));if(!map.has(key))map.set(key,{date:key,pointCount:0,distance:0});map.get(key).pointCount+=1;});
  for(let i=1;i<prepared.length;i++){
    const b=prepared[i],key=localDateKey(new Date(Number(b.t)||Date.now()));if(b.segment==='transport')continue;
    const row=map.get(key);if(row)row.distance+=haversineKm(prepared[i-1],b);
  }
  return [...map.values()].sort((x,y)=>x.date.localeCompare(y.date));
}

function OutdoorTraining({dateKey,setDateKey,sessions,onBack,onSave,onSaveExpedition}){
  const initialDraft=loadExpeditionDraft();
  const [mode,setMode]=useState(initialDraft?'hike':'bike'),[manualOpen,setManualOpen]=useState(false),[title,setTitle]=useState(initialDraft?.title||''),[distance,setDistance]=useState(''),[tracking,setTracking]=useState(false),[trackPoints,setTrackPoints]=useState(initialDraft?.points||[]),[gpsMessage,setGpsMessage]=useState(''),[result,setResult]=useState(null),[saving,setSaving]=useState(false),[expedition,setExpedition]=useState(initialDraft);
  const watchRef=useRef(null),pointsRef=useRef(initialDraft?.points||[]),startedRef=useRef(initialDraft?.startedAt||null);
  const meta=OUTDOOR_MODES.find(x=>x.id===mode)||OUTDOOR_MODES[0],history=sessions.filter(s=>s.type===mode&&isHistorySession(s)),distances=history.map(s=>Number(s.distance||(mode==='hike'?s.hikeDistance:0))||0),totalDistance=distances.reduce((a,b)=>a+b,0),avgDistance=average(distances),live=useMemo(()=>summarizeRoute(trackPoints,mode),[trackPoints,mode]),native=Capacitor.isNativePlatform()&&Capacitor.getPlatform()==='android';
  useEffect(()=>()=>{if(watchRef.current)BackgroundGeolocation.stop().catch(()=>{});},[]);
  function selectMode(next){if(tracking)return;setMode(next);setManualOpen(false);setResult(null);setGpsMessage('');setDistance('');if(!expedition)setTitle('');}
  function appendPoint(position,expeditionMode=false){
    if(!position)return;
    const point={lat:Number(position.latitude),lng:Number(position.longitude),t:Number(position.time)||Date.now(),accuracy:Number(position.accuracy)||null,speedKmh:Number(position.speed)>=0?Number(position.speed)*3.6:null};
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng)||!Number.isFinite(point.t))return;
    pointsRef.current=[...pointsRef.current,point];setTrackPoints(pointsRef.current);
    if(expeditionMode){
      const next={...(loadExpeditionDraft()||expedition||{}),active:true,startedAt:startedRef.current,title:title.trim()||'Многодневный поход',points:pointsRef.current};
      setExpedition(next);persistExpeditionDraft(next);
    }
  }
  async function stopGps(){
    const active=watchRef.current;watchRef.current=null;if(active)await BackgroundGeolocation.stop().catch(()=>{});setTracking(false);
    const summary=summarizeRoute(pointsRef.current,mode);if(summary.points.length<2||summary.distance<=0){setGpsMessage('Маршрут не записался. Внесите тренировку вручную.');setManualOpen(true);return;}
    const finishedAt=new Date().toISOString(),resultData={...summary,type:mode,mode,title:title.trim()||meta.label,date:localDateKey(),routePoints:compactRoutePoints(summary.points),movingDuration:Math.round(summary.movingSeconds),stopDuration:Math.round(summary.stopSeconds),stopCount:summary.stopCount,transportDistance:summary.transportDistance,duration:Math.round(summary.totalSeconds),avgSpeed:summary.avgSpeed,maxSpeed:summary.maxSpeed,gpsVerified:true,startedAt:startedRef.current,endedAt:finishedAt};setResult(resultData);
    try{const user=(await supabase.auth.getUser())?.data?.user;if(user)await supabase.from('feed_events').insert({actor_id:user.id,event_type:'gps_finished',activity_type:mode,title:resultData.title,payload:{distance:resultData.distance,duration:resultData.duration,moving_duration:resultData.movingDuration,stop_duration:resultData.stopDuration,stop_count:resultData.stopCount,transport_distance:resultData.transportDistance,avg_speed:resultData.avgSpeed,max_speed:resultData.maxSpeed}});}catch(err){console.warn('Forma GPS finish feed failed',err);}
  }
  async function startGps(){
    setGpsMessage('');setResult(null);setManualOpen(false);
    if(!native){setGpsMessage('GPS-запись маршрута сейчас доступна в Android-приложении. Здесь можно внести тренировку вручную.');setManualOpen(true);return;}
    try{
      setDateKey(localDateKey());pointsRef.current=[];startedRef.current=new Date().toISOString();setTrackPoints([]);
      await BackgroundGeolocation.start({backgroundTitle:'Форма · '+meta.label,backgroundMessage:'Идёт запись маршрута. Нажмите, чтобы вернуться в «Форму».',requestPermissions:true,stale:false,distanceFilter:0,minIntervalMs:2000},(position,err)=>{
        if(err){if(err.code==='NOT_AUTHORIZED'){setGpsMessage('Нет разрешения на геолокацию. Разрешите GPS или внесите тренировку вручную.');setManualOpen(true);}return;}appendPoint(position,false);
      });
      watchRef.current='gps';setTracking(true);
      const user=(await supabase.auth.getUser())?.data?.user;if(user)await supabase.from('feed_events').insert({actor_id:user.id,event_type:'gps_started',activity_type:mode,title:title.trim()||meta.label,payload:{started_at:startedRef.current}});
    }catch(err){console.warn('Forma GPS start failed',err);setTracking(false);setGpsMessage('Не удалось запустить GPS. Проверьте разрешение геолокации или внесите тренировку вручную.');setManualOpen(true);}
  }
  async function startOrResumeExpedition(){
    setGpsMessage('');setResult(null);setManualOpen(false);setMode('hike');
    if(!native){setGpsMessage('Офлайн-поход с контрольными точками доступен в Android-приложении.');return;}
    try{
      const existing=loadExpeditionDraft(),started=existing?.startedAt||new Date().toISOString();
      startedRef.current=started;pointsRef.current=existing?.points||[];setTrackPoints(pointsRef.current);
      const draft={id:existing?.id||crypto.randomUUID(),active:true,startedAt:started,title:title.trim()||existing?.title||'Многодневный поход',points:pointsRef.current};
      setExpedition(draft);persistExpeditionDraft(draft);
      await BackgroundGeolocation.start({backgroundTitle:'Форма · многодневный поход',backgroundMessage:'Редкие GPS-точки сохраняются офлайн. Интернет не нужен.',requestPermissions:true,stale:false,distanceFilter:25,minIntervalMs:300000},(position,err)=>{if(err)return;appendPoint(position,true);});
      watchRef.current='expedition';setTracking(true);
    }catch(err){console.warn('Forma expedition start failed',err);setGpsMessage('Не удалось запустить офлайн-запись похода. Проверьте разрешение геолокации.');}
  }
  async function finishExpedition(){
    const active=watchRef.current;watchRef.current=null;if(active)await BackgroundGeolocation.stop().catch(()=>{});setTracking(false);
    const draft=loadExpeditionDraft()||expedition;if(!draft)return;
    const summary=summarizeRoute(draft.points||[],'hike'),days=expeditionDays(draft.points||[]),verified=days.filter(d=>d.pointCount>=2);
    if(!verified.length){setGpsMessage('Пока недостаточно контрольных GPS-точек. Продолжите запись похода.');return;}
    setSaving(true);
    try{
      await onSaveExpedition({title:draft.title||'Многодневный поход',startDate:verified[0].date,days:verified,distance:summary.distance,duration:summary.totalSeconds,movingDuration:summary.movingSeconds,transportDistance:summary.transportDistance,routePoints:compactRoutePoints(summary.points),startedAt:draft.startedAt,endedAt:new Date().toISOString()});
      persistExpeditionDraft(null);setExpedition(null);pointsRef.current=[];setTrackPoints([]);
    }catch(err){
      console.warn('Forma expedition sync failed',err);setGpsMessage('Поход сохранён на телефоне. Данные не потеряны — синхронизируйте, когда появится интернет.');
    }finally{setSaving(false);}
  }
  async function saveManual(){setSaving(true);try{const km=Math.max(0,Number(distance)||0),payload={type:mode,date:dateKey,title:title.trim()||meta.label,distance:km,trackingMode:'manual',gpsVerified:false,ratingEligible:mode==='moto'?false:dateKey===localDateKey()};if(mode==='hike'){payload.hikeDays=1;payload.hikeDistance=km;}await onSave(payload);}finally{setSaving(false);}}
  async function saveGpsResult(){if(!result)return;setSaving(true);try{const payload={type:mode,date:localDateKey(),title:result.title,distance:result.distance,duration:result.duration,movingDuration:result.movingDuration,stopDuration:result.stopDuration,stopCount:result.stopCount,transportDistance:result.transportDistance,avgSpeed:result.avgSpeed,maxSpeed:result.maxSpeed,routePoints:result.routePoints,startedAt:result.startedAt,endedAt:result.endedAt,trackingMode:'gps',gpsVerified:true,ratingEligible:mode==='moto'?result.distance>=150:true};if(mode==='hike'){payload.hikeDays=1;payload.hikeDistance=result.distance;}await onSave(payload);}finally{setSaving(false);}}
  if(result)return <main className={'sub-screen outdoor-training-screen outdoor-'+mode}><ScreenBack onBack={()=>setResult(null)} title="Тренировка завершена"/><RouteResultCard session={result}/>{mode==='moto'&&result.distance<150&&<div className="manual-rating-note">Мото сохранится в истории и статистике, но активный день начисляется только за GPS-поездку от 150 км.</div>}<button className="gradient-button" onClick={saveGpsResult} disabled={saving}>{saving?'Сохраняю…':'Сохранить тренировку'}</button></main>;
  const recent=[...history].sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,3);
  return <main className={'sub-screen outdoor-training-screen outdoor-'+mode}><ScreenBack onBack={onBack} title="Вело / Бег / ПВД / Мото"/><div className="outdoor-mode-tabs">{OUTDOOR_MODES.map(x=><button key={x.id} className={mode===x.id?'active':''} onClick={()=>selectMode(x.id)} disabled={tracking}><span>{x.icon}</span>{x.label}</button>)}</div>
    {expedition&&!tracking&&mode==='hike'&&<section className="expedition-resume-card"><small>ОФЛАЙН-ПОХОД СОХРАНЁН НА ТЕЛЕФОНЕ</small><strong>{expedition.title||'Многодневный поход'}</strong><span>{expedition.points?.length||0} контрольных GPS-точек</span><button className="gradient-button" onClick={startOrResumeExpedition}>Продолжить запись</button><button className="secondary-dark" onClick={finishExpedition} disabled={saving}>{saving?'Синхронизирую…':'Завершить и синхронизировать'}</button></section>}
    {tracking&&<section className={'gps-live-card '+(watchRef.current==='expedition'?'expedition-live':'')}><div className="gps-live-pulse"><i/>{watchRef.current==='expedition'?'Офлайн-поход · контрольные точки':'GPS записывает'}</div><RouteSketch points={trackPoints}/><div className="gps-live-metrics"><span><small>{mode==='hike'?'Пешком':'Дистанция'}</small><strong>{live.distance.toFixed(2)} км</strong></span><span><small>{mode==='hike'?'Всего':'В движении'}</small><strong>{formatDuration(mode==='hike'?live.totalSeconds:live.movingSeconds)}</strong></span><span><small>{mode==='hike'?'Транспорт':'Средняя'}</small><strong>{mode==='hike'?live.transportDistance.toFixed(1)+' км':live.avgSpeed.toFixed(1)+' км/ч'}</strong></span></div>{(mode==='bike'||mode==='run'||mode==='moto')&&<small className="gps-stop-live">{mode==='moto'?'Отдых ≥2 мин':'Остановки ≥10 сек'}: {live.stopCount} · {formatDuration(live.stopSeconds)}</small>}{watchRef.current==='expedition'?<button className="stop-gps-button" onClick={finishExpedition}>Завершить многодневный поход</button>:<button className="stop-gps-button" onClick={stopGps}>Завершить тренировку</button>}</section>}
    {!tracking&&!expedition&&<section className="outdoor-actions outdoor-actions-v17"><button className="gradient-button start-gps-button" onClick={startGps}><span>⌖</span>Начать GPS-тренировку</button>{mode==='hike'&&<button className="secondary-dark expedition-button" onClick={startOrResumeExpedition}>Многодневный поход · офлайн</button>}<button className="secondary-dark manual-training-button" onClick={()=>setManualOpen(v=>!v)}>Записать вручную</button><small>{mode==='hike'?'В ПВД транспортные отрезки быстрее 10 км/ч отмечаются пунктиром и не входят в пеший километраж.':mode==='moto'?'Мото даёт активный день только при GPS-подтверждении и дистанции от 150 км.':'GPS — основной режим. Ручная запись остаётся полноценным способом добавить тренировку.'}</small></section>}
    {gpsMessage&&<div className="gps-message">{gpsMessage}</div>}
    {manualOpen&&!tracking&&<section className="glass-card simple-form outdoor-manual-form"><label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} max={localDateKey()} onChange={e=>setDateKey(e.target.value)}/></label><label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={mode==='bike'?'Вечерняя поездка':mode==='run'?'Пробежка':mode==='moto'?'Мотопрогулка':'ПВД / Поход'}/></label><label className="dark-field"><span>Расстояние, км</span><input inputMode="decimal" type="number" min="0" step="0.1" value={distance} onChange={e=>setDistance(e.target.value)} placeholder="12.5"/></label>{(dateKey<localDateKey()||mode==='moto')&&<small className="manual-rating-note">{mode==='moto'?'Ручная запись Мото идёт в историю и статистику, но без рейтинговых баллов.':'Запись задним числом попадёт в историю и статистику, но не даст рейтинговых баллов.'}</small>}<button className="gradient-button" onClick={saveManual} disabled={saving}>{saving?'Сохраняю…':'Сохранить вручную'}</button></section>}
    {!tracking&&!manualOpen&&!expedition&&<section className="outdoor-stats-v17"><h2>Твоя статистика</h2><section className="outdoor-summary glass-card"><div><small>Всего</small><strong>{totalDistance.toFixed(1)} км</strong></div><div><small>Среднее</small><strong>{avgDistance.toFixed(1)} км</strong><em>за тренировку</em></div></section>{!!recent.length&&<div className="outdoor-recent-v17"><header><strong>Последние тренировки</strong><span>{history.length} всего</span></header>{recent.map(item=><div key={item.id}><span>{formatDate(item.date,{day:'numeric',month:'short'})}</span><strong>{item.title||meta.label}</strong><b>{sessionValue(item)}</b></div>)}</div>}</section>}
  </main>;
}

function CrossFitTraining({dateKey,setDateKey,onBack,onSave}){
  const [title,setTitle]=useState(''),[exercises,setExercises]=useState(''),[saving,setSaving]=useState(false);
  const [watchRunning,setWatchRunning]=useState(false),[watchAccum,setWatchAccum]=useState(0),watchStarted=useRef(null);
  const [workSec,setWorkSec]=useState(20),[restSec,setRestSec]=useState(10),[tabataRunning,setTabataRunning]=useState(false),[tabataPhase,setTabataPhase]=useState('work'),[tabataRemain,setTabataRemain]=useState(20),[tabataRound,setTabataRound]=useState(1);
  const phaseRef=useRef('work'),phaseEndRef=useRef(0),beepRef=useRef(null);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!watchRunning&&!tabataRunning)return;const id=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(id);},[watchRunning,tabataRunning]);
  const watchMs=watchAccum+(watchRunning&&watchStarted.current?Math.max(0,now-watchStarted.current):0);
  useEffect(()=>{
    if(!tabataRunning)return;const t=now;let end=phaseEndRef.current,phase=phaseRef.current,round=tabataRound,changed=false,guard=0;
    while(t>=end&&guard<50){phase=phase==='work'?'rest':'work';if(phase==='work')round+=1;end+=Math.max(1,phase==='work'?Number(workSec):Number(restSec))*1000;changed=true;guard+=1;}
    if(changed){phaseRef.current=phase;phaseEndRef.current=end;setTabataPhase(phase);setTabataRound(round);beepRef.current=null;playRoundGong();}
    const rem=Math.max(0,Math.ceil((end-t)/1000));setTabataRemain(rem);if(rem>0&&rem<=5&&beepRef.current!==rem){beepRef.current=rem;playTone(980,.085,.07,'square');navigator.vibrate?.(12);}
  },[now,tabataRunning,workSec,restSec]);
  function startWatch(){ensureAudioContext();if(watchRunning)return;watchStarted.current=Date.now();setWatchRunning(true);}
  function pauseWatch(){if(!watchRunning)return;setWatchAccum(v=>v+Math.max(0,Date.now()-watchStarted.current));watchStarted.current=null;setWatchRunning(false);}
  function resetWatch(){watchStarted.current=null;setWatchRunning(false);setWatchAccum(0);}
  function startTabata(){ensureAudioContext();const w=Math.max(1,Number(workSec)||20);setWorkSec(w);phaseRef.current='work';setTabataPhase('work');setTabataRound(1);setTabataRemain(w);phaseEndRef.current=Date.now()+w*1000;beepRef.current=null;setTabataRunning(true);playRoundGong();}
  function stopTabata(){if(tabataRunning)playFinalGong();setTabataRunning(false);beepRef.current=null;}
  async function save(){setSaving(true);try{if(watchRunning)pauseWatch();await onSave({type:'crossfit',date:dateKey,title:title.trim()||'CrossFit',workoutText:exercises.trim(),duration:Math.round(watchMs/1000)});}finally{setSaving(false);}}
  return <main className="sub-screen crossfit-screen"><ScreenBack onBack={onBack} title="CrossFit"/><p className="eyebrow-dark">Тренировка</p><h1>CrossFit</h1>
    <label className="date-control add-date-compact"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
    <section className="glass-card crossfit-exercises"><label><span>Упражнения / комплекс</span><textarea value={exercises} onChange={e=>setExercises(e.target.value)} placeholder="Например: 5 раундов · 10 подтягиваний · 20 махов · 15 бурпи"/></label><label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="CrossFit"/></label></section>
    <section className="glass-card crossfit-timer"><header><strong>Секундомер</strong><b>{formatDuration(watchMs/1000)}</b></header><div>{!watchRunning?<button className="gradient-button" onClick={startWatch}>{watchMs?'Продолжить':'Старт'}</button>:<button className="secondary-dark" onClick={pauseWatch}>Пауза</button>}<button className="secondary-dark" onClick={resetWatch}>Сброс</button></div></section>
    <section className={'glass-card tabata-card '+(tabataRunning?tabataPhase:'idle')}><header><div><small>Tabata</small><strong>{tabataRunning?(tabataPhase==='work'?'РАБОТА':'ОТДЫХ'):'Интервальный таймер'}</strong></div><b>{tabataRunning?tabataRemain+' сек':'—'}</b></header><div className="tabata-fields"><label><span>Нагрузка, сек</span><input type="number" min="1" max="3600" value={workSec} disabled={tabataRunning} onChange={e=>setWorkSec(e.target.value)}/></label><label><span>Отдых, сек</span><input type="number" min="1" max="3600" value={restSec} disabled={tabataRunning} onChange={e=>setRestSec(e.target.value)}/></label></div>{tabataRunning&&<p>Раунд {tabataRound} · за 5 секунд до смены этапа идут сигналы</p>}<div>{!tabataRunning?<button className="gradient-button" onClick={startTabata}>Запустить Tabata</button>:<button className="stop-gps-button" onClick={stopTabata}>Остановить</button>}</div></section>
    <button className="gradient-button crossfit-save" onClick={save} disabled={saving}>{saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить CrossFit'}</button>
  </main>;
}
function SimpleTraining({type,dateKey,setDateKey,sessions,onBack,onSave}){
  const meta=activityMeta(type);
  const [title,setTitle]=useState('');
  const [value,setValue]=useState('');
  const [saving,setSaving]=useState(false);

  const list=[...sessions]
    .filter(s=>s.type===type&&isHistorySession(s))
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const previous=list.slice(0,5);

  let valueLabel='',placeholder='',totalLabel='',totalValue='';
  if(type==='bike'){
    valueLabel='Километраж, км';placeholder='32.5';totalLabel='Общий пробег';
    totalValue=`${list.reduce((sum,x)=>sum+(Number(x.distance)||0),0).toLocaleString('ru-RU')} км`;
  }else{
    valueLabel='Количество шагов';placeholder='20000';totalLabel='Всего шагов';
    totalValue=list.reduce((sum,x)=>sum+(Number(x.steps)||0),0).toLocaleString('ru-RU');
  }

  async function save(){
    setSaving(true);
    try{
      const payload={type,date:dateKey,title:title.trim()||meta.label};
      if(type==='bike')payload.distance=Number(value)||0;
      if(type==='walk')payload.steps=Number(value)||0;
      await onSave(payload);
    }finally{setSaving(false);}
  }

  const placeholderTitle=type==='bike'?'Вечерняя поездка':'Прогулка по набережной';

  return <main className="sub-screen simple-training-screen">
    <ScreenBack onBack={onBack} title={meta.label}/>

    <section className="metric-hero"><ActivityGlyph type={type} className={meta.accent}/><div><small>{totalLabel}</small><strong>{totalValue||'0'}</strong></div></section>

    <section className="glass-card simple-form">
      <label className="date-control embedded"><span>Дата</span><input type="date" value={dateKey} onChange={e=>setDateKey(e.target.value)}/></label>
      <label className="dark-field"><span>Название — необязательно</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={placeholderTitle}/></label>
      <label className="dark-field"><span>{valueLabel} — необязательно</span><input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder={placeholder}/></label>
      <button className="gradient-button save-simple" onClick={save} disabled={saving}>{saving?'Сохраняю…':isFuture(dateKey)?'Запланировать':'Сохранить тренировку'}</button>
      {type==='walk'&&<small className="walk-rule">Менее 10 000 шагов сохранится в календаре и истории, но без номера, баллов, галочки и статистики.</small>}
    </section>

    <section className="recent-section">
      <header><h2>Последние 5</h2><span>{list.length} всего</span></header>
      {!previous.length&&<div className="empty-state compact-empty">Пока нет сохранённых тренировок.</div>}
      {previous.map(s=><article className="recent-row" key={s.id}>
        <span className={`recent-number ${meta.accent}`}>{s.displayNumber?`№${s.displayNumber}`:'—'}</span>
        <div><strong>{s.title||meta.label}</strong><small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}</small></div>
        <b>{sessionValue(s)}</b>
      </article>)}
    </section>
  </main>;
}

function History({sessions,onDelete,onUpdate,filterType=null}){
  const ordered=[...sessions]
    .filter(s=>isHistorySession(s)&&(!filterType||s.type===filterType))
    .sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const [openId,setOpenId]=useState(null);
  const [editingId,setEditingId]=useState(null);
  const [editTitle,setEditTitle]=useState('');
  const [editDistance,setEditDistance]=useState('');
  const [editBusy,setEditBusy]=useState(false);
  const [editError,setEditError]=useState('');

  async function remove(s){
    if(!window.confirm('Удалить эту тренировку из истории?'))return;
    await onDelete(s.id);
    if(openId===s.id)setOpenId(null);
  }
  function beginEdit(s){
    if(!canEditSession(s))return;
    setEditingId(s.id);setEditError('');
    setEditTitle(s.title||activityMeta(s.type)?.label||'');
    setEditDistance(String(Number(s.distance||s.hikeDistance||0)||''));
  }
  async function saveEdit(s){
    setEditBusy(true);setEditError('');
    try{
      const patch={title:editTitle};
      if(['bike','run','hike'].includes(s.type))patch.distance=editDistance;
      await onUpdate(s.id,patch);
      setEditingId(null);
    }catch(err){setEditError(err.message||'Не получилось сохранить изменения.');}
    finally{setEditBusy(false);}
  }

  return <main className="tab-screen history-screen">
    <p className="eyebrow-dark">Все активности</p><h1>История тренировок</h1>
    {!ordered.length&&<div className="empty-state">Пока ни одной состоявшейся тренировки.</div>}

    <div className="master-history">{ordered.map(s=>{
      const meta=activityMeta(s.type);
      const open=openId===s.id;
      return <article className={`master-history-row ${open?'open':''}`} key={s.id}>
        <div className="history-row-controls">
          <button className="history-main-button" onClick={()=>setOpenId(open?null:s.id)}>
            <span className={`history-type-icon ${meta?.accent||''}`}><ActivityGlyph type={s.type} className={meta?.accent||''}/></span>
            <span className="history-copy">
              <strong>{s.displayNumber?`Тренировка №${s.displayNumber} · `:''}{s.title||meta?.label}</strong>
              <small>{formatDate(s.date,{day:'numeric',month:'long',year:'numeric'})}{!s.ratingEligible&&s.type!=='walk'?' · без рейтинга':(!s.displayNumber&&s.type==='walk'?' · без баллов':'')}</small>
            </span>
            <span className="history-value">{sessionValue(s)}</span>
            <b>{open?'⌃':'⌄'}</b>
          </button>
          <button className="delete-training-button" onClick={()=>remove(s)} aria-label="Удалить">×</button>
        </div>

        {open&&<div className="master-detail">
          {s.routePoints?.length?<RouteResultCard session={s} compact/>:s.type==='gym'
            ?<>{s.gymGroup==='custom'?<ReadonlyExerciseBlock title="Упражнения" rows={s.baseRows||[]}/>:<><ReadonlyExerciseBlock title="База" rows={s.baseRows||[]}/><ReadonlyExerciseBlock title="Доп" rows={s.extraRows||[]}/></>}<div className="history-tonnage">Тоннаж: <strong>{formatKg(workoutTonnage(s.baseRows||[],s.extraRows||[]))} кг</strong></div></>
            :s.type==='workout'?<p className="workout-history-text">{s.workoutText||'Описание не сохранено.'}</p>
            :s.type==='hike'?<div className="hike-history-detail"><strong>{s.title||'Хайкинг'}</strong><span>{Math.max(Number(s.hikeDays)||1,1)} дн.</span><span>{Number(s.distance||s.hikeDistance||0).toLocaleString('ru-RU')} км</span></div>
            :s.type==='combat'?<div className="combat-history-detail"><strong>{s.combatType||s.title||'Единоборства'}</strong></div>
            :s.type==='crossfit'?<div className="crossfit-history-detail"><strong>{s.title||'CrossFit'}</strong><span>{s.duration?formatDuration(s.duration):'Без времени'}</span><p>{s.workoutText||'Комплекс не указан.'}</p></div>
            :<p>{sessionValue(s)}</p>}
          {canEditSession(s)&&editingId!==s.id&&<button type="button" className="history-edit-button-v18" onClick={()=>beginEdit(s)}>Редактировать · доступно 24 часа</button>}
          {editingId===s.id&&<div className="history-edit-form-v18">
            <label><span>Название</span><input value={editTitle} onChange={e=>setEditTitle(e.target.value)} maxLength={120}/></label>
            {['bike','run','hike'].includes(s.type)&&<label><span>Километраж, км</span><input type="number" min="0" step="0.1" inputMode="decimal" value={editDistance} onChange={e=>setEditDistance(e.target.value)}/></label>}
            {s.gpsVerified&&['bike','run','hike'].includes(s.type)&&<small>Маршрут, время и исходные GPS-точки сохранятся. Меняется только отображаемый километраж.</small>}
            {editError&&<em>{editError}</em>}
            <div><button type="button" className="secondary-dark" onClick={()=>setEditingId(null)} disabled={editBusy}>Отмена</button><button type="button" className="gradient-button" onClick={()=>saveEdit(s)} disabled={editBusy}>{editBusy?'Сохраняю…':'Сохранить'}</button></div>
          </div>}
        </div>}
      </article>;
    })}</div>
  </main>;
}

function Statistics({sessions,dailySteps,isBoss,hookahEvents,hookahStartedOn,profile,memberCount,onOpenMembers}){
  const [range,setRange]=useState('30d');
  const [customStart,setCustomStart]=useState(localDateKey(addDays(new Date(),-30)));
  const [customEnd,setCustomEnd]=useState(localDateKey());
  const season=seasonMeta();

  const today=new Date();
  let start,end=localDateKey(today);

  if(range==='prev-month'){
    const first=new Date(today.getFullYear(),today.getMonth(),1,12);
    start=localDateKey(addMonths(first,-1));
    end=localDateKey(addDays(first,-1));
  }else if(range==='30d')start=localDateKey(addDays(today,-29));
  else if(range==='6m')start=localDateKey(addMonths(today,-6));
  else if(range==='1y')start=localDateKey(addYears(today,-1));
  else{start=customStart;end=customEnd;}

  const filtered=sessions.filter(s=>isStatsSession(s)&&s.date>=start&&s.date<=end);
  const gymSessions=filtered.filter(s=>s.type==='gym');
  const gym=gymSessions.length;
  const tonnage=gymSessions.reduce((n,s)=>n+workoutTonnage(s.baseRows||[],s.extraRows||[]),0);
  const avgTonnage=gym?tonnage/gym:0;
  const bikeSessions=filtered.filter(s=>s.type==='bike');
  const bike=bikeSessions.reduce((n,s)=>n+(Number(s.distance)||0),0);
  const avgBike=bikeSessions.length?bike/bikeSessions.length:0;
  const runSessions=filtered.filter(s=>s.type==='run');
  const runDistance=runSessions.reduce((n,s)=>n+(Number(s.distance)||0),0);
  const avgRun=runSessions.length?runDistance/runSessions.length:0;
  const stepRows=(dailySteps||[]).filter(x=>x.date>=start&&x.date<=end);
  const stepTotal=stepRows.reduce((n,x)=>n+(Number(x.steps)||0),0);
  const avgSteps=stepRows.length?stepTotal/stepRows.length:0;
  const workoutCount=filtered.filter(s=>s.type==='workout').length;
  const combatCount=filtered.filter(s=>s.type==='combat').length;
  const hikes=filtered.filter(s=>s.type==='hike');
  const hikeCount=hikes.length;
  const hikeDays=hikes.reduce((n,s)=>n+(Math.max(Number(s.hikeDays)||1,1)),0);
  const hikeDistance=hikes.reduce((n,s)=>n+(Number(s.hikeDistance)||0),0);
  const todayKey=localDateKey();
  const trackedStart=start<hookahStartedOn?hookahStartedOn:start;
  const trackedEnd=end>todayKey?todayKey:end;
  const hookahInRange=isBoss?hookahEvents.filter(h=>h.event_date>=trackedStart&&h.event_date<=trackedEnd):[];
  const hookahCount=hookahInRange.length;
  const hookahDays=trackedEnd>=trackedStart?daysBetween(trackedStart,trackedEnd)+1:0;
  const hookahSlots=hookahDays*2;
  const hookahPossible=hookahDays*1000;
  const hookahByDay=hookahInRange.reduce((map,h)=>{
    map[h.event_date]=(map[h.event_date]||0)+1;
    return map;
  },{});
  const hookahLost=Object.values(hookahByDay).reduce((sum,count)=>sum+Math.min(Number(count)||0,2)*500,0);
  const hookahEarned=Math.max(0,hookahPossible-hookahLost);
  const hookahWeeklyAvg=hookahDays?hookahCount*7/hookahDays:0;
  const ranges=[['prev-month','Прошедший месяц'],['30d','30 дней'],['6m','6 месяцев'],['1y','Год'],['custom','Свой диапазон']];

  return <main className="tab-screen stats-screen">
    <p className="eyebrow-dark">Сводка</p><h1>Статистика</h1>

    <button className="rank-summary-card" onClick={onOpenMembers}>
      <div><small>Сезон {season.name}. День {season.day} из {season.total}</small><strong>{profile?.points||0} баллов</strong></div>
      <div><span>Рейтинг</span><b>{profile?.rank?`#${profile.rank}`:'—'} <em>из {memberCount}</em></b></div>
      <i>›</i>
    </button>

    <div className="range-tabs">{ranges.map(([key,label])=><button key={key} className={range===key?'active':''} onClick={()=>setRange(key)}>{label}</button>)}</div>
    {range==='custom'&&<div className="custom-range"><label><span>От</span><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}/></label><label><span>До</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/></label></div>}
    <p className="range-caption">{formatDate(start)} — {formatDate(end)}</p>

    <div className="stats-grid-big">
      <StatCard type="gym" accent="violet" title="Тренажёрка" value={gym.toLocaleString('ru-RU')} unit="тренировок"/>
      <StatCard type="gym" accent="tonnage" title="Тоннаж" value={formatKg(tonnage)} unit="кг" secondary={gym?`Среднее ${formatKg(avgTonnage)} кг / трен.`:''}/>
      <StatCard type="bike" accent="amber" title="Вело" value={bike.toLocaleString('ru-RU')} unit="км" secondary={bikeSessions.length?`Среднее ${avgBike.toFixed(1)} км / поездку`:''}/>
      <StatCard type="run" accent="run" title="Бег" value={runDistance.toLocaleString('ru-RU')} unit="км" secondary={runSessions.length?`Среднее ${avgRun.toFixed(1)} км / пробежку`:''}/>
      <StatCard type="steps" accent="green" title="Шаги" value={stepTotal.toLocaleString('ru-RU')} unit="шагов" secondary={stepRows.length?`Среднее ${Math.round(avgSteps).toLocaleString('ru-RU')} / день`:''}/>
      <StatCard type="workout" accent="coral" title="Воркаут" value={workoutCount.toLocaleString('ru-RU')} unit="тренировок"/>
      <StatCard type="combat" accent="combat" title="Единоборства" value={combatCount.toLocaleString('ru-RU')} unit="тренировок"/>
      <HikeStats count={hikeCount} days={hikeDays} distance={hikeDistance}/>
      {isBoss&&<article className="hookah-stat-card">
        <div><small>Кальян</small><strong>{hookahCount} из {hookahSlots}</strong><em>В среднем {hookahWeeklyAvg.toFixed(1)} / неделю</em></div>
        <div><small>Заработано</small><strong>{hookahEarned.toLocaleString('ru-RU')} ₽</strong><em>из {hookahPossible.toLocaleString('ru-RU')} ₽ возможных</em></div>
      </article>}
    </div>
  </main>;
}

function StatCard({type,accent,title,value,unit,secondary='' }){
  return <article className={`stat-card ${accent}`}><span className="stat-icon"><ActivityGlyph type={type} className={accent}/></span><div className="stat-copy"><small>{title}</small><strong>{value}</strong><em>{unit}</em>{secondary&&<i>{secondary}</i>}</div></article>;
}

function Members({members,profile,previousTop5}){
  const season=seasonMeta();
  const leaderboardRef=useRef(null);
  const previousTheme=season.previousName==='лето'?'summer'
    :season.previousName==='зима'?'winter'
    :season.previousName==='весна'?'spring':'autumn';
  const previousVisible=(previousTop5||[]).filter(item=>Number(item.points)>0||item.name===profile?.name);

  useEffect(()=>{
    const list=leaderboardRef.current;
    if(!list)return;
    const timer=requestAnimationFrame(()=>{
      const me=list.querySelector('.leader-row.me');
      if(!me)return;
      const target=me.offsetTop-list.clientHeight/2+me.offsetHeight/2;
      list.scrollTop=Math.max(0,target);
    });
    return ()=>cancelAnimationFrame(timer);
  },[members.length,profile?.id]);

  return <main className="tab-screen members-screen">
    <div className="members-head">
      <div><p className="eyebrow-dark">Рейтинг</p><h1>Участники</h1></div>
      <strong>{members.length}</strong>
    </div>

    <section className="season-card">
      <strong>Сезон {season.name}</strong>
      <span>День {season.day} из {season.total}</span>
    </section>

    <p className="members-caption">Участников всего: {members.length}. Рейтинг этого сезона обнуляется в первый день следующего сезона.</p>

    <div className="leaderboard-scroll" ref={leaderboardRef}>
      <div className="leaderboard">{members.map(m=><article key={m.id} className={`leader-row ${m.id===profile?.id?'me':''}`}>
        <span className="rank-place">{m.rank}</span>
        <span className="member-avatar">{m.name?.trim()?.[0]?.toUpperCase()||'У'}</span>
        <div><strong>{m.name}{m.id===profile?.id?' · вы':''}</strong><small>{m.rank===1?'Лидер сезона':`Место №${m.rank}`}</small></div>
        <b>★ {m.points||0}</b>
      </article>)}</div>
    </div>

    <section className={`previous-season previous-season-${previousTheme}`}>
      <header><small>Прошлый сезон</small><h2>Топ-5 · {season.previousName}</h2></header>
      {!previousVisible.length&&<div className="empty-state compact-empty">В прошлом сезоне пока нет данных.</div>}
      <div className="previous-season-list">
        {previousVisible.map(item=><div className={`previous-row ${item.name===profile?.name?'me':''}`} key={`${item.rank}-${item.name}`}>
          <span>{item.rank}</span>
          <span className="previous-avatar">{item.name?.trim()?.[0]?.toUpperCase()||'У'}</span>
          <strong>{item.name}{item.name===profile?.name?' · вы':''}</strong>
          <b>★ {item.points}</b>
        </div>)}
      </div>
    </section>

    <p className="inactive-rule">Аккаунты не удаляются. Если 45 дней нет активного дня, спортивная часть рейтинга становится 0. 15 000+ шагов считаются активным днём. Персональные штрафы могут уменьшать итоговый балл ниже нуля.</p>
  </main>;
}


function DateWheelV17({schedule,dailySteps,selectedDateKey,setSelectedDateKey}){
  const [open,setOpen]=useState(false);
  const selectedDate=dateFromKey(selectedDateKey);
  const activeMonday=mondayOf(selectedDate);
  const weekStarts=[addDays(activeMonday,-7),activeMonday,addDays(activeMonday,7)];
  const todayKey=localDateKey();
  const weekdayShort=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const weekday=new Intl.DateTimeFormat('ru-RU',{weekday:'long'}).format(selectedDate);

  function chooseDate(key){
    setSelectedDateKey(key);
    navigator.vibrate?.(7);
  }

  return <section className={'week-calendar-shell calendar-v17 '+(open?'calendar-open':'calendar-closed')}>
    <div className="calendar-focus-v17">
      <small>{selectedDateKey===todayKey?'Сегодня':'Выбранная дата'}</small>
      <strong>{formatDate(selectedDateKey,{day:'numeric',month:'long'})}</strong>
      <span>{weekday}</span>
      {selectedDateKey!==todayKey&&<button type="button" onClick={()=>chooseDate(todayKey)}>Вернуться к сегодня</button>}
    </div>
    <button type="button" className="calendar-toggle-v17" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span>▣</span><strong>Календарь</strong><b>{open?'⌃':'›'}</b></button>
    {open&&<div className="week-columns">
      {weekStarts.map((weekStart,weekIndex)=>{
        const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
        const firstKey=localDateKey(days[0]);
        const lastKey=localDateKey(days[6]);
        return <article className={'week-column '+(weekIndex===1?'active-week':'side-week')} key={firstKey}>
          <header><span>{weekIndex===1?'Эта неделя':weekIndex===0?'Предыдущая':'Следующая'}</span><small>{formatDate(firstKey,{day:'numeric',month:'short'})} — {formatDate(lastKey,{day:'numeric',month:'short'})}</small></header>
          <div className="week-days">{days.map((date,i)=>{
            const key=localDateKey(date);
            const selected=key===selectedDateKey;
            const item=schedule[key];
            const trainingCompleted=item?.status==='completed';
            const stepsForDay=Number((dailySteps||[]).find(x=>x.date===key)?.steps||0);
            const stepsCompleted=!trainingCompleted&&stepsForDay>=15000;
            const displayType=trainingCompleted?item?.type:(stepsCompleted?'steps':item?.type);
            const meta=activityMeta(displayType);
            const completed=trainingCompleted||stepsCompleted;
            const today=key===todayKey;
            return <button type="button" key={key} className={'week-day '+(selected?'selected ':'')+(today?'today':'')} onClick={()=>chooseDate(key)}>
              <span className="week-day-date"><b>{weekdayShort[i]}</b><strong>{date.getDate()}</strong></span>
              <span className={'week-day-activity '+(meta?.accent||'')}>{meta?<ActivityGlyph type={displayType} className={meta.accent}/>:null}</span>
              <span className={'week-day-status '+(completed?'completed':'')}>{completed?'✓':''}</span>
            </button>;
          })}</div>
        </article>;
      })}
    </div>}
  </section>;
}

function StepsHistoryV17({dailySteps,onBack}){
  const today=localDateKey();
  const rows=[...(dailySteps||[])].filter(x=>x.date<=today).sort((a,b)=>b.date.localeCompare(a.date));
  return <main className="sub-screen steps-history-v17">
    <ScreenBack onBack={onBack} title="Шаги"/>
    <p className="eyebrow-dark">История по дням</p><h1>Шаги</h1>
    {!rows.length&&<div className="empty-state">История шагов пока пуста.</div>}
    <div className="steps-history-list-v17">{rows.map(row=>{
      const active=Number(row.steps||0)>=15000;
      return <article key={row.date} className={active?'active-day':''}><div><strong>{formatDate(row.date,{day:'numeric',month:'long',year:'numeric'})}</strong><small>{active?'✓ активный день · 15 000+':''}</small></div><b>{Number(row.steps||0).toLocaleString('ru-RU')}</b></article>;
    })}</div>
  </main>;
}

function V17StatCard({type,accent,title,value,unit,secondary='',wide=false,onClick}){
  return <button type="button" className={'stat-card stat-card-v17 '+accent+(wide?' stat-wide':'')} onClick={onClick}>
    <span className="stat-icon"><ActivityGlyph type={type} className={accent}/></span>
    <span className="stat-copy"><small>{title}</small><strong>{value}</strong><em>{unit}</em>{secondary&&<i>{secondary}</i>}</span><b className="stat-open-arrow">›</b>
  </button>;
}

function HookahHistoryFullscreen({hookahEvents,hookahStartedOn,hookahProgramStartedOn,withdrawals,onClose}){
  const [weekOffset,setWeekOffset]=useState(0);
  const touchStart=useRef(null);
  const todayKey=localDateKey(),currentMonday=mondayOf(new Date()),weekStart=addDays(currentMonday,weekOffset*7);
  const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const days=Array.from({length:7},(_,i)=>localDateKey(addDays(weekStart,i)));
  function shift(delta){setWeekOffset(v=>Math.min(0,v+delta));}
  function touchEnd(e){if(touchStart.current==null)return;const dx=(e.changedTouches?.[0]?.clientX||0)-touchStart.current;touchStart.current=null;if(Math.abs(dx)<45)return;shift(dx<0?1:-1);}
  return <div className="hookah-fullscreen" onTouchStart={e=>{touchStart.current=e.touches?.[0]?.clientX??null;}} onTouchEnd={touchEnd}>
    <header className="hookah-fullscreen-head"><div><small>Фонд ерунды</small><h2>Кальян · история</h2></div><button onClick={onClose}>×</button></header>
    <section className="hookah-week-switch"><button onClick={()=>shift(-1)}>‹</button><div><strong>{weekOffset===0?'Эта неделя':formatDate(days[0],{day:'numeric',month:'short'})+' — '+formatDate(days[6],{day:'numeric',month:'short'})}</strong><small>Листай недели влево / вправо</small></div><button onClick={()=>shift(1)} disabled={weekOffset===0}>›</button></section>
    <section className="hookah-full-week">{days.map((key,i)=>{
      const plan=hookahDayPlan(key,hookahProgramStartedOn),ordinary=hookahCountForDate(hookahEvents,key),bonus=hookahEvents.some(h=>h.event_date===key&&h.isBonus),started=key>=hookahStartedOn,finished=key<todayKey,money=started?hookahEarningForDay(hookahEvents,key,hookahProgramStartedOn):null;
      return <article key={key} className={(finished?'finished ':'')+(money>0?'earned ':'')+(key===todayKey?'today ':'')}>
        <div className="hookah-day-name"><small>{weekdays[i]}</small><strong>{dateFromKey(key).getDate()}</strong></div>
        <div className="hookah-day-data"><span>{plan.label}</span><strong>{ordinary} / {plan.slots} обычных</strong>{bonus&&<em>Бонусный ✓</em>}</div>
        <div className="hookah-day-money">{!started?<small>—</small>:<><strong>{money.toLocaleString('ru-RU')} ₽</strong><small>{finished?'заработано':'можно заработать'}</small></>}</div>
      </article>;
    })}</section>
    <section className="withdraw-history-full"><header><strong>История выводов</strong><span>{withdrawals.length}</span></header>{!withdrawals.length?<small>Выводов пока не было.</small>:withdrawals.map(row=><div key={row.id}><span>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(row.withdrawn_at))}</span><b>{Number(row.amount||0).toLocaleString('ru-RU')} ₽</b></div>)}</section>
  </div>;
}

function StatisticsV17({sessions,dailySteps,isBoss,hookahEvents,hookahStartedOn,hookahProgramStartedOn,profile,memberCount,onOpenMembers,onOpenHistory,onOpenSteps}){
  const [range,setRange]=useState('30d');
  const [customStart,setCustomStart]=useState(localDateKey(addDays(new Date(),-30)));
  const [customEnd,setCustomEnd]=useState(localDateKey());
  const [hookahOpen,setHookahOpen]=useState(false);
  const [withdrawals,setWithdrawals]=useState([]);
  const [withdrawing,setWithdrawing]=useState(false);
  const season=seasonMeta();

  useEffect(()=>{
    let active=true;
    if(!isBoss||!profile?.id){setWithdrawals([]);return ()=>{active=false;};}
    supabase.from('hookah_withdrawals').select('id,amount,withdrawn_at').eq('user_id',profile.id).order('withdrawn_at',{ascending:false})
      .then(({data,error})=>{if(!active)return;if(error)console.warn('Forma withdrawals load failed',error);else setWithdrawals(data||[]);});
    return ()=>{active=false;};
  },[isBoss,profile?.id]);

  const today=new Date();
  let start,end=localDateKey(today);
  if(range==='prev-month'){
    const first=new Date(today.getFullYear(),today.getMonth(),1,12);
    start=localDateKey(addMonths(first,-1));end=localDateKey(addDays(first,-1));
  }else if(range==='30d')start=localDateKey(addDays(today,-29));
  else if(range==='6m')start=localDateKey(addMonths(today,-6));
  else if(range==='1y')start=localDateKey(addYears(today,-1));
  else{start=customStart;end=customEnd;}

  const filtered=sessions.filter(x=>isStatsSession(x)&&x.date>=start&&x.date<=end);
  const gymSessions=filtered.filter(x=>x.type==='gym');
  const gym=gymSessions.length;
  const tonnage=gymSessions.reduce((n,x)=>n+workoutTonnage(x.baseRows||[],x.extraRows||[]),0);
  const avgTonnage=gym?tonnage/gym:0;
  const bikeSessions=filtered.filter(x=>x.type==='bike');
  const bike=bikeSessions.reduce((n,x)=>n+(Number(x.distance)||0),0);
  const avgBike=bikeSessions.length?bike/bikeSessions.length:0;
  const runSessions=filtered.filter(x=>x.type==='run');
  const runDistance=runSessions.reduce((n,x)=>n+(Number(x.distance)||0),0);
  const avgRun=runSessions.length?runDistance/runSessions.length:0;
  const stepRows=(dailySteps||[]).filter(x=>x.date>=start&&x.date<=end);
  const stepTotal=stepRows.reduce((n,x)=>n+(Number(x.steps)||0),0);
  const avgSteps=stepRows.length?stepTotal/stepRows.length:0;
  const workoutCount=filtered.filter(x=>x.type==='workout').length;
  const combatCount=filtered.filter(x=>x.type==='combat').length;
  const crossfitCount=filtered.filter(x=>x.type==='crossfit').length;
  const motoSessions=filtered.filter(x=>x.type==='moto');
  const motoDistance=motoSessions.reduce((n,x)=>n+(Number(x.distance)||0),0);
  const avgMoto=motoSessions.length?motoDistance/motoSessions.length:0;
  const hikes=filtered.filter(x=>x.type==='hike');
  const hikeCount=hikes.length;
  const hikeDays=hikes.reduce((n,x)=>n+Math.max(Number(x.hikeDays)||1,1),0);
  const hikeDistance=hikes.reduce((n,x)=>n+(Number(x.distance||x.hikeDistance)||0),0);

  const todayKey=localDateKey();
  const trackedStart=start<hookahStartedOn?hookahStartedOn:start;
  const trackedEnd=end>todayKey?todayKey:end;
  const hookahInRange=isBoss?ordinaryHookahEvents(hookahEvents).filter(h=>h.event_date>=trackedStart&&h.event_date<=trackedEnd):[];
  const hookahCount=hookahInRange.length;
  const hookahDays=trackedEnd>=trackedStart?daysBetween(trackedStart,trackedEnd)+1:0;
  let hookahSlots=0;
  if(hookahDays>0){for(let i=0;i<Math.min(hookahDays,5000);i++)hookahSlots+=hookahDayPlan(localDateKey(addDays(dateFromKey(trackedStart),i)),hookahProgramStartedOn).slots;}
  const hookahWeeklyAvg=hookahDays?hookahCount*7/hookahDays:0;
  const earningForDay=key=>hookahEarningForDay(hookahEvents,key,hookahProgramStartedOn);

  const yesterdayKey=localDateKey(addDays(dateFromKey(todayKey),-1));
  let lifetimeEarned=0;
  if(isBoss&&hookahStartedOn&&hookahStartedOn<=yesterdayKey){
    const maxDays=Math.min(daysBetween(hookahStartedOn,yesterdayKey)+1,5000);
    for(let i=0;i<maxDays;i++) lifetimeEarned+=earningForDay(localDateKey(addDays(dateFromKey(hookahStartedOn),i)));
  }
  const withdrawnTotal=withdrawals.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const available=Math.max(0,lifetimeEarned-withdrawnTotal);

  async function withdraw(){
    if(!isBoss||!profile?.id||available<=0||withdrawing)return;
    ensureAudioContext();setWithdrawing(true);
    try{
      const {data,error}=await supabase.from('hookah_withdrawals').insert({user_id:profile.id,amount:available}).select('id,amount,withdrawn_at').single();
      if(error)throw error;
      setWithdrawals(cur=>[data,...cur]);playCoinEffect();
    }catch(err){console.error('Forma withdrawal save failed',err);window.alert('Не получилось зафиксировать вывод. Попробуй ещё раз.');}
    finally{setWithdrawing(false);}
  }

  const ranges=[['prev-month','Прошедший месяц'],['30d','30 дней'],['6m','6 месяцев'],['1y','Год'],['custom','Свой диапазон']];
  const compact=[];
  if(bike>0)compact.push({key:'bike',type:'bike',accent:'amber',title:'Вело',value:bike.toLocaleString('ru-RU'),unit:'км',secondary:bikeSessions.length?'Среднее '+avgBike.toFixed(1)+' км / поездку':'',open:()=>onOpenHistory('bike')});
  if(runDistance>0)compact.push({key:'run',type:'run',accent:'run',title:'Бег',value:runDistance.toLocaleString('ru-RU'),unit:'км',secondary:runSessions.length?'Среднее '+avgRun.toFixed(1)+' км / пробежку':'',open:()=>onOpenHistory('run')});
  if(hikeCount>0)compact.push({key:'hike',type:'hike',accent:'hike',title:'ПВД / Поход',value:(hikeDistance||hikeCount).toLocaleString('ru-RU'),unit:hikeDistance?'км':'походов',secondary:hikeCount+' походов · '+hikeDays+' дн.',open:()=>onOpenHistory('hike')});
  if(motoDistance>0)compact.push({key:'moto',type:'moto',accent:'moto',title:'Мото',value:motoDistance.toLocaleString('ru-RU'),unit:'км',secondary:motoSessions.length?'Среднее '+avgMoto.toFixed(1)+' км / поездку':'',open:()=>onOpenHistory('moto')});
  if(stepTotal>0)compact.push({key:'steps',type:'steps',accent:'green',title:'Шаги',value:stepTotal.toLocaleString('ru-RU'),unit:'шагов',secondary:stepRows.length?'Среднее '+Math.round(avgSteps).toLocaleString('ru-RU')+' / день':'',open:onOpenSteps});
  if(workoutCount>0)compact.push({key:'workout',type:'workout',accent:'coral',title:'Воркаут',value:workoutCount.toLocaleString('ru-RU'),unit:'тренировок',secondary:'',open:()=>onOpenHistory('workout')});
  if(combatCount>0)compact.push({key:'combat',type:'combat',accent:'combat',title:'Единоборства',value:combatCount.toLocaleString('ru-RU'),unit:'тренировок',secondary:'',open:()=>onOpenHistory('combat')});
  if(crossfitCount>0)compact.push({key:'crossfit',type:'crossfit',accent:'crossfit',title:'CrossFit',value:crossfitCount.toLocaleString('ru-RU'),unit:'тренировок',secondary:'',open:()=>onOpenHistory('crossfit')});

  return <main className="tab-screen stats-screen stats-v17">
    <p className="eyebrow-dark">Сводка</p><h1>Статистика</h1>
    <button className="rank-summary-card" onClick={onOpenMembers}><div><small>Сезон {season.name}. День {season.day} из {season.total}</small><strong>{profile?.points||0} баллов</strong></div><div><span>Рейтинг</span><b>{profile?.rank?'#'+profile.rank:'—'} <em>из {memberCount}</em></b></div><i>›</i></button>
    <div className="range-tabs">{ranges.map(item=><button key={item[0]} className={range===item[0]?'active':''} onClick={()=>setRange(item[0])}>{item[1]}</button>)}</div>
    {range==='custom'&&<div className="custom-range"><label><span>От</span><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)}/></label><label><span>До</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)}/></label></div>}
    <p className="range-caption">{formatDate(start)} — {formatDate(end)}</p>

    <div className="stats-grid-big stats-grid-v17">
      {gym>0&&<button type="button" className="gym-stat-card-v17 stat-wide" onClick={()=>onOpenHistory('gym')}><span className="stat-icon"><ActivityGlyph type="gym" className="violet"/></span><span><small>Тренажёрка</small><strong>{gym} тренировок</strong><em>Тоннаж {formatKg(tonnage)} кг · среднее {formatKg(avgTonnage)} кг / трен.</em></span><b>›</b></button>}
      {compact.map((card,index)=><V17StatCard key={card.key} {...card} onClick={card.open} wide={compact.length%2===1&&index===compact.length-1}/>)}
      {Number(profile?.seriesCount||0)>0&&<article className="series-stat-card-v110"><small>Серии сезона</small><strong>{profile.seriesCount}</strong><em>закрыто полностью</em></article>}
      {!gym&&!compact.length&&!isBoss&&<div className="empty-state stat-empty-v17">В выбранном периоде пока нет активности.</div>}
      {isBoss&&<article className="hookah-stat-card hookah-stat-v17" onClick={()=>setHookahOpen(true)}>
        <div className="hookah-stat-main-v17"><small>Кальян</small><strong>{hookahCount} из {hookahSlots}</strong><em>В среднем {hookahWeeklyAvg.toFixed(1)} / неделю · {hookahDayPlan(todayKey,hookahProgramStartedOn).label}</em></div>
        <div className="hookah-fund-v17"><small>Фонд ерунды</small><strong>{available.toLocaleString('ru-RU')} ₽</strong><em>Доступно к выводу</em><button type="button" disabled={!available||withdrawing} onClick={e=>{e.stopPropagation();withdraw();}}>{withdrawing?'Фиксирую…':'Вывел деньги'}</button></div>
        <b className="hookah-expand-v17">›</b>
      </article>}
    </div>
    {hookahOpen&&<HookahHistoryFullscreen hookahEvents={hookahEvents} hookahStartedOn={hookahStartedOn} hookahProgramStartedOn={hookahProgramStartedOn} withdrawals={withdrawals} onClose={()=>setHookahOpen(false)}/>}
  </main>;
}

function MembersV17({members,profile,previousTop5}){
  const season=seasonMeta();
  const leaderboardRef=useRef(null);
  const [openId,setOpenId]=useState(null);
  const [events,setEvents]=useState({});
  const [loadingId,setLoadingId]=useState(null);
  const previousTheme=season.previousName==='лето'?'summer':season.previousName==='зима'?'winter':season.previousName==='весна'?'spring':'autumn';
  const previousVisible=(previousTop5||[]).filter(item=>Number(item.points)>0||item.name===profile?.name);

  useEffect(()=>{
    const list=leaderboardRef.current;if(!list)return;
    const timer=requestAnimationFrame(()=>{const me=list.querySelector('.leader-row.me');if(!me)return;list.scrollTop=Math.max(0,me.offsetTop-list.clientHeight/2+me.offsetHeight/2);});
    return ()=>cancelAnimationFrame(timer);
  },[members.length,profile?.id]);

  async function toggle(member){
    if(openId===member.id){setOpenId(null);return;}
    setOpenId(member.id);
    if(events[member.id])return;
    setLoadingId(member.id);
    try{
      const {data,error}=await supabase.rpc('member_point_events',{p_user_id:member.id,p_limit:10});
      if(error)throw error;
      setEvents(cur=>({...cur,[member.id]:data||[]}));
    }catch(err){console.error('Forma member events failed',err);setEvents(cur=>({...cur,[member.id]:[]}));}
    finally{setLoadingId(null);}
  }

  return <main className="tab-screen members-screen members-v17">
    <div className="members-head"><div><p className="eyebrow-dark">Рейтинг</p><h1>Участники</h1></div><strong>{members.length}</strong></div>
    <section className="season-card"><strong>Сезон {season.name}</strong><span>День {season.day} из {season.total}</span></section>
    <p className="members-caption">Нажми на участника, чтобы увидеть его последние 10 начислений баллов.</p>
    <div className="leaderboard-scroll" ref={leaderboardRef}><div className="leaderboard">{members.map(m=><div className="leader-item-v17" key={m.id}>
      <button type="button" className={'leader-row '+(m.id===profile?.id?'me':'')} onClick={()=>toggle(m)}>
        <span className="rank-place">{m.rank}</span><span className="member-avatar">{m.name?.trim()?.[0]?.toUpperCase()||'У'}</span><div><strong>{m.name}{m.id===profile?.id?' · вы':''}</strong><small>{m.rank===1?'Лидер сезона':'Место №'+m.rank}</small><em>Серий: {Number(m.series_count)||0}</em></div><b>★ {m.points||0}</b><i>{openId===m.id?'⌃':'⌄'}</i>
      </button>
      {openId===m.id&&<div className="member-events-v17">{loadingId===m.id?<small>Загружаю начисления…</small>:!(events[m.id]||[]).length?<small>Начислений в этом сезоне пока нет.</small>:(events[m.id]||[]).map((event,index)=><div key={event.event_date+'-'+index}><span><strong>{formatDate(event.event_date,{day:'numeric',month:'short'})}</strong><small>{event.reason}</small></span><b className={Number(event.delta)>=0?'plus':'minus'}>{Number(event.delta)>=0?'+':''}{event.delta}</b></div>)}</div>}
    </div>)}</div></div>
    <section className={'previous-season previous-season-'+previousTheme}><header><small>Прошлый сезон</small><h2>Топ-5 · {season.previousName}</h2></header>{!previousVisible.length&&<div className="empty-state compact-empty">В прошлом сезоне пока нет данных.</div>}<div className="previous-season-list">{previousVisible.map(item=><div className={'previous-row '+(item.name===profile?.name?'me':'')} key={item.rank+'-'+item.name}><span>{item.rank}</span><span className="previous-avatar">{item.name?.trim()?.[0]?.toUpperCase()||'У'}</span><strong>{item.name}{item.name===profile?.name?' · вы':''}<em>Серий: {Number(item.series_count)||0}</em></strong><b>★ {item.points}</b></div>)}</div></section>
    <p className="inactive-rule">Аккаунты не удаляются. Если 45 дней нет активного дня, спортивная часть рейтинга становится 0. 15 000+ шагов считаются активным днём. Персональные штрафы могут уменьшать итоговый балл ниже нуля.</p>
  </main>;
}

function FeedBell({onOpen}){
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let active=true;const load=async()=>{const {data}=await supabase.rpc('feed_unread_count');if(active)setCount(Number(data)||0);};load();
    const channel=supabase.channel('forma-feed-bell').on('postgres_changes',{event:'INSERT',schema:'public',table:'feed_events'},load).subscribe();
    const timer=setInterval(load,30000);return()=>{active=false;clearInterval(timer);supabase.removeChannel(channel);};
  },[]);
  return <button className="feed-bell" onClick={onOpen} aria-label="Лента"><span>🔔</span>{count>0&&<b>{count>99?'99+':count}</b>}</button>;
}
function FeedEventCard({event}){
  const copy=feedEventCopy(event),meta=activityMeta(event.activity_type),p=event.payload||{};
  return <article className={'feed-event '+event.event_type}><span className={'feed-event-icon '+(meta?.accent||'')}>{event.event_type==='new_user'?'👋':event.event_type==='gps_started'?'●':event.event_type==='gps_finished'?'✓':<ActivityGlyph type={event.activity_type} className={meta?.accent||''}/>}</span><div><strong>{copy.title}</strong><p>{copy.body}</p><small>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(event.created_at))}</small>{event.event_type==='gps_finished'&&Number(p.avg_speed||0)>0&&<em>Средняя {Number(p.avg_speed).toFixed(1)} км/ч</em>}</div></article>;
}
function FeedScreen({profile}){
  const defaults={inapp_new_user:true,inapp_gps:true,inapp_activity:true,push_enabled:true,push_new_user:true,push_gps:true,push_activity:true};
  const [events,setEvents]=useState([]),[settings,setSettings]=useState(defaults),[settingsOpen,setSettingsOpen]=useState(false),[permission,setPermission]=useState('');
  async function load(){
    const [{data:eventData,error:eventError},{data:setData}]=await Promise.all([supabase.rpc('feed_recent',{p_limit:100}),supabase.from('notification_settings').select('*').eq('user_id',profile.id).maybeSingle()]);
    if(eventError)console.warn('Forma feed load',eventError);else setEvents(eventData||[]);
    if(setData)setSettings({...defaults,...setData});else await supabase.from('notification_settings').upsert({user_id:profile.id,...defaults});
    await supabase.rpc('feed_mark_seen');
  }
  useEffect(()=>{let active=true;load();const channel=supabase.channel('forma-feed-screen').on('postgres_changes',{event:'INSERT',schema:'public',table:'feed_events'},()=>{if(active)load();}).subscribe();return()=>{active=false;supabase.removeChannel(channel);};},[profile.id]);
  async function toggle(key){const next={...settings,[key]:!settings[key],user_id:profile.id,updated_at:new Date().toISOString()};setSettings(next);await supabase.from('notification_settings').upsert(next);}
  async function permit(){setPermission((await requestDeviceNotificationPermission())?'Разрешено':'Не разрешено');}
  return <main className="tab-screen feed-screen"><div className="feed-head"><div><p className="eyebrow-dark">Сообщество</p><h1>Лента</h1></div><button onClick={()=>setSettingsOpen(v=>!v)}>⚙</button></div>
    {settingsOpen&&<section className="glass-card feed-settings"><header><strong>Уведомления</strong><button onClick={permit}>Разрешить на телефоне</button></header>{permission&&<small>{permission}</small>}<div className="feed-setting-row"><span>Новые участники</span><button className={settings.inapp_new_user?'on':''} onClick={()=>toggle('inapp_new_user')}>{settings.inapp_new_user?'Вкл':'Выкл'}</button></div><div className="feed-setting-row"><span>GPS старт / финиш</span><button className={settings.inapp_gps?'on':''} onClick={()=>toggle('inapp_gps')}>{settings.inapp_gps?'Вкл':'Выкл'}</button></div><div className="feed-setting-row"><span>Сохранённые активности</span><button className={settings.inapp_activity?'on':''} onClick={()=>toggle('inapp_activity')}>{settings.inapp_activity?'Вкл':'Выкл'}</button></div><hr/><div className="feed-setting-row"><span>Уведомления на телефон</span><button className={settings.push_enabled?'on':''} onClick={()=>toggle('push_enabled')}>{settings.push_enabled?'Вкл':'Выкл'}</button></div>{settings.push_enabled&&<><div className="feed-setting-row minor"><span>Новые участники</span><button className={settings.push_new_user?'on':''} onClick={()=>toggle('push_new_user')}>{settings.push_new_user?'Вкл':'Выкл'}</button></div><div className="feed-setting-row minor"><span>GPS</span><button className={settings.push_gps?'on':''} onClick={()=>toggle('push_gps')}>{settings.push_gps?'Вкл':'Выкл'}</button></div><div className="feed-setting-row minor"><span>Обычные активности</span><button className={settings.push_activity?'on':''} onClick={()=>toggle('push_activity')}>{settings.push_activity?'Вкл':'Выкл'}</button></div></>}</section>}
    <div className="feed-list">{!events.length&&<div className="empty-state">В ленте пока тихо.</div>}{events.map(e=><FeedEventCard key={e.id} event={e}/>)}</div>
  </main>;
}
function FeedNotificationBridge({userId,onOpenFeed}){
  useEffect(()=>{
    if(!userId)return;let alive=true,actionHandle;
    const channel=supabase.channel('forma-feed-device-'+userId).on('postgres_changes',{event:'INSERT',schema:'public',table:'feed_events'},async payload=>{
      const row=payload.new;if(!alive||!row||row.actor_id===userId)return;
      const {data:settings}=await supabase.from('notification_settings').select('*').eq('user_id',userId).maybeSingle();
      if(settings?.push_enabled===false)return;const cat=feedCategory(row.event_type);if(cat==='new_user'&&settings?.push_new_user===false)return;if(cat==='gps'&&settings?.push_gps===false)return;if(cat==='activity'&&settings?.push_activity===false)return;
      const {data}=await supabase.rpc('feed_recent',{p_limit:25});const event=(data||[]).find(x=>x.id===row.id);if(!event)return;const copy=feedEventCopy(event),nid=Array.from(String(row.id)).reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7);await showDeviceNotification(copy.title,copy.body,nid);
    }).subscribe();
    if(Capacitor.isNativePlatform())LocalNotifications.addListener('localNotificationActionPerformed',()=>onOpenFeed()).then(h=>{actionHandle=h;}).catch(()=>{});
    return()=>{alive=false;supabase.removeChannel(channel);actionHandle?.remove?.();};
  },[userId]);
  return null;
}

