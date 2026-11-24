// FROZEN LEGACY ORACLE — verbatim excerpts of docs/app.js at commit 7cb5b74 (pre-3.0).
// Do not edit. Used by characterization/parity tests to prove refactored code
// reproduces legacy outputs. Globals below are set by the test harness.
var transactions=[],activeMonth=new Date(),budgets={};
const EXPENSE_CATS=[['food','Ăn uống','🍜'],['grocery','Đi chợ','🛒'],['kids','Con cái','🧸'],['transport','Xe cộ','🚗'],['home','Nhà cửa','🏠'],['bills','Điện nước','💡'],['health','Sức khỏe','♥'],['couple-allowance','Tiêu Vặt Vợ Chồng','👛'],['other','Khác','•••'],['loan-payment','Trả nợ','🏦']];
const INCOME_CATS=[['salary','Lương','💼'],['bonus','Thưởng','★'],['business','Kinh doanh','↗'],['other-income','Khác','+']];
function limitsAt(all,month){
 const out=Object.fromEntries(Object.entries(all).filter(([key])=>!key.includes(':')));
 for(const key of Object.keys(all).filter(k=>k.includes(':')&&k.slice(0,7)<=month).sort()){const cat=key.slice(8);if(all[key]===-1)delete out[cat];else out[cat]=all[key];}return out;
}
function money(n){return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n)||0))+' ₫'}
function budgetLevel(spend,budget){return budget>0?(spend/budget<=0.65?'green':spend/budget<0.9?'yellow':'red'):'unset'}
function moneyMillions(n){return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format((Number(n)||0)/1000000)+' tr'}
function dateISO(d=new Date()){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function catInfo(id,type='Expense'){if(id==='loan-payment')return ['loan-payment','Trả nợ','🏦'];return [...EXPENSE_CATS,...INCOME_CATS].find(c=>c[0]===id)||['other',type==='Expense'?'Khác':'Thu nhập','•']}
function currentTx(){const mk=monthKey(activeMonth);return transactions.filter(t=>String(t.date).slice(0,7)===mk)}
function totals(){return currentTx().reduce((a,t)=>{a[t.type==='Income'?'income':'expense']+=Number(t.amount)||0;return a},{expense:0,income:0})}
function effectiveBudgets(){const b=limitsAt(budgets,monthKey(activeMonth));return {...b,'loan-payment':b['loan-payment']??homeLoanSummary(monthKey(activeMonth)).total};}
function homeLoanSummary(month){
  const banks=trackedBanks(month);
  const rows=banks.map(bank=>{const source=LOAN_SCHEDULE.records.find(r=>r.bank===bank&&r.month===month);return source?calculateLoanPayment(source,loanRates):{bank,missing:true};});
  const missing=rows.some(r=>r.missing),label=month.split('-').reverse().join('/');
  const missingNote=!missing?'':month<LOAN_SCHEDULE.start?`${label}: chưa có lịch vay; dữ liệu bắt đầu từ 10/2026.`:`${label}: chưa có lịch ${rows.filter(r=>r.missing).map(r=>r.bank).join(', ')}.`;
  return {rows,missing,missingNote,total:(LOAN_SCHEDULE.extraDebt||0)+rows.reduce((sum,r)=>sum+(r.missing?0:Math.round(r.payment)),0)};
}
function sortTx(a,b){return String(b.date+b.timestamp).localeCompare(String(a.date+a.timestamp))}
function formatDate(s){const d=new Date(s+'T12:00:00');return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function historyDayGroups(rows,today){
  const groups=new Map([[today,[]]]);
  [...rows].sort(sortTx).forEach(t=>{const day=String(t.date||'').slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(t)});
  const days=[today,...[...groups.keys()].filter(day=>day!==today).sort((a,b)=>b.localeCompare(a))];
  return days.map(day=>({day,rows:groups.get(day)}));
}
function parseDigits(v){return Number(String(v).replace(/\D/g,''))||0}
function sameTransactionValues(a,b){return ['date','type','category','person','note'].every(k=>String(a[k]||'')===String(b[k]||''))&&Number(a.amount)===Number(b.amount)}
function mergeSheetTransactions(remote,local){
  const pending=local.filter(t=>!t.synced),remoteIds=new Set(remote.map(t=>t.id));
  return remote.map(t=>{const edit=pending.find(p=>p.id===t.id);if(!edit||sameTransactionValues(edit,t))return t;if(!edit.pendingUpdate&&!edit.conflict)edit.conflict={remote:t};return edit}).concat(pending.filter(t=>!remoteIds.has(t.id)));
}
function sheetDate(value){
  const raw=String(value||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  // This family's Sheet serializes local midnight as 16:00 UTC (UTC+8).
  // Recover its calendar date independently of the phone's timezone.
  const parsed=new Date(raw);
  if(raw.includes('T')&&!Number.isNaN(parsed.getTime())){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed);
    const get=type=>parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  return raw.slice(0,10);
}
function sheetRecord(row){
  return {id:String(row.ID||row.id||''),timestamp:String(row.Timestamp||row.timestamp||''),date:sheetDate(row.Date||row.date),type:String(row.Type||row.type||'Expense'),amount:Number(row.Amount||row.amount||0),category:String(row.Category||row.category||'other'),person:String(row.Person||row.person||'Gia đình'),note:String(row.Note||row.note||''),synced:true};
}
function swipeDestination(page,dx,dy,elapsed){
  const pages=['home','history','dashboard','budget'];
  const distance=Math.abs(dx),quick=elapsed>0&&elapsed<=250&&distance/elapsed>=.35;
  if(elapsed>1200||distance<(quick?28:48)||distance<Math.abs(dy)*1.6)return null;
  const index=pages.indexOf(page),next=index+(dx<0?1:-1);
  return index>=0&&next>=0&&next<pages.length?pages[next]:null;
}
function searchTokens(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').match(/[a-z0-9]+/g)||[];}
function nearWord(a,b){
  if(a.length<4||Math.abs(a.length-b.length)>1||/\d/.test(a+b))return false;
  let i=0;while(i<a.length&&a[i]===b[i])i++;
  if(a.length===b.length)return a.slice(i+1)===b.slice(i+1)||(a[i]===b[i+1]&&a[i+1]===b[i]&&a.slice(i+2)===b.slice(i+2));
  return a.length>b.length?a.slice(i+1)===b.slice(i):a.slice(i)===b.slice(i+1);
}
function matchesHistory(t,query){
  if(!query.length)return true;
  const words=searchTokens([t.note,catInfo(t.category,t.type)[1],t.person,t.type==='Expense'?'khoản chi':'thu nhập',t.date,t.amount,money(t.amount),t.amount%1000===0?(t.amount/1000)+'k':''].join(' '));
  return query.every(q=>words.some(w=>/^[0-9]+$/.test(q)?w===q:w.includes(q)||nearWord(q,w)));
}
