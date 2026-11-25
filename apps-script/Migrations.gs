// Versioned, additive, repeatable schema migrations (implementation/MIGRATION_PLAN.md).
// They only ever CREATE new sheets with fixed headers, validated before any write:
//   migrationsDryRun()  → shows what would change; writes nothing (run from the editor).
//   migrationsApply()   → creates missing sheets, logs id/timestamp/counts/result only.
//   autoMigrate()       → the same apply, run by doPost on ext_* requests when a migration is
//                         pending, so a deploy needs no manual step. On any validation error it
//                         writes nothing and the error is reported to the app instead.
// Never renames, reorders, deletes or rewrites legacy sheets (Transactions, Budgets, Loans,
// FinanceSettings). Not callable as a POST action.
const MIGRATION_LOG='Migrations';
const MIGRATION_LOG_HEADERS=['MigrationId','AppliedAt','Result','Counts'];
const MIGRATIONS=[
  {id:'2026-11-01-assets',description:'Thêm sheet Assets và AssetValuations',collections:['assets','valuations']},
  {id:'2026-11-02-recurring',description:'Thêm sheet RecurringRules',collections:['recurring']},
  {id:'2026-11-25-debts',description:'Thêm sheet Debts (khoản nợ nhập tay)',collections:['debts']}
];
function appliedMigrations(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MIGRATION_LOG);if(!sheet)return [];
  return sheet.getDataRange().getValues().slice(1).filter(r=>r[0]&&r[2]==='ok').map(r=>String(r[0]));
}
function legacyCounts(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),out={};
  for(const name of [SHEET_NAME,BUDGET_SHEET,'Loans','FinanceSettings']){const s=ss.getSheetByName(name);out[name]=s?s.getLastRow():null;}
  return out;
}
function runMigrations(options){
  // doPost already holds the script lock when it calls autoMigrate.
  if(options&&options.locked)return migrateLocked(options);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return migrateLocked(options);}finally{lock.releaseLock();}
}
function migrateLocked(options){
  const dryRun=!(options&&options.dryRun===false),ss=SpreadsheetApp.getActiveSpreadsheet();
    const tx=ss.getSheetByName(SHEET_NAME);
    if(tx&&tx.getLastRow()>0){const h=tx.getRange(1,1,1,8).getValues()[0];if(h.join('|')!==TX_HEADERS.join('|'))throw new Error('Transactions headers không khớp; dừng migration, chưa ghi gì.');}
    const before=legacyCounts(),applied=new Set(appliedMigrations()),results=[];
    // Validate everything before any write.
    for(const m of MIGRATIONS){
      const actions=[];
      for(const name of m.collections){
        const def=EXT_COLLECTIONS[name],sheet=ss.getSheetByName(def.sheet);
        if(!sheet)actions.push({create:def.sheet,headers:extHeaders(def)});
        else{const h=sheet.getRange(1,1,1,extHeaders(def).length).getValues()[0];if(extHeaders(def).some((x,i)=>h[i]!==x))throw new Error('Sheet '+def.sheet+' đã tồn tại với cấu trúc khác; dừng migration, chưa ghi gì.');}
      }
      results.push({id:m.id,description:m.description,status:applied.has(m.id)&&!actions.length?'applied':dryRun?'pending':'apply',actions});
    }
    if(!dryRun){
      let log=ss.getSheetByName(MIGRATION_LOG);
      for(const r of results){
        if(r.status==='applied')continue;
        for(const a of r.actions){const s=ss.insertSheet(a.create);s.getRange(1,1,1,a.headers.length).setValues([a.headers]);s.setFrozenRows(1);}
        if(!log){log=ss.insertSheet(MIGRATION_LOG);log.getRange(1,1,1,MIGRATION_LOG_HEADERS.length).setValues([MIGRATION_LOG_HEADERS]);log.setFrozenRows(1);}
        log.appendRow([r.id,new Date().toISOString(),'ok',"'"+JSON.stringify(legacyCounts())]);
        r.status='applied-now';
      }
      SpreadsheetApp.flush();
      const after=legacyCounts();
      if(JSON.stringify(after)!==JSON.stringify(before))throw new Error('Số dòng sheet cũ thay đổi trong migration — khôi phục bản sao lưu và kiểm tra.');
    }
    return {dryRun,results,legacyCounts:before};
}
// Returns null when nothing is pending or everything applied, else the reason it did not apply.
function autoMigrate(){
  const applied=new Set(appliedMigrations());
  if(MIGRATIONS.every(m=>applied.has(m.id)))return null;
  try{runMigrations({dryRun:false,locked:true});return null;}
  catch(error){return 'Chưa tạo được sheet mới: '+String(error.message||error);}
}
function migrationsDryRun(){return JSON.stringify(runMigrations({dryRun:true}),null,2);}
function migrationsApply(){return JSON.stringify(runMigrations({dryRun:false}),null,2);}
// Private reconciliation evidence for before/after cutover (MIGRATION_PLAN §8).
// Run in the editor; copy the output to a PRIVATE note. Never commit it.
function reconciliationReport(){
  const txs=readTransactions(),byMonth={};
  for(const t of txs){const m=t.date.slice(0,7),r=byMonth[m]||(byMonth[m]={income:0,expense:0,rows:0});r[t.type==='Income'?'income':'expense']+=Number(t.amount)||0;r.rows++;}
  const loans=readPrivateLoans(),loanRows={};
  for(const r of loans.records){loanRows[r.bank]=(loanRows[r.bank]||0)+1;}
  const missing=FFDomain.loan.loanScheduleRows(loans).filter(r=>r.missing).length;
  const b=readBudgets();
  return JSON.stringify({transactionRows:txs.length,uniqueIds:new Set(txs.map(t=>t.id)).size,byMonth,budgetKeys:Object.keys(b.values).length,budgetRevision:b.revision,loanRowsByBank:loanRows,missingScheduleRows:missing,migrations:appliedMigrations()},null,2);
}
