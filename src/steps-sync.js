// Daily Health Connect totals are already deduplicated by Android. Never add
// overlapping sources or invent a zero for a day absent from the provider.
export function stepsDateKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function stepsReadStart(now,authorization){
  const start=new Date(now);
  if(authorization?.historyAccessAuthorized)start.setFullYear(start.getFullYear()-1);
  else start.setDate(start.getDate()-29);
  start.setHours(0,0,0,0);
  return start;
}
export function normalizeStepSamples(samples,now=new Date()){
  const byDate=new Map(),today=stepsDateKey(now);
  for(const sample of samples||[]){
    const time=new Date(sample.startDate),value=Number(sample.value);
    if(!Number.isFinite(time.getTime())||sample.value==null||!Number.isFinite(value)||value<0)continue;
    const date=stepsDateKey(time);
    if(date>today)continue;
    byDate.set(date,Math.max(Math.round(value),byDate.get(date)||0));
  }
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,steps])=>({date,steps}));
}
export function stepsFreshness(rows,now=new Date()){
  const today=stepsDateKey(now),yesterdayDate=new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate()-1);
  const yesterday=stepsDateKey(yesterdayDate);
  const latest=rows.filter(x=>x.date<=today).map(x=>x.date).sort().at(-1)||null;
  return {latest,today:rows.find(x=>x.date===today)?.steps??null,stale:!latest||latest<yesterday};
}
export function stepsStatusText(status,rows,now=new Date()){
  const {latest,stale}=stepsFreshness(rows,now);
  if(status==='permission')return 'Нет разрешения читать шаги. Разреши доступ в Health Connect.';
  if(status==='error')return 'Не удалось обновить шаги. Сохранённая история остаётся доступной.';
  if(status==='unavailable')return 'Health Connect недоступен на этом устройстве. Проверь его установку или обновление.';
  if(status==='web')return 'Обновление шагов выполняется в Android-приложении Forma. Браузер показывает сохранённую историю.';
  if(stale)return latest?`Свежие шаги не поступили. Последний день: ${latest}. Проверь передачу шагов из своего шагомера в Health Connect.`:'Health Connect пока не передал шаги. Проверь разрешения и передачу данных из своего шагомера.';
  return 'Шаги получены из Health Connect. Отсутствие записи за день не означает 0 шагов.';
}


export function sumStepSamplesByDate(samples,now=new Date()){
  const byDate=new Map(),today=stepsDateKey(now);
  for(const sample of samples||[]){
    const time=new Date(sample.startDate),value=Number(sample.value);
    if(!Number.isFinite(time.getTime())||sample.value==null||!Number.isFinite(value)||value<0)continue;
    const date=stepsDateKey(time);
    if(date>today)continue;
    byDate.set(date,(byDate.get(date)||0)+Math.round(value));
  }
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,steps])=>({date,steps}));
}

export function mergeStepRows(...groups){
  const byDate=new Map();
  for(const rows of groups){
    for(const row of rows||[]){
      if(!row?.date)continue;
      const value=Number(row.steps);
      if(!Number.isFinite(value)||value<0)continue;
      byDate.set(row.date,Math.max(Math.round(value),byDate.get(row.date)||0));
    }
  }
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,steps])=>({date,steps}));
}

export function nextHourly55(now=new Date()){
  const next=new Date(now);
  next.setSeconds(0,0);
  if(now.getMinutes()<55)next.setMinutes(55);
  else{
    next.setHours(next.getHours()+1);
    next.setMinutes(55);
  }
  return next;
}
