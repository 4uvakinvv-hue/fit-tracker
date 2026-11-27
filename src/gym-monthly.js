import {GROUPS} from './gym-drafts.js';

const upper = [
  ["Жим штанги лёжа на горизонтальной скамье", 10],
  ["Тяга вертикального блока к груди средним хватом", 10],
  ["Жим гантелей лёжа на наклонной скамье", 10, "per_hand"],
  ["Горизонтальная тяга блока сидя нейтральным хватом", 10],
  ["Махи гантелей в стороны стоя", 12, "per_hand"],
  ["Сгибание рук с гантелями стоя с супинацией", 12, "per_hand"],
  ["Разгибание рук на верхнем блоке с канатом", 12],
];

const lower = [
  ["Жим ногами в наклонном тренажёре двумя ногами", 10],
  ["Румынская тяга со штангой", 10],
  ["Разгибание ног в тренажёре двумя ногами", 12],
  ["Сгибание ног в тренажёре сидя", 12],
  ["Подъёмы на носки стоя в тренажёре", 15],
  ["Скручивания на полу", 15],
];

const chest = [
  ["Жим штанги лёжа на горизонтальной скамье", 10],
  ["Жим гантелей лёжа на наклонной скамье", 10, "per_hand"],
  ["Сведение рук в тренажёре «бабочка»", 12],
  ["Махи гантелей в стороны стоя", 12, "per_hand"],
  ["Разгибание рук на верхнем блоке с канатом", 12],
  ["Сгибание рук с гантелями стоя с супинацией", 12, "per_hand"],
  ["Скручивания на полу", 15],
];

const back = [
  ["Тяга вертикального блока к груди средним хватом", 10],
  ["Горизонтальная тяга блока сидя нейтральным хватом", 10],
  ["Горизонтальная тяга в тренажёре с упором грудью, двумя руками", 10],
  ["Обратное разведение рук в тренажёре «бабочка»", 12],
  ["Сгибание рук с EZ-грифом стоя", 12],
  ["Гиперэкстензия с акцентом на разгибатели спины", 12],
  ["Разгибание рук на верхнем блоке с прямой рукоятью", 12],
];

const novemberDecember = {2:[upper,lower],3:[chest,back,lower]};
const programsByMonth = {'2026-11':novemberDecember,'2026-12':novemberDecember};

export function monthlyTemplates(date, days) {
 const month=date.slice(0,7);
 const latest=Object.keys(programsByMonth).sort().findLast(key=>key<=month);
 const program=(programsByMonth[latest]??novemberDecember)[days];
 return Object.fromEntries(GROUPS.map(({id},index)=>[id,{
  baseRows:(program[index] ?? []).map(([exercise,reps,weightBasis])=>({
   exercise,sets:'3',reps:String(reps),weight:/скручивания|гиперэкстензия/i.test(exercise)?'0':'',
   ...(weightBasis && {weightBasis}),
  })),
  extraRows:[],
 }]));
}

export function repeatTemplate(session) {
 const rows = [...(session.baseRows ?? []),...(session.extraRows ?? [])];
 return {baseRows:rows.filter(row=>row.exercise).map(row=>{
  const {exercise,sets,reps,weight,weightBasis,bodyWeight,superset,approaches} = row;
  return {exercise,sets,reps,weight,weightBasis,bodyWeight,superset,approaches};
 }),extraRows:[]};
}
