// Public bundle contains no personal loan records. Authenticated snapshot supplies them.
const LOAN_SCHEDULE={start:'2026-10',end:'2030-12',records:[],extraDebt:0};
try{const saved=JSON.parse(localStorage.getItem('ffpages:loans')||'null');if(saved&&Array.isArray(saved.records))Object.assign(LOAN_SCHEDULE,saved)}catch{}
