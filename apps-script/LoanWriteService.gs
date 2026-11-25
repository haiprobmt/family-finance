// Loans entered or corrected in the app (action loan_save, additive; APK 2.3.0 never calls it).
// `changes` is a JSON list of {op:'upsert'|'delete', row:{bank,month,principal,rate,interest,days},
// base:<the row as the app last saw it, or null for a new row>}. Rows are identified by bank + month.
// Every change is validated and checked against the sheet BEFORE anything is written; if any sheet
// row differs from its base, nothing is written and LOAN_CONFLICT returns the current schedule.
// Only columns A–F of the Loans sheet are touched, in place, so extra columns and row order are kept.
const LOAN_HEADERS=['Bank','Month','Principal','Rate','Interest','Days'];
const MAX_LOAN_CHANGES=600;
function loanFields(r){return r?JSON.stringify([String(r.bank),String(r.month),Number(r.principal),Number(r.rate),Number(r.interest),Number(r.days)]):'null';}
function validLoanRow(r){
  const bank=String(r&&r.bank||''),month=String(r&&r.month||'');
  if(!validLoanBank(bank))throw new Error('Tên khoản vay phải có 1–40 ký tự, không xuống dòng.');
  if(!/^\d{4}-(0[1-9]|1[012])$/.test(month)||month<'2026-10'||month>'2060-12')throw new Error('Tháng phải từ 10/2026 đến 12/2060.');
  if(bank==='Techcombank'&&month>='2026-11')throw new Error('Techcombank chỉ được theo dõi đến 10/2026.');
  return {bank,month};
}
function saveLoan(p){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let changes;try{changes=JSON.parse(p.changes||'null');}catch(e){changes=null;}
  if(!Array.isArray(changes)||!changes.length||changes.length>MAX_LOAN_CHANGES)throw new Error('Thay đổi lịch vay không hợp lệ.');
  const plan=[],seen=new Set();
  for(const c of changes){
    const op=c&&c.op==='delete'?'delete':'upsert',key=validLoanRow(c&&c.row);
    if(seen.has(key.bank+'|'+key.month))throw new Error('Trùng khoản vay/tháng: '+key.bank+' '+key.month);
    seen.add(key.bank+'|'+key.month);
    let next=null;
    if(op==='upsert'){
      const r=c.row;next={bank:key.bank,month:key.month,principal:Number(r.principal),rate:Number(r.rate),interest:Number(r.interest),days:Number(r.days)};
      if(!(Number.isFinite(next.principal)&&next.principal>=0&&next.principal<=1e13))throw new Error('Dư nợ gốc không hợp lệ ('+key.month+').');
      if(!(Number.isFinite(next.rate)&&next.rate>=0&&next.rate<=1))throw new Error('Lãi suất phải từ 0 đến 100%/năm ('+key.month+').');
      if(!(Number.isFinite(next.interest)&&next.interest>=0&&next.interest<=1e12))throw new Error('Tiền phải trả không hợp lệ ('+key.month+').');
      if(!(Number.isInteger(next.days)&&next.days>=1&&next.days<=31))throw new Error('Số ngày tính lãi phải từ 1 đến 31 ('+key.month+').');
    }
    plan.push({op,key,next,base:c.base||null});
  }
  let sheet=ss.getSheetByName('Loans');
  if(!sheet&&plan.every(x=>x.op==='delete'))return {ok:true,loans:readPrivateLoans()};
  const rows=sheet?sheet.getDataRange().getValues():[LOAN_HEADERS],headers=rows.shift()||[];
  if(sheet&&LOAN_HEADERS.some((h,i)=>headers[i]!==h))throw new Error('Loans cần cột: '+LOAN_HEADERS.join(', '));
  const tz=ss.getSpreadsheetTimeZone(),monthOf=v=>v instanceof Date?Utilities.formatDate(v,tz,'yyyy-MM'):String(v);
  const index=new Map();rows.forEach((r,i)=>{if(r[0])index.set(String(r[0])+'|'+monthOf(r[1]),i);});
  const writes=[],deletes=[],appends=[];
  for(const x of plan){
    const i=index.has(x.key.bank+'|'+x.key.month)?index.get(x.key.bank+'|'+x.key.month):-1;
    const current=i<0?null:{bank:x.key.bank,month:x.key.month,principal:Number(rows[i][2]),rate:Number(rows[i][3]),interest:Number(rows[i][4]),days:Number(rows[i][5])};
    if(x.op==='delete'){if(!current)continue;if(loanFields(x.base)!==loanFields(current))return loanConflict();deletes.push(i);continue;}
    if(current&&loanFields(current)===loanFields(x.next))continue;   // already saved (replayed request)
    if(loanFields(x.base)!==loanFields(current))return loanConflict();
    const row=["'"+x.next.bank,"'"+x.next.month,x.next.principal,x.next.rate,x.next.interest,x.next.days];
    if(current)writes.push({i,row});else appends.push(row);
  }
  if(!sheet){sheet=ss.insertSheet('Loans');sheet.getRange(1,1,1,LOAN_HEADERS.length).setValues([LOAN_HEADERS]);sheet.setFrozenRows(1);}
  for(const w of writes)sheet.getRange(w.i+2,1,1,w.row.length).setValues([w.row]);
  if(appends.length){const start=sheet.getLastRow()+1;sheet.getRange(start,1,appends.length,LOAN_HEADERS.length).setValues(appends);}
  for(const i of deletes.sort((a,b)=>b-a))sheet.deleteRow(i+2);
  return {ok:true,loans:readPrivateLoans()};
}
function loanConflict(){return {ok:false,code:'LOAN_CONFLICT',error:'Lịch vay đã thay đổi trên Google Sheets. Đã tải bản mới nhất, hãy kiểm tra rồi lưu lại.',loans:readPrivateLoans()};}
