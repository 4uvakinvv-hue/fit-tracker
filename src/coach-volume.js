// Shared rules for training-load volume. Weight on bodyweight exercises is assistance or added resistance.
export const numeric = value => Number(String(value ?? '0').replace(',', '.'));
export function bodyweightMode(exercise = '') {
 const value=String(exercise).toLowerCase();
 if (/гравитрон|gravitron|assisted pull|assisted dip/.test(value)) return 'assisted';
 if (/подтягив|pull.?up|chin.?up|брусь|dip(?:s)?\b/.test(value)) return 'bodyweight';
 return 'external';
}
export function effectiveLoad(row, bodyWeight = null) {
 const weight=numeric(row?.weight);
 if (!Number.isFinite(weight) || weight<0) return 0;
 const mode=bodyweightMode(row?.exercise);
 if (mode === 'external') return weight * (row?.weightBasis === 'per_hand' ? 2 : 1);
 const own=numeric(row?.bodyWeight ?? bodyWeight);
 if (!Number.isFinite(own) || own<=0) return null;
 return mode === 'assisted' ? Math.max(0, own-weight) : own+weight;
}
export function rowVolume(row, bodyWeight = null) {
 const load=effectiveLoad(row, bodyWeight);
 if (load===null) return null;
 const sets=numeric(row?.sets), reps=numeric(row?.reps);
 if (![sets,reps].every(Number.isFinite) || sets<0 || reps<0) return 0;
 return sets*reps*load;
}
export function workoutVolume(rows=[], bodyWeight = null) {
 const values=rows.filter(r=>r?.exercise).map(row=>rowVolume(row,bodyWeight));
 return values.some(v=>v===null) ? null : values.reduce((sum,v)=>sum+v,0);
}
export function failureType(row, plan) {
 if (row?.failureType==='technical') return 'technical';
 if (row?.failureType==='full') return 'full';
 const label=String([row?.dayType,plan?.dayType,plan?.intensity,plan?.title].filter(Boolean).join(' ')).toLowerCase();
 if (/л[её]гк|light/.test(label)) return null;
 if (/средн|medium/.test(label)) return row?.trainToFailure ? 'technical' : null;
 if (/тяж[её]л|heavy/.test(label)) return row?.trainToFailure ? 'full' : null;
 return row?.trainToFailure ? 'full' : null;
}
export function formatPreviousDate(date) {
 if (!date) return '';
 const d=new Date(date+'T12:00:00');
 if (Number.isNaN(d.getTime())) return '';
 return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',weekday:'short'}).format(d);
}
