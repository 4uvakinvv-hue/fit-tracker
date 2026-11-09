// Single source of truth for approved FORMA Design v1.0 activity catalog.
export const FORMA_ACTIVITIES=Object.freeze([
 {id:'gym',label:'Тренажёрка',caption:'Силовая тренировка'},
 {id:'bike',label:'Вело',caption:'Езда на велосипеде'},
 {id:'hike',label:'Поход',caption:'Активный туризм'},
 {id:'run',label:'Бег',caption:'Пробежка и интервалы'},
 {id:'crossfit',label:'CrossFit',caption:'Высокоинтенсивный тренинг'},
 {id:'flaneuring',label:'Фланирование',caption:'Прогулка и активное движение'},
 {id:'workout',label:'Воркаут',caption:'Тренировки с весом тела'},
 {id:'combat',label:'Единоборства',caption:'Бокс, ММА и другие'}
]);
export const QUICK_DEFAULT=Object.freeze(['gym','bike']);
export function cleanQuickActivities(ids){
 return Array.isArray(ids)?[...new Set(ids.filter(id=>FORMA_ACTIVITIES.some(x=>x.id===id)))]:[...QUICK_DEFAULT];
}
export function allowedQuickActivity(id){return FORMA_ACTIVITIES.some(a=>a.id===id);}
