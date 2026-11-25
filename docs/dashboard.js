// Loan rules: docs/src/domain/loan.js (legacy behaviour preserved, see tests/parity.test.cjs).
function trackedBanks(month){return FFDomain.loan.trackedBanks(month)}
function loanScheduleRows(schedule){return FFDomain.loan.loanScheduleRows(schedule)}
const LOAN_RATE_KEY='family_finance_loan_rates_v1';
function readLoanRates(){try{return FFDomain.loan.normalizeRates(JSON.parse(localStorage.getItem('ffpages:'+LOAN_RATE_KEY)||'{}'))}catch{return FFDomain.loan.normalizeRates(null)}}
let loanRates=readLoanRates();
function calculateLoanPayment(row,settings){return FFDomain.loan.calculateLoanPayment(row,settings)}
function loanPaymentMarkup(r){
  return `${money(r.payment)}${r.bank==='Techcombank'&&r.month>='2026-12'?`<small>Lãi ${money(r.interest)} + gốc ${money(r.principalPayment)}</small>`:''}`;
}
function renderLoanSchedule(){
  const rate=value=>new Intl.NumberFormat('vi-VN',{style:'percent',maximumFractionDigits:3}).format(value);
  $('#loanScheduleBody').innerHTML=loanScheduleRows(LOAN_SCHEDULE).map(source=>{
    const r=calculateLoanPayment(source,loanRates),editable=!r.missing&&r.bank==='Techcombank'&&r.month>='2026-12';
    const actual=loanRates.actual[r.month];
    const rateCell=editable?`<input class="loan-actual-rate" type="number" min="0" max="100" step="any" inputmode="decimal" data-loan-month="${r.month}" value="${typeof actual==='number'?actual:''}" placeholder="${loanRates.forecast}" aria-label="Lãi suất thực tế Techcombank ${r.month.slice(5)}/${r.month.slice(0,4)}, phần trăm mỗi năm" /><small class="loan-rate-state">${r.rateType}: ${rate(r.rate)}</small>`:r.missing?'—':rate(r.rate);
    return `<tr class="${r.missing?'row-missing':''}"><th scope="row" data-label="Ngân hàng">${escapeHtml(r.bank)}${r.missing?'<small class="unknown">Chưa có dữ liệu</small>':''}</th><td data-label="Tháng">${r.month.slice(5)}/${r.month.slice(0,4)}</td><td class="num" data-label="Dư nợ gốc">${r.missing?'—':money(r.principal)}</td><td class="num" data-label="Lãi suất">${rateCell}</td><td class="num" data-label="Tiền phải trả">${r.missing?'<span class="unknown">Thiếu</span>':loanPaymentMarkup(r)}</td><td class="loan-edit-cell"><button type="button" class="btn btn-ghost btn-sm" data-loan-edit="${escapeHtml(r.bank)}" data-loan-month="${r.month}" aria-label="${r.missing?'Nhập':'Sửa'} ${escapeHtml(r.bank)} tháng ${r.month.slice(5)}/${r.month.slice(0,4)}">${r.missing?'Nhập':'Sửa'}</button></td></tr>`;
  }).join('');
  const end=FFDomain.loan.scheduleEnd(LOAN_SCHEDULE),label=m=>m.slice(5)+'/'+m.slice(0,4);
  $('#loanScheduleRange').textContent=label(LOAN_SCHEDULE.start)+' – '+label(end);
}
function weeklySpending(rows,start,end,today){return FFDomain.cashflow.weeklySpending(rows,start,end,today)}
function renderWeekly(d){
  const weeks=weeklySpending(transactions,d.start,d.end,dateISO());
  const first=transactions.map(r=>r.date).filter(Boolean).sort()[0], full=weeks.filter(w=>first&&w.start>=first&&w.end<dateISO()&&Date.parse(w.end)-Date.parse(w.start)===6*86400000);
  const avg=full.length?full.reduce((s,w)=>s+w.total,0)/full.length:0;
  $('#weeklyMean').textContent=full.length?'Bình quân '+full.length+' tuần trọn vẹn: '+money(Math.round(avg))+'/tuần':'Chưa đủ một tuần trọn vẹn để tính bình quân.';
  const label=s=>s.slice(5).split('-').reverse().join('/');
  $('#weeklyBars').innerHTML=weeks.length?FFUI.chart.bar({caption:'Chi tiêu theo tuần '+FFUI.fmt.monthLabel(d.start)+' – '+FFUI.fmt.monthLabel(d.end),labels:weeks.map(w=>label(w.start)+'–'+label(w.end)),series:[{key:'expense',label:'Chi tiêu tuần',color:FFUI.chart.SERIES.expense,values:weeks.map(w=>w.total)}],average:full.length?{value:avg,label:'Bình quân tuần trọn vẹn'}:null,minColumn:52}):FFUI.c.emptyState({title:'Chưa có tuần nào trong kỳ'});
}
function accumulatedSavings(rows,today){return FFDomain.cashflow.accumulatedSavings(rows,today)}
function renderAccumulatedSavings(){
  const d=accumulatedSavings(transactions,dateISO());
  $('#cumulativeIncome').textContent=money(d.income);
  $('#cumulativeExpense').textContent=money(d.expense);
  $('#cumulativeIncome').title='Từ 26/08/2026 đến khoản thu nhập mới nhất';
  $('#cumulativeExpense').title='Từ 26/08/2026 đến hôm nay';
  $('#accumulatedSavingsValue').textContent=d.end?money(d.savings):'—';
  $('#accumulatedSavingsValue').classList.toggle('negative',d.savings!==null&&d.savings<0);
  $('#accumulatedSavingsValue').setAttribute('aria-label',d.end?'Tiết kiệm tích lũy: '+money(d.savings):'Chưa có thu nhập để tính tiết kiệm');
}
let dashboardMonths=6,dashboardDetailMonth=null;
function parseDashboardMonth(value){
  const match=/^(0[1-9]|1[0-2])\/(\d{4})$/.exec(String(value).trim());
  return match&&Number(match[2])>=1900?match[2]+'-'+match[1]:null;
}
function dashboardData(rows,month,months=6){return FFDomain.cashflow.dashboardData(rows,month,months)}
function renderDashboard(){
  renderAccumulatedSavings();
  renderLoanSchedule();
  const mk=monthKey(activeMonth),d=dashboardData(transactions,mk,dashboardMonths);
  renderWeekly(d);
  const monthLabel=m=>m.slice(5)+'/'+m.slice(0,4);
  $('#dashboardMonth').value=monthLabel(mk);
  $('#dashboardMonths').value=String(dashboardMonths);
  $('#dashboardScope').textContent=monthLabel(d.start)+' – '+monthLabel(d.end);
  $('#dashboardTrendTitle').textContent='Thu – chi '+d.months+' tháng';
  if(!d.trend.some(t=>t.month===dashboardDetailMonth))dashboardDetailMonth=null;
  $('#dashboardAverageLabel').textContent='Bình quân chi: '+money(Math.round(d.averageExpense))+'/tháng (tính cả tháng không chi)';
  $('#dashboardAverageLabel').title='Tổng chi trong khoảng chia cho '+d.months+' tháng, bao gồm tháng không có chi tiêu';
  $('#dashboardTrend').innerHTML=FFUI.chart.bar({caption:'Thu – chi '+monthLabel(d.start)+' – '+monthLabel(d.end),labels:d.trend.map(t=>monthLabel(t.month)),selected:d.trend.findIndex(t=>t.month===dashboardDetailMonth),average:{value:d.averageExpense,label:'Bình quân chi/tháng'},series:[
    {key:'expense',label:'Chi tiêu',color:FFUI.chart.SERIES.expense,values:d.trend.map(t=>t.expense),barAttrs:i=>({'data-expense-month':d.trend[i].month,'aria-controls':'dashboardCategoryDetail','aria-pressed':String(d.trend[i].month===dashboardDetailMonth),'aria-label':`Chi tháng ${monthLabel(d.trend[i].month)}: ${money(d.trend[i].expense)}. Xem chi tiết danh mục`})},
    {key:'income',label:'Thu nhập',color:FFUI.chart.SERIES.income,values:d.trend.map(t=>t.income)}]});
  $('#dashboardCategoryDetail').hidden=!dashboardDetailMonth;
  if(dashboardDetailMonth){
    const detail=dashboardData(transactions,dashboardDetailMonth,1);
    $('#dashboardCategoriesTitle').textContent='Chi tháng '+monthLabel(dashboardDetailMonth)+' · '+money(detail.expense);
    // Share of the month's expense (not a budget): same bar pattern, neutral colour.
    $('#dashboardCategories').innerHTML=detail.categories.map(([id,amount])=>{const pct=detail.expense?amount/detail.expense*100:0;return `<div class="budget-progress level-unset"><span class="bp-head"><span class="bp-icon">${FFUI.icon(catInfo(id)[2])}</span><span class="bp-label">${escapeHtml(catInfo(id)[1])}</span><span class="bp-pct">${pct.toFixed(1).replace('.',',')}%</span></span><span class="bp-bar" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:${FFUI.chart.colorOf(id)}"></i></span><span class="bp-foot"><span>${FFUI.c.money(amount)}</span><span>tổng chi tháng</span></span></div>`}).join('')||FFUI.c.emptyState({title:'Tháng này chưa có khoản chi'});
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelector('#dashboardTrend').addEventListener('click',event=>{
    const button=event.target.closest('[data-expense-month]');if(!button)return;
    const clickedMonth=button.dataset.expenseMonth;
    dashboardDetailMonth=dashboardDetailMonth===clickedMonth?null:clickedMonth;renderDashboard();
    const selected=document.querySelector('[data-expense-month="'+clickedMonth+'"]');selected?.focus({preventScroll:true});
  });
  document.querySelector('#closeDashboardCategories').addEventListener('click',()=>{const previous=dashboardDetailMonth;dashboardDetailMonth=null;renderDashboard();document.querySelector('[data-expense-month="'+previous+'"]')?.focus({preventScroll:true})});
  document.querySelector('#dashboardMonth').addEventListener('input',event=>event.target.setCustomValidity(''));
  document.querySelector('#dashboardMonth').addEventListener('change',event=>{
    const month=parseDashboardMonth(event.target.value);
    if(!month){event.target.setCustomValidity('Nhập tháng theo MM/YYYY, ví dụ 09/2026');event.target.reportValidity();return}
    event.target.setCustomValidity('');const [year,number]=month.split('-').map(Number);activeMonth=new Date(year,number-1,1);render();
  });
  document.querySelector('#dashboardMonths').addEventListener('change',event=>{
    dashboardMonths=Math.max(1,Math.min(12,Number(event.target.value)||1));renderDashboard();
  });
});
