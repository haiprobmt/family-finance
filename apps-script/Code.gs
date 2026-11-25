// Family Finance API (apiVersion 3) — entry point and router.
// Bind this project to the family's existing spreadsheet. Project files (see files.json):
//   Domain.gs (generated financial engine), TransactionService.gs, BudgetService.gs,
//   LoanReadService.gs, Extensions.gs (additive ext_* actions), Migrations.gs, Assistant.gs.
// Compatibility: action names, request fields, responses and conflict codes are unchanged
// for APK 2.3.0 and older PWA builds (see implementation/API_COMPATIBILITY.md).
// Replaced with the commit id by the "Deploy Apps Script" GitHub workflow; doGet reports it so the
// workflow can confirm the new code is live. 'dev' = pasted by hand or local tests.
const BUILD_ID='dev';
const SHEET_NAME='Transactions';
const BUDGET_SHEET='Budgets';
const BUDGET_CATEGORIES=['food','grocery','kids','transport','home','bills','health','couple-allowance','other','loan-payment'];
const DEFAULT_BUDGETS=Object.fromEntries(BUDGET_CATEGORIES.filter(k=>k!=='loan-payment').map(k=>[k,0]));
// Legacy sheets only. New sheets are created exclusively by versioned migrations (Migrations.gs).
function setup(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let tx=ss.getSheetByName(SHEET_NAME);if(!tx)tx=ss.insertSheet(SHEET_NAME);
  if(tx.getLastRow()===0)tx.appendRow(['ID','Timestamp','Date','Type','Amount','Category','Person','Note']);
  let budget=ss.getSheetByName(BUDGET_SHEET);if(!budget)budget=ss.insertSheet(BUDGET_SHEET);
  if(budget.getLastRow()===0){const rows=[['Category','Budget','UpdatedAt'],...Object.entries(DEFAULT_BUDGETS).map(([category,value])=>[category,value,new Date().toISOString()])];budget.getRange(1,1,rows.length,3).setValues(rows);budget.setFrozenRows(1);}
  return 'Sẵn sàng. Đặt FAMILY_ACCESS_TOKEN (ít nhất 24 ký tự) trong Script properties và triển khai Web App.';
}
function json(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function authenticate(p){
  const expected=String(PropertiesService.getScriptProperties().getProperty('FAMILY_ACCESS_TOKEN')||'');
  if(expected.length<24)throw new Error('Chưa cấu hình FAMILY_ACCESS_TOKEN (ít nhất 24 ký tự) trong Apps Script.');
  const got=String(p.token||'');let difference=expected.length^got.length;
  for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^(got.charCodeAt(i)||0);
  if(difference!==0)throw new Error('Mã kết nối gia đình không đúng. Kiểm tra lại trong Cài đặt.');
}
// Text written to Sheets is truncated and protected against formula injection.
function literal(value,max){const text=String(value||'').slice(0,max||2000);return /^[=+@-]/.test(text)?"'"+text:text;}
function formatSheetDate(value,pattern){return value instanceof Date?Utilities.formatDate(value,SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(),pattern||'yyyy-MM-dd'):String(value==null?'':value);}
// ?build=1 is the deploy check (no data, no token); the plain response stays identical for old clients.
function doGet(e){
  if(e&&e.parameter&&e.parameter.build)return json({ok:true,apiVersion:3,build:BUILD_ID});
  return json({ok:true,apiVersion:3,message:'Family Finance API. Use authenticated POST.'});
}
function doPost(e){
  const p=e&&e.parameter||{};
  try{
    authenticate(p);
    if(String(p.nativeVersion)!=='3')throw new Error('Cần cài APK 2.3.0 để đồng bộ an toàn.');
    if(p.action==='chat_scoped')return json(chatScoped(p));
    if(p.action==='assistant_tool')return json(assistantTool(p));
    const lock=LockService.getScriptLock();lock.waitLock(20000);
    try{
      setup();
      if(p.action==='snapshot')return json(snapshot());
      if(p.action==='save_budgets')return json(saveBudgets(p));
      if(['v3_create','v3_update','v3_delete'].includes(p.action))return json(mutateTransaction({...p,action:p.action.slice(3)}));
      // 3.0 collections only: new additive migrations apply themselves on the first ext request
      // after a deploy (Migrations.gs autoMigrate). Legacy/APK actions above never trigger it.
      if(p.action==='ext_snapshot'){const migrationError=autoMigrate(),snap=extSnapshot();if(migrationError)snap.migrationError=migrationError;return json(snap);}
      if(p.action==='ext_save'){autoMigrate();return json(extSave(p));}
      throw new Error('Thao tác không được hỗ trợ. Hãy cập nhật APK và Apps Script cùng phiên bản.');
    }finally{lock.releaseLock();}
  }catch(error){return json({ok:false,error:String(error.message||error)});}
}
