// Private loans. Optional table: Bank | Month | Principal | Rate | Interest | Days.
// Rules preserved: Techcombank excluded from 2026-11, no duplicate bank/month. Any bank name is
// accepted (loans entered in the app, LoanWriteService.gs); Shinhan/Techcombank keep their rules.
function readPrivateLoans(){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName('Loans');
 const result={start:'2026-10',end:'2030-12',records:[],extraDebt:0};
 const settings=ss.getSheetByName('FinanceSettings');
 if(settings){const rows=settings.getDataRange().getValues();for(const row of rows){if(row[0]==='ExtraDebtMonthly'){const amount=Number(row[1]);if(!Number.isFinite(amount)||amount<0)throw new Error('ExtraDebtMonthly không hợp lệ');result.extraDebt=amount;}
   // Optional last month (YYYY-MM) of the extra repayment; absent = every month (legacy behaviour).
   else if(row[0]==='ExtraDebtUntil'&&row[1]!==''){const until=row[1] instanceof Date?Utilities.formatDate(row[1],ss.getSpreadsheetTimeZone(),'yyyy-MM'):String(row[1]).trim();if(!/^\d{4}-(0[1-9]|1[012])$/.test(until))throw new Error('ExtraDebtUntil phải có dạng YYYY-MM');result.extraDebtUntil=until;}}}
 if(!sheet)return result;
 const rows=sheet.getDataRange().getValues(),headers=rows.shift()||[],expected=['Bank','Month','Principal','Rate','Interest','Days'];
 if(expected.some((v,i)=>headers[i]!==v))throw new Error('Loans cần cột: '+expected.join(', '));
 const seen=new Set();
 for(const row of rows){
  if(!row[0])continue;
  const bank=String(row[0]),month=row[1] instanceof Date?Utilities.formatDate(row[1],ss.getSpreadsheetTimeZone(),'yyyy-MM'):String(row[1]);
  if(!validLoanBank(bank)||!/^\d{4}-(0[1-9]|1[012])$/.test(month))throw new Error('Bank/Month trong Loans không hợp lệ');
  if(bank==='Techcombank'&&month>='2026-11')continue;
  const [principal,rate,interest,days]=row.slice(2,6).map(Number);
  if([principal,rate,interest,days].some(v=>!Number.isFinite(v)||v<0)||rate>1)throw new Error('Số liệu Loans không hợp lệ');
  const key=bank+'|'+month;if(seen.has(key))throw new Error('Loans trùng ngân hàng/tháng');seen.add(key);
  result.records.push({bank,month,principal,rate,interest,days});
 }
 return result;
}
function validLoanBank(bank){return typeof bank==='string'&&bank.length>=1&&bank.length<=40&&bank.trim()===bank&&!/[\r\n\t|]/.test(bank);}
