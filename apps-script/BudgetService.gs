// Budgets: revisioned read/save. BUDGET_CONFLICT semantics unchanged.
function validLimit(key,v){return FFDomain.budget.isValidLimit(key,v);}
function readBudgets(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BUDGET_SHEET),values=sheet.getDataRange().getValues(),headers=values.shift()||[];
  if(headers[0]!=='Category'||headers[1]!=='Budget'||headers[2]!=='UpdatedAt')throw new Error('Sheet Budgets đang có cấu trúc khác. Đổi tên sheet cũ để giữ bản sao rồi chạy setup.');
  const budgets={};
  values.forEach(row=>{if(!row[0])return;const category=String(row[0]),amount=Number(row[1]);if(row[1]===''||!validLimit(category,amount))throw new Error('Dòng ngân sách không hợp lệ: '+category);if(Object.prototype.hasOwnProperty.call(budgets,category))throw new Error('Trùng danh mục ngân sách: '+category);budgets[category]=Math.round(amount);});
  return {values:budgets,revision:budgetRevision(budgets)};
}
function sha256Hex(text){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text).map(n=>('0'+((n+256)%256).toString(16)).slice(-2)).join('');}
function budgetRevision(values){return sha256Hex(JSON.stringify(Object.keys(values).sort().map(key=>[key,values[key]])));}
function saveBudgets(p){
  const values=JSON.parse(p.values||'null');if(!values||Array.isArray(values)||typeof values!=='object')throw new Error('Ngân sách không hợp lệ.');
  const next={};Object.entries(values).forEach(([key,value])=>{if(!validLimit(key,value))throw new Error('Ngân sách không hợp lệ: '+key);next[key]=Math.round(value);});
  const current=readBudgets();
  if(current.revision===budgetRevision(next))return {ok:true,budgets:current};
  if(String(p.revision||'')!==current.revision)return {ok:false,code:'BUDGET_CONFLICT',error:'Ngân sách đã thay đổi ở thiết bị khác hoặc Google Sheets.',budgets:current};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BUDGET_SHEET),rows=[['Category','Budget','UpdatedAt'],...Object.keys(next).sort().map(key=>[key,next[key],new Date().toISOString()])];
  while(rows.length<sheet.getLastRow())rows.push(['','','']);
  sheet.getRange(1,1,rows.length,3).setValues(rows);SpreadsheetApp.flush();
  return {ok:true,budgets:readBudgets()};
}
