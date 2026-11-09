function trackedBanks(month){return month<'2026-11'?['Shinhan','Techcombank']:['Shinhan'];}
function loanScheduleRows(schedule){
  const indexed=new Map(schedule.records.map(r=>[r.bank+'|'+r.month,r]));
  const rows=[];
  for(let year=2026;year<=2030;year++)for(let month=1;month<=12;month++){
    const key=year+'-'+String(month).padStart(2,'0');if(key<schedule.start||key>schedule.end)continue;
    for(const bank of trackedBanks(key))rows.push(indexed.get(bank+'|'+key)||{bank,month:key,missing:true});
  }
  return rows;
}
const LOAN_RATE_KEY='family_finance_loan_rates_v1';
function readLoanRates(){
  try{const saved=JSON.parse(localStorage.getItem('ffpages:'+LOAN_RATE_KEY)||'{}');return {forecast:Number.isFinite(saved.forecast)&&saved.forecast>=0&&saved.forecast<=100?saved.forecast:12,actual:saved.actual&&typeof saved.actual==='object'?saved.actual:{}}}catch{return {forecast:12,actual:{}}}
}
let loanRates=readLoanRates();
function calculateLoanPayment(row,settings){
  if(row.missing)return row;
  if(row.bank!=='Techcombank'||row.month<'2026-12')return {...row,payment:row.interest,rateType:'Theo file'};
  const actual=settings.actual[row.month],hasActual=typeof actual==='number'&&Number.isFinite(actual)&&actual>=0&&actual<=100;
  const rate=(hasActual?actual:settings.forecast)/100;
  const interest=row.principal*rate*row.days/365;
  return {...row,rate,interest,principalPayment:909400,payment:interest+909400,rateType:hasActual?'Thực tế':'Dự đoán'};
}
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
function weeklySpending(rows,start,end,today){
  const day=86400000,first=Date.parse(start+'-01T00:00:00Z'),[y,m]=end.split('-').map(Number);
  const last=Math.min(Date.UTC(y,m,0),Date.parse(today+'T00:00:00Z')),iso=t=>new Date(t).toISOString().slice(0,10);
  const monday=t=>t-((new Date(t).getUTCDay()+6)%7)*day, buckets=new Map();
  if(last>=first)for(let t=monday(first);t<=last;t+=7*day)buckets.set(t,{start:iso(Math.max(first,t)),end:iso(Math.min(last,t+6*day)),total:0});
  for(const r of rows){if(r.type!=='Expense')continue;const t=Date.parse(r.date+'T00:00:00Z');if(t>=first&&t<=last)buckets.get(monday(t)).total+=Number(r.amount)||0;}
  return [...buckets.values()];
}
function renderWeekly(d){
  const weeks=weeklySpending(transactions,d.start,d.end,dateISO()),max=Math.max(1,...weeks.map(w=>w.total));
  const first=transactions.map(r=>r.date).filter(Boolean).sort()[0], full=weeks.filter(w=>first&&w.start>=first&&w.end<dateISO()&&Date.parse(w.end)-Date.parse(w.start)===6*86400000);
  const avg=full.length?full.reduce((s,w)=>s+w.total,0)/full.length:0;
  $('#weeklyMean').textContent=full.length?'Bình quân '+full.length+' tuần trọn vẹn: '+money(Math.round(avg))+'/tuần':'Chưa đủ một tuần trọn vẹn để tính bình quân.';
  const label=s=>s.slice(5).split('-').reverse().join('/');
  $('#weeklyBars').innerHTML=weeks.map(w=>`<div class="week-bar" aria-label="${w.start} – ${w.end}: ${money(w.total)}"><b>${moneyMillions(w.total)}</b><div class="week-track"><i style="height:${100*w.total/max}%"></i><em style="display:${full.length?'block':'none'};bottom:${100*avg/max}%"></em></div><small>${label(w.start)}–${label(w.end)}</small></div>`).join('');
}
function accumulatedSavings(rows,today){
  const start='2026-08-26';
  const valid=rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))&&String(r.date)>=start);
  const incomeRows=valid.filter(r=>r.type==='Income');
  const incomeDates=incomeRows.map(r=>String(r.date)).sort();
  const end=incomeDates.length?incomeDates[incomeDates.length-1]:null;
  const sum=list=>list.reduce((total,r)=>total+(Number(r.amount)||0),0);
  const income=sum(incomeRows);
  const expense=sum(valid.filter(r=>r.type==='Expense'&&String(r.date)<=today));
  return {start,end,expenseEnd:today,income,expense,savings:end?income-expense:null};
}
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
function dashboardData(rows,month,months=6){
  const count=Math.max(1,Math.min(12,Math.trunc(Number(months)||1)));
  const [year,number]=month.split('-').map(Number);
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const start=key(new Date(year,number-count,1));
  const selected=rows.filter(r=>String(r.date).slice(0,7)>=start&&String(r.date).slice(0,7)<=month);
  const expenses=selected.filter(r=>r.type==='Expense');
  const sum=list=>list.reduce((s,r)=>s+Number(r.amount||0),0);
  const categories=Object.entries(expenses.reduce((acc,r)=>{acc[r.category||'other']=(acc[r.category||'other']||0)+Number(r.amount||0);return acc},{})).sort((a,b)=>b[1]-a[1]);
  const trend=Array.from({length:count},(_,i)=>{
    const m=key(new Date(year,number-count+i,1)),rs=selected.filter(r=>String(r.date).slice(0,7)===m);
    return {month:m,expense:sum(rs.filter(r=>r.type==='Expense')),income:sum(rs.filter(r=>r.type==='Income')),count:rs.length};
  });
  return {start,end:month,months:count,averageExpense:sum(expenses)/count,expense:sum(expenses),categories,trend};
}
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
