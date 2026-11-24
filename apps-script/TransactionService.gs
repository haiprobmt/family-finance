// Transactions: snapshot read and v3 create/update/delete. Behaviour is byte-for-byte
// compatible with the pre-3.0 handler (tests/contract.test.cjs replays the v3 request set).
const TX_HEADERS=['ID','Timestamp','Date','Type','Amount','Category','Person','Note'];
function transactionSheet(){return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);}
function snapshot(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName(SHEET_NAME),rows=sheet.getDataRange().getValues(),headers=rows.shift()||[],dateIndex=headers.indexOf('Date');
  return {ok:true,apiVersion:3,webVersion:1,loans:readPrivateLoans(),assistantKnowledgeVersion:2,budgets:readBudgets(),transactions:rows.filter(row=>row[0]).map(row=>Object.fromEntries(headers.map((h,i)=>[h,i===dateIndex&&row[i] instanceof Date?Utilities.formatDate(row[i],ss.getSpreadsheetTimeZone(),'yyyy-MM-dd'):row[i]])))};
}
// Normalised read for deterministic services (assistant tools, reconciliation).
function readTransactions(){
  const sheet=transactionSheet();if(!sheet)throw new Error('Thiếu sheet Transactions.');
  const rows=sheet.getDataRange().getValues();rows.shift();
  return rows.filter(row=>row[0]).map(row=>({id:String(row[0]),date:formatSheetDate(row[2]).slice(0,10),type:row[3],amount:Number(row[4]),category:String(row[5]||'other'),person:String(row[6]||''),note:String(row[7]||'')}));
}
function txFields(o){return JSON.stringify([String(o.date),o.type,Number(o.amount),String(o.category||'other'),String(o.person||'Gia đình'),String(o.note||'')]);}
function mutateTransaction(p){
  const sheet=transactionSheet(),id=String(p.id||'');if(!id||id.length>150)throw new Error('ID giao dịch không hợp lệ.');
  const rows=sheet.getDataRange().getValues(),headers=rows.shift();
  if(headers.slice(0,8).join('|')!==TX_HEADERS.join('|'))throw new Error('Cột Transactions không đúng cấu trúc. Chưa sửa dữ liệu.');
  const index=rows.findIndex(row=>String(row[0])===id);
  if(p.action==='delete'){if(index>=0)sheet.deleteRow(index+2);return {ok:true,id,deleted:true};}
  const amount=Number(p.amount),date=String(p.date||''),type=p.type;
  if(!Number.isFinite(amount)||amount<=0||amount>1000000000000||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['Expense','Income'].includes(type))throw new Error('Số tiền, ngày hoặc loại giao dịch không hợp lệ.');
  const row=[id,p.timestamp||new Date().toISOString(),date,type,amount,literal(p.category),literal(p.person),literal(p.note)];
  if(p.action==='update'){
    const src=rows[index],dateValue=src&&src[2] instanceof Date?formatSheetDate(src[2]):String(src?.[2]||'');
    const remote=src?{ID:id,Date:dateValue,Type:src[3],Amount:src[4],Category:src[5],Person:src[6],Note:src[7],Timestamp:src[1]}:null;
    const current=src&&txFields({date:dateValue,type:src[3],amount:src[4],category:src[5],person:src[6],note:src[7]});
    if(src&&current===txFields(p))return {ok:true,id};
    if(!src||!p.base||current!==txFields(JSON.parse(p.base)))return {ok:false,code:'TX_CONFLICT',error:'Giao dịch đã thay đổi trên Sheets.',remote};
    if(type!==src[3])throw new Error('Không thể đổi loại giao dịch.');
    row[1]=src[1];sheet.getRange(index+2,1,1,8).setValues([row]);
  }
  else if(index<0)sheet.appendRow(row);
  return {ok:true,id};
}
