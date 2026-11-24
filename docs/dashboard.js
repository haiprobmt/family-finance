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
    return `<tr class="${r.missing?'loan-missing':''}"><th scope="row">${escapeHtml(r.bank)}${r.missing?'<small>Chưa có dữ liệu</small>':''}</th><td>${r.month.slice(5)}/${r.month.slice(0,4)}</td><td>${r.missing?'—':money(r.principal)}</td><td>${rateCell}</td><td class="loan-payment">${r.missing?'—':loanPaymentMarkup(r)}</td></tr>`;
  }).join('');
}
function weeklySpending(rows,start,end,today){return FFDomain.cashflow.weeklySpending(rows,start,end,today)}
function renderWeekly(d){
  const weeks=weeklySpending(transactions,d.start,d.end,dateISO()),max=Math.max(1,...weeks.map(w=>w.total));
  const first=transactions.map(r=>r.date).filter(Boolean).sort()[0], full=weeks.filter(w=>first&&w.start>=first&&w.end<dateISO()&&Date.parse(w.end)-Date.parse(w.start)===6*86400000);
  const avg=full.length?full.reduce((s,w)=>s+w.total,0)/full.length:0;
  $('#weeklyMean').textContent=full.length?'Bình quân '+full.length+' tuần trọn vẹn: '+money(Math.round(avg))+'/tuần':'Chưa đủ một tuần trọn vẹn để tính bình quân.';
  const label=s=>s.slice(5).split('-').reverse().join('/');
  $('#weeklyBars').innerHTML=weeks.map(w=>`<div class="week-bar" aria-label="${w.start} – ${w.end}: ${money(w.total)}"><b>${moneyMillions(w.total)}</b><div class="week-track"><i style="height:${100*w.total/max}%"></i><em style="display:${full.length?'block':'none'};bottom:${100*avg/max}%"></em></div><small>${label(w.start)}–${label(w.end)}</small></div>`).join('');
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
  const max=Math.max(1,...d.trend.flatMap(t=>[t.expense,t.income]));
  const compact=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(n/1000000);
  $('#dashboardAverageLabel').textContent='Bình quân chi: '+moneyMillions(d.averageExpense)+'/tháng';
  $('#dashboardAverageLabel').title='Tổng chi trong khoảng chia cho '+d.months+' tháng, bao gồm tháng không có chi tiêu';
  $('#dashboardTrend').style.gridTemplateColumns=`repeat(${d.months},minmax(76px,1fr))`;
  $('#dashboardTrend').style.minWidth=(d.months*76)+'px';
  $('#dashboardTrend').innerHTML=d.trend.map(t=>`<div class="dash-month ${t.month===dashboardDetailMonth?'selected':''}"><span class="dash-columns"><button type="button" class="dash-column expense-column" data-expense-month="${t.month}" aria-controls="dashboardCategoryDetail" aria-pressed="${t.month===dashboardDetailMonth}" aria-label="Chi tháng ${monthLabel(t.month)}: ${money(t.expense)}. Xem chi tiết danh mục"><small>${compact(t.expense)}</small><i style="height:${t.expense/max*130}px" class="expense-dot"></i></button><span class="dash-column" title="Thu nhập: ${money(t.income)}"><small>${compact(t.income)}</small><i style="height:${t.income/max*130}px" class="income-dot"></i></span></span><b>${monthLabel(t.month)}</b><small>${t.count?'':'Chưa có'}</small></div>`).join('')+`<div class="expense-average-line" style="top:${174-d.averageExpense/max*130}px" aria-hidden="true"></div>`;
  const empty='<p class="dash-empty">Chưa có khoản chi trong khoảng này.</p>';
  $('#dashboardCategoryDetail').hidden=!dashboardDetailMonth;
  if(dashboardDetailMonth){
    const detail=dashboardData(transactions,dashboardDetailMonth,1);
    $('#dashboardCategoriesTitle').textContent='Chi tháng '+monthLabel(dashboardDetailMonth)+' · '+money(detail.expense);
    $('#dashboardCategories').innerHTML=detail.categories.map(([id,amount])=>{const pct=detail.expense?amount/detail.expense*100:0;return `<div class="dash-row"><div><b>${escapeHtml(catInfo(id)[1])}</b><strong>${money(amount)}</strong></div><div class="dash-track"><i style="width:${Math.max(0,Math.min(100,pct))}%;background:var(--chart-expense)"></i></div><small>${pct.toFixed(1)}% tổng chi tháng</small></div>`}).join('')||'<p class="dash-empty">Tháng này chưa có khoản chi.</p>';
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
