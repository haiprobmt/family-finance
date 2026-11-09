const EXPENSE_CATS=[['food','Ăn uống','🍜'],['grocery','Đi chợ','🛒'],['kids','Con cái','🧸'],['transport','Xe cộ','🚗'],['home','Nhà cửa','🏠'],['bills','Điện nước','💡'],['health','Sức khỏe','♥'],['couple-allowance','Tiêu Vặt Vợ Chồng','👛'],['other','Khác','•••'],['loan-payment','Trả nợ','🏦']];
const INCOME_CATS=[['salary','Lương','💼'],['bonus','Thưởng','★'],['business','Kinh doanh','↗'],['other-income','Khác','+']];
const STORE={tx:'family_finance_transactions_v1',budget:'family_finance_budgets_v1',endpoint:'family_finance_endpoint_v1'};
let transactions=read(STORE.tx,[]),budgets=read(STORE.budget,{});
let budgetState=read('family_budget_sync_v2',{revision:null,pending:null,remote:null}),pendingDeletes=read('family_deleted_v2',[]),syncFlight=null,lastSyncOk=false;
let editBase='',lastVerified=read('lastVerifiedV3',null);
function queued(){return transactions.filter(t=>!t.synced).length+pendingDeletes.length+(budgetState.pending?1:0)}
function limitsAt(all,month){
 const out=Object.fromEntries(Object.entries(all).filter(([key])=>!key.includes(':')));
 for(const key of Object.keys(all).filter(k=>k.includes(':')&&k.slice(0,7)<=month).sort()){const cat=key.slice(8);if(all[key]===-1)delete out[cat];else out[cat]=all[key];}return out;
}
let activeMonth=new Date(),entryType='Expense',selectedCategory='food',historyFilter='All',detailCategory=null,editingTransactionId=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function read(key,fallback){try{return JSON.parse(localStorage.getItem('ffpages:'+key))??fallback}catch{return fallback}}
function write(key,val){localStorage.setItem('ffpages:'+key,JSON.stringify(val))}
function money(n){return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n)||0))+' ₫'}
function budgetLevel(spend,budget){return budget>0?(spend/budget<=0.65?'green':spend/budget<0.9?'yellow':'red'):'unset'}
function moneyMillions(n){return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format((Number(n)||0)/1000000)+' tr'}
function dateISO(d=new Date()){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function catInfo(id,type='Expense'){if(id==='loan-payment')return ['loan-payment','Trả nợ','🏦'];return [...EXPENSE_CATS,...INCOME_CATS].find(c=>c[0]===id)||['other',type==='Expense'?'Khác':'Thu nhập','•']}
function currentTx(){const mk=monthKey(activeMonth);return transactions.filter(t=>String(t.date).slice(0,7)===mk)}
function totals(){return currentTx().reduce((a,t)=>{a[t.type==='Income'?'income':'expense']+=Number(t.amount)||0;return a},{expense:0,income:0})}
function showToast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),2400)}
function endpoint(){return nativeConfig.hasToken?nativeConfig.endpoint:''}
function render(){renderHeader();renderHome();renderHistory();renderBudgets();renderDashboard();renderCategoryDetail()}
function renderHeader(){
  $('#monthLabel').textContent=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth);
  const pill=$('#syncPill'),n=queued(),conflict=budgetState.remote||transactions.some(t=>t.conflict),ok=lastSyncOk&&!n&&!conflict;
  pill.classList.toggle('connected',ok);pill.querySelector('b').textContent=!endpoint()?'Chưa kết nối':conflict?'Xung đột · Xem lại':n?n+' thay đổi chờ gửi · Thử lại':ok?'Đã đồng bộ':'Chờ đồng bộ · Thử lại';
  $('#lastSyncTime').textContent=lastVerified?'Lần đồng bộ hoàn tất: '+new Date(lastVerified).toLocaleString('vi-VN'):'';
}
function effectiveBudgets(){const b=limitsAt(budgets,monthKey(activeMonth));return {...b,'loan-payment':b['loan-payment']??homeLoanSummary(monthKey(activeMonth)).total};}
function renderHome(){
  const t=totals(),remaining=t.income-t.expense,totalBudget=Object.values(effectiveBudgets()).reduce((a,b)=>a+(Number(b)||0),0),pct=totalBudget?Math.round(t.expense/totalBudget*100):0;
  for(const [id,value] of [['#expenseTotal',t.expense],['#incomeTotal',t.income],['#remainingTotal',remaining]]){const el=$(id);el.textContent=moneyMillions(value);el.title=money(value);el.setAttribute('aria-label',money(value));}$('#savingRate').textContent=t.income?`${Math.round(remaining/t.income*100)}%`:'0%';
  const gaugeRatio=totalBudget>0?t.expense/totalBudget:0,gaugeFill=Math.max(0,Math.min(100,gaugeRatio*100)),overBudget=totalBudget>0&&t.expense>totalBudget;
  $('#budgetGaugeArc').setAttribute('stroke-dasharray',`${gaugeFill} 100`);$('#budgetGaugeArc').style.opacity=gaugeFill>0?'1':'0';
  $('#budgetGauge').dataset.level=budgetLevel(t.expense,totalBudget);
  $('#budgetGauge').classList.toggle('over',overBudget);$('#budgetGaugeValue').textContent=totalBudget?`${pct}%`:'—';
  $('#budgetGaugeLimit').textContent=totalBudget?moneyMillions(totalBudget):'Chưa đặt ngân sách';
  $('#budgetCaption').textContent=totalBudget?(overBudget?`Vượt ngân sách ${money(t.expense-totalBudget)}`:`Còn ${money(totalBudget-t.expense)}`):'Đặt ngân sách để theo dõi giới hạn tháng';
  $('#budgetGauge').setAttribute('aria-label',totalBudget?`Đã dùng ${pct}% ngân sách tháng. Đã chi ${money(t.expense)} trên ${money(totalBudget)}. ${$('#budgetCaption').textContent}`:'Chưa đặt ngân sách tháng');

  const exp=currentTx().filter(t=>t.type==='Expense');const sums={};exp.forEach(t=>sums[t.category]=(sums[t.category]||0)+Number(t.amount));const debt=homeLoanSummary(monthKey(activeMonth));const paid=sums['loan-payment']||0;$('#debtSummary').textContent='Trả nợ · Dự kiến '+money(debt.total)+' · Đã trả '+money(paid)+' · Còn phải trả '+money(Math.max(0,debt.total-paid));const sorted=Object.entries(sums).sort((a,b)=>b[1]-a[1]);
  renderExpensePie(sorted,debt);
  $('#categoryEmpty').classList.toggle('show',!sorted.length);
}

function homeLoanSummary(month){
  const banks=trackedBanks(month);
  const rows=banks.map(bank=>{const source=LOAN_SCHEDULE.records.find(r=>r.bank===bank&&r.month===month);return source?calculateLoanPayment(source,loanRates):{bank,missing:true};});
  const missing=rows.some(r=>r.missing),label=month.split('-').reverse().join('/');
  const missingNote=!missing?'':month<LOAN_SCHEDULE.start?`${label}: chưa có lịch vay; dữ liệu bắt đầu từ 10/2026.`:`${label}: chưa có lịch ${rows.filter(r=>r.missing).map(r=>r.bank).join(', ')}.`;
  return {rows,missing,missingNote,total:(LOAN_SCHEDULE.extraDebt||0)+rows.reduce((sum,r)=>sum+(r.missing?0:Math.round(r.payment)),0)};
}
function renderLoanDetail(){
  const debt=homeLoanSummary(monthKey(activeMonth));
  $('#categoryDetailTitle').textContent='Trả nợ';
  $('#categoryDetailScope').textContent=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth)+(debt.missing?' · '+debt.missingNote:'');
  $('#categoryDetailTotal').textContent=money(debt.total)+(debt.missing?' (tạm tính)':'');
  $('#categoryDetailBody').innerHTML=debt.rows.map(r=>`<tr><td>${monthKey(activeMonth).split('-').reverse().join('/')}</td><td><b>${escapeHtml(r.bank)}</b><span>${r.missing?'Chưa có dữ liệu':r.rateType}</span></td><td class="detail-money"><b>${r.missing?'—':money(r.payment)}</b></td></tr>`).join('')+`<tr><td>—</td><td><b>Khoản cộng thêm</b></td><td class="detail-money"><b>${money(LOAN_SCHEDULE.extraDebt||0)}</b></td></tr>`;
  $('#categoryDetailEmpty').hidden=true;$('#categoryDetailTable').hidden=false;
}
const expensePieColors={food:'#b9698f',grocery:'#40998e',kids:'#9a80c1',transport:'#5d92bb',home:'#d29855',bills:'#d7b343',health:'#cc7780','couple-allowance':'#de849c',other:'#85929d','loan-payment':'#714368'};
let selectedPieCategory=null;
function expensePieSvg(rows,selected=selectedPieCategory){
  const total=rows.reduce((sum,[,value])=>sum+value,0);if(!total)return '<svg viewBox="0 0 360 360" aria-hidden="true"><circle cx="180" cy="180" r="90" fill="#eee"/></svg>';
  let angle=-Math.PI/2;const labels=[],paths=[];
  rows.forEach(([id,value])=>{
    const share=value/total,end=angle+share*Math.PI*2,mid=(angle+end)/2,color=expensePieColors[id]||'#85929d';
    const point=a=>[180+90*Math.cos(a),180+90*Math.sin(a)];const start=point(angle),finish=point(end);
    const chosen=id===selected,dx=chosen?14*Math.cos(mid):0,dy=chosen?14*Math.sin(mid):0;
    const shape=share>=.999999?`<circle cx="180" cy="180" r="90" fill="${color}"/>`:`<path d="M180 180 L${start.join(' ')} A90 90 0 ${share>.5?1:0} 1 ${finish.join(' ')} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`;
    paths.push(`<g class="pie-slice ${chosen?'is-selected':''}" transform="translate(${dx} ${dy})" opacity="${selected&&!chosen?.45:1}">${shape}</g>`);
    labels.push({id,value,chosen,share,color,x:180+94*Math.cos(mid)+dx,y:180+94*Math.sin(mid)+dy,right:Math.cos(mid)>=0});angle=end;
  });
  for(const right of [false,true]){
    const side=labels.filter(r=>r.right===right).sort((a,b)=>a.y-b.y);let bottom=26;
    side.forEach(r=>{r.half=r.chosen?25:15;r.labelY=Math.max(r.y,bottom+7+r.half);bottom=r.labelY+r.half;});
    if(side.length&&bottom>336){side.at(-1).labelY=336-side.at(-1).half;for(let i=side.length-2;i>=0;i--)side[i].labelY=Math.min(side[i].labelY,side[i+1].labelY-side[i+1].half-7-side[i].half);}
  }
  const annotations=labels.filter(r=>!selected||r.chosen).map(r=>{const x=r.right?286:74,elbow=r.right?279:81,pct=r.share*100,label=r.chosen?new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(pct)+'%':pct<1?'<1%':Math.round(pct)+'%',anchor=r.right?'start':'end';return `<polyline points="${r.x},${r.y} ${elbow},${r.labelY} ${x},${r.labelY}" fill="none" stroke="${r.color}" stroke-width="${r.chosen?2.5:1.8}"/><text x="${x}" y="${r.labelY-(r.chosen?10:0)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${r.chosen?21:24}" font-weight="${r.chosen?600:400}" fill="#473641">${escapeHtml(label)}</text>${r.chosen?`<text x="${x}" y="${r.labelY+14}" text-anchor="${anchor}" dominant-baseline="middle" font-size="16" font-weight="600" fill="#753751">${escapeHtml(moneyMillions(r.value))}</text>`:''}`;});
  return `<svg viewBox="0 0 360 360" aria-hidden="true">${paths.join('')}${annotations.join('')}</svg>`;
}
function renderExpensePie(sorted,debt){
  const rows=sorted.filter(([,value])=>value>0),total=rows.reduce((sum,[,value])=>sum+value,0);
  if(!rows.some(([id])=>id===selectedPieCategory))selectedPieCategory=null;
  $('#expensePie').innerHTML=expensePieSvg(rows);
  $('#expensePie').setAttribute('aria-label',rows.map(([id,value])=>`${catInfo(id)[1]}: ${money(value)}, ${(value/total*100).toFixed(1)}%`).join('; '));
  $('#expensePieNote').textContent=debt.missing?debt.missingNote+' Dự kiến trả nợ là số tạm tính.':'';
  $('#expensePieNote').hidden=!debt.missing;
  $('#expenseColorLegend').style.setProperty('--legend-columns',Math.max(1,Math.ceil(rows.length/2)));
  $('#expenseColorLegend').innerHTML=rows.map(([id])=>`<button type="button" data-pie-select="${escapeHtml(id)}" aria-pressed="${id===selectedPieCategory}" aria-controls="expensePie"><i style="background:${expensePieColors[id]||'#85929d'}"></i><span>${escapeHtml(catInfo(id)[1])}</span></button>`).join('');
  $('#expensePieLegend').innerHTML=rows.map(([id,value])=>{const budget=Number(effectiveBudgets()[id]||0),percent=budget>0?Math.round(value/budget*100):null;return `<button type="button" data-detail-category="${escapeHtml(id)}" aria-haspopup="dialog" aria-label="${escapeHtml(catInfo(id)[1])}, ${percent===null?'chưa đặt ngân sách':percent+'% ngân sách'}. Xem chi tiết"><i class="legend-dot" style="background:${expensePieColors[id]||'#85929d'}"></i><span class="legend-budget-copy"><span class="legend-budget-heading"><b>${escapeHtml(catInfo(id)[1])}</b><span title="${percent===null?'Chưa đặt ngân sách':'Tỷ lệ sử dụng ngân sách'}">${percent===null?'—':percent+'%'}</span></span><span class="cat-bar" ${percent===null?'hidden':''} data-level="${budgetLevel(value,budget)}"><i style="width:${Math.max(0,Math.min(percent||0,100))}%"></i></span></span></button>`;}).join('');
}


function categoryDetailRows(category){return currentTx().filter(t=>t.type==='Expense'&&t.category===category).sort(sortTx)}
function renderCategoryDetail(){
  if(detailCategory===null)return;
  if(detailCategory==='loan-payment'&&!categoryDetailRows(detailCategory).length){renderLoanDetail();return;}
  const rows=categoryDetailRows(detailCategory),name=catInfo(detailCategory)[1];
  $('#categoryDetailTitle').textContent=name;
  const month=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth);
  $('#categoryDetailScope').textContent=month+' · '+rows.length+' khoản chi';
  $('#categoryDetailTotal').textContent=money(rows.reduce((sum,t)=>sum+Number(t.amount||0),0));
  $('#categoryDetailBody').innerHTML=rows.map(t=>`<tr data-tx-id="${escapeHtml(t.id)}" tabindex="0" aria-label="Xem chi tiết giao dịch"><td>${escapeHtml(formatDate(t.date))}</td><td><b>${escapeHtml(t.note||name)}</b><span>${escapeHtml(t.person||'Gia đình')}</span></td><td class="detail-money"><b>${money(t.amount)}</b><span>${t.synced?'Đã đồng bộ':'Trên thiết bị'}</span></td></tr>`).join('');
  $('#categoryDetailEmpty').hidden=!!rows.length;
  $('#categoryDetailTable').hidden=!rows.length;
}
function closeCategoryDetail(){
  closeOverlay('#categoryDetailOverlay');
  const trigger=$$('[data-detail-category]').find(b=>b.dataset.detailCategory===detailCategory);
  (trigger||$('#monthLabel')).focus();
}
$('.expense-composition').addEventListener('click',e=>{
  const legend=e.target.closest('[data-pie-select]');if(legend){const id=legend.dataset.pieSelect;selectedPieCategory=selectedPieCategory===id?null:id;renderHome();$$('[data-pie-select]').find(b=>b.dataset.pieSelect===id)?.focus();return;}
  const button=e.target.closest('[data-detail-category]');if(!button)return;
  detailCategory=button.dataset.detailCategory;renderCategoryDetail();openOverlay('#categoryDetailOverlay');$('#closeCategoryDetail').focus();
});
$('#closeCategoryDetail').onclick=closeCategoryDetail;
$('#categoryDetailOverlay').addEventListener('click',e=>{if(e.target===$('#categoryDetailOverlay'))closeCategoryDetail()});
$('#categoryDetailOverlay').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeCategoryDetail()}
  if(e.key==='Tab'){
    const first=$('#closeCategoryDetail'),last=$('#categoryDetailScroll');
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
});
let transactionDetailTrigger=null;
function openTransactionDetail(id,trigger){
  const t=transactions.find(row=>row.id===id);if(!t)return;
  transactionDetailTrigger=trigger;
  const fields=[['Loại',t.type==='Income'?'Thu nhập':'Khoản chi'],['Ngày',String(t.date).split('-').reverse().join('/')],['Danh mục',catInfo(t.category,t.type)[1]],['Người nhập',t.person||'Gia đình'],['Ghi chú',t.note||'Không có'],['Đồng bộ',t.pendingUpdate?'Thay đổi đang chờ đồng bộ':t.synced?'Đã đồng bộ Google Sheets':'Trên thiết bị']];
  $('#transactionDetailContent').innerHTML=`<p class="transaction-detail-amount">${t.type==='Income'?'+':'−'}${money(t.amount)}</p><dl>${fields.map(([label,value])=>`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
  const edit=document.createElement('button');edit.className='filter';edit.textContent=t.conflict?'Xử lý xung đột':'Sửa giao dịch';edit.onclick=()=>{closeTransactionDetail();closeOverlay('#categoryDetailOverlay');editIncome(t.id)};$('#transactionDetailContent').append(edit);
  openOverlay('#transactionDetailOverlay');$('#closeTransactionDetail').focus();
}
function closeTransactionDetail(){closeOverlay('#transactionDetailOverlay');if(transactionDetailTrigger?.isConnected)transactionDetailTrigger.focus()}
$('#closeTransactionDetail').onclick=closeTransactionDetail;
$('#transactionDetailOverlay').addEventListener('click',e=>{if(e.target===$('#transactionDetailOverlay'))closeTransactionDetail()});
$('#transactionDetailOverlay').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeTransactionDetail()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-edit-id],[data-delete-id]'))return;const row=e.target.closest('[data-tx-id]');if(row)openTransactionDetail(row.dataset.txId,row)});
document.addEventListener('keydown',e=>{const row=e.target.closest('[data-tx-id]');if(row&&e.target===row&&row.tagName!=='BUTTON'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openTransactionDetail(row.dataset.txId,row)}});
function sortTx(a,b){return String(b.date+b.timestamp).localeCompare(String(a.date+a.timestamp))}
function txRow(t,deletable=false){const c=catInfo(t.category,t.type),positive=t.type==='Income';return `<div class="transaction-row" tabindex="0" aria-haspopup="dialog" aria-label="Xem chi tiết giao dịch" data-tx-id="${escapeHtml(t.id)}"><span class="tx-icon">${c[2]}</span><div class="tx-copy"><b>${escapeHtml(t.note||c[1])}</b><span>${c[1]} · ${escapeHtml(t.person||'Gia đình')} · ${formatDate(t.date)}</span></div><div class="tx-actions"><div class="tx-amount"><b class="${positive?'income':''}">${positive?'+':'−'}${money(t.amount)}</b><span>${t.synced?'Đã đồng bộ':'Trên thiết bị'}</span></div>${deletable?`<button class="tx-edit" data-edit-id="${escapeHtml(t.id)}" aria-label="Sửa giao dịch">${t.conflict?'Xung đột':'Sửa'}</button>`:''}${deletable?`<button class="tx-delete" data-delete-id="${escapeHtml(t.id)}" aria-label="Xóa giao dịch">×</button>`:''}</div></div>`}
function formatDate(s){const d=new Date(s+'T12:00:00');return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function historyDayGroups(rows,today){
  const groups=new Map([[today,[]]]);
  [...rows].sort(sortTx).forEach(t=>{const day=String(t.date||'').slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(t)});
  const days=[today,...[...groups.keys()].filter(day=>day!==today).sort((a,b)=>b.localeCompare(a))];
  return days.map(day=>({day,rows:groups.get(day)}));
}
function renderHistory(){
  const today=dateISO(),query=searchTokens($('#historySearch').value);
  const rows=transactions.filter(t=>(historyFilter==='All'||t.type===historyFilter)&&matchesHistory(t,query));
  $('#historyMatches').hidden=!query.length;$('#historyMatches').textContent=rows.length?rows.length+' giao dịch phù hợp':'Không tìm thấy giao dịch phù hợp.';
  $('#historyList').innerHTML=historyDayGroups(rows,today).filter(g=>!query.length||g.rows.length).map(({day,rows},i)=>{
    const label=day===today?'Hôm nay':/^\d{4}-\d{2}-\d{2}$/.test(day)?day.split('-').reverse().join('/'):'Chưa có ngày';
    const daily=rows.reduce((total,t)=>{if(t.type==='Expense')total.expense+=Number(t.amount)||0;if(t.type==='Income')total.income+=Number(t.amount)||0;return total},{expense:0,income:0});
    const summary=`<div class="history-day-totals">${historyFilter!=='Income'?`<span class="day-expense">Tổng chi <b>${money(daily.expense)}</b></span>`:''}${historyFilter!=='Expense'?`<span class="day-income">Tổng thu <b>${money(daily.income)}</b></span>`:''}</div>`;
    return `<section class="history-day" aria-labelledby="historyDay-${i}"><h3 id="historyDay-${i}" class="history-day-heading">${escapeHtml(label)}${day===today?`<span>${day.split('-').reverse().join('/')}</span>`:''}</h3>${summary}<div class="history-day-list">${rows.length?rows.map(t=>txRow(t,true)).join(''):'<p class="history-day-empty">Chưa có giao dịch hôm nay'+(historyFilter==='All'?'':' trong bộ lọc này')+'.</p>'}</div></section>`;
  }).join('');
  $('#historyEmpty').classList.remove('show');$('#historyList').style.display='grid';
}

function renderBudgets(){
  const scoped=limitsAt(budgets,monthKey(activeMonth));$('#budgetMonthLabel').textContent='Áp dụng từ '+monthKey(activeMonth).split('-').reverse().join('/')+' trở đi';
  $('#budgetSyncStatus').textContent=budgetState.pending?(budgetState.remote?'Có xung đột, chọn bản muốn dùng bên dưới.':'Đã lưu trên máy · Chờ đồng bộ Google Sheets'):budgetState.revision?'Ngân sách đã đồng bộ Google Sheets':'Ngân sách chưa được đồng bộ';
  $('#budgetConflict').hidden=!budgetState.remote;
  $('#budgetEditor').innerHTML=EXPENSE_CATS.filter(c=>c[0]!=='loan-payment').map(c=>`<div class="budget-input-row"><span class="cat-icon">${c[2]}</span><label for="budget-${c[0]}">${c[1]}</label><input id="budget-${c[0]}" data-budget="${c[0]}" inputmode="numeric" value="${new Intl.NumberFormat('vi-VN').format(scoped[c[0]]||0)}" aria-label="Ngân sách ${c[1]}" /></div>`).join('');
  const autoDebt=homeLoanSummary(monthKey(activeMonth)).total,manualDebt=Object.prototype.hasOwnProperty.call(scoped,'loan-payment');
  $('#budgetEditor').insertAdjacentHTML('beforeend',`<div class="budget-input-row"><span class="cat-icon">🏦</span><label for="budget-loan-payment">Trả nợ</label><input id="budget-loan-payment" data-budget="loan-payment" inputmode="numeric" value="${manualDebt?new Intl.NumberFormat('vi-VN').format(scoped['loan-payment']):''}" placeholder="${new Intl.NumberFormat('vi-VN').format(autoDebt)}" aria-label="Ngân sách Trả nợ; để trống dùng mức tự động" /></div><p class="debt-budget-note">Trả nợ: để trống sẽ dùng lịch ngân hàng và khoản bổ sung riêng trong Sheets của tháng đang xem.</p>`);
  $$('[data-budget]').forEach(i=>i.addEventListener('input',()=>{i.value=i.dataset.budget==='loan-payment'&&i.value.trim()===''?'':new Intl.NumberFormat('vi-VN').format(parseDigits(i.value))}));
}
function parseDigits(v){return Number(String(v).replace(/\D/g,''))||0}
function openEntry(type='Expense'){editingTransactionId=null;entryType=type;selectedCategory=(type==='Expense'?EXPENSE_CATS:INCOME_CATS)[0][0];$('#entryForm').reset();$('#dateInput').value=dateISO();$('#personInput').value=read('lastPerson','Vợ');renderEntry();openOverlay('#entryOverlay');setTimeout(()=>$('#amountInput').focus(),220)}
function editIncome(id){
  let tx=transactions.find(t=>t.id===id);if(!tx)return;
  if(tx.conflict){if(!confirm('Bản trên Sheets đã thay đổi hoặc đã bị xóa. Dùng bản trên Sheets và bỏ sửa đổi trên máy? Bấm Hủy để giữ bản nháp.'))return;const remote=tx.conflict.remote;transactions=transactions.filter(t=>t.id!==id);if(remote)transactions.push(remote);write(STORE.tx,transactions);render();if(!remote)return;tx=remote;}
  editBase=tx.base||JSON.stringify(tx);
  editingTransactionId=id;entryType=tx.type;selectedCategory=tx.category;
  $('#entryForm').reset();$('#amountInput').value=new Intl.NumberFormat('vi-VN').format(tx.amount);
  $('#dateInput').value=tx.date;$('#noteInput').value=tx.note||'';
  if(![...$('#personInput').options].some(o=>o.value===tx.person))$('#personInput').add(new Option(tx.person||'Gia đình',tx.person||'Gia đình'));
  $('#personInput').value=tx.person||'Gia đình';renderEntry();openOverlay('#entryOverlay');$('#amountInput').focus();
}
function sameTransactionValues(a,b){return ['date','type','category','person','note'].every(k=>String(a[k]||'')===String(b[k]||''))&&Number(a.amount)===Number(b.amount)}
function mergeSheetTransactions(remote,local){
  const pending=local.filter(t=>!t.synced),remoteIds=new Set(remote.map(t=>t.id));
  return remote.map(t=>{const edit=pending.find(p=>p.id===t.id);if(!edit||sameTransactionValues(edit,t))return t;if(!edit.pendingUpdate&&!edit.conflict)edit.conflict={remote:t};return edit}).concat(pending.filter(t=>!remoteIds.has(t.id)));
}
async function updateIncome(id,input){
  const index=transactions.findIndex(t=>t.id===id);if(index<0)return showToast('Giao dịch không còn tồn tại');
  const old=transactions[index];
  const tx={...old,...input,type:old.type,base:editBase,synced:false,pendingUpdate:!!(old.synced||old.pendingUpdate)};
  transactions[index]=tx;write(STORE.tx,transactions);render();
  if(endpoint()){
    try{await pushToSheet(tx,tx.pendingUpdate?'update':'create');await syncWithSheet(true);
      showToast(transactions.find(t=>t.id===id)?.synced?'Đã sửa và đồng bộ Google Sheets':'Đã lưu trên thiết bị · Chưa xác nhận sửa trên Sheets. Kiểm tra Code.gs mới');
    }catch{showToast('Đã lưu thay đổi trên thiết bị · Chờ đồng bộ')}
  }else showToast('Đã lưu thay đổi trên thiết bị');
}
function renderEntry(){
  const exp=entryType==='Expense';$('#entryTitle').textContent=editingTransactionId?(exp?'Sửa khoản chi':'Sửa thu nhập'):(exp?'Thêm khoản chi':'Thêm thu nhập');$('#entryEyebrow').textContent=exp?'GHI NHANH':'DÒNG TIỀN VÀO';$('#submitEntry').textContent=editingTransactionId?'Lưu thay đổi':(exp?'Lưu khoản chi':'Lưu thu nhập');$('.type-switch').hidden=!!editingTransactionId;
  $$('.type-switch button').forEach(b=>b.classList.toggle('active',b.dataset.type===entryType));const cats=exp?EXPENSE_CATS:INCOME_CATS;
  const holder=$('#repeatChoices');holder.replaceChildren();if(exp&&!editingTransactionId){
   const seen=new Set();for(const t of [...transactions].filter(t=>t.type==='Expense').sort(sortTx)){const k=JSON.stringify([t.category,t.note,t.amount]);if(seen.has(k))continue;seen.add(k);const b=document.createElement('button');b.type='button';b.className='filter';b.textContent=(t.note||catInfo(t.category)[1])+' · '+money(t.amount);b.onclick=()=>{selectedCategory=t.category;$('#amountInput').value=Number(t.amount).toLocaleString('vi-VN');$('#noteInput').value=t.note||'';renderEntry()};holder.append(b);if(seen.size===3)break;}
  }
  $('#categoryPicker').innerHTML=cats.map(c=>`<button type="button" class="category-choice ${selectedCategory===c[0]?'active':''}" data-category="${c[0]}"><span>${c[2]}</span><b>${c[1]}</b></button>`).join('');
  $$('[data-category]').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.category;renderEntry()});
}
function openOverlay(sel){const o=$(sel);o.classList.add('open');o.setAttribute('aria-hidden','false')}
function closeOverlay(sel){const o=$(sel);o.classList.remove('open');o.setAttribute('aria-hidden','true')}
async function saveTransaction(input){
  write('lastPerson',input.person||'Gia đình');
  const tx={id:crypto.randomUUID?crypto.randomUUID():Date.now().toString(36),timestamp:new Date().toISOString(),date:input.date||dateISO(),type:input.type||'Expense',amount:Number(input.amount),category:input.category,person:input.person||'Gia đình',note:input.note||'',synced:false};
  transactions.push(tx);write(STORE.tx,transactions);render();
  if(endpoint()){
    try{await pushToSheet(tx);await syncWithSheet(true);const saved=transactions.find(t=>t.id===tx.id);showToast(saved?.synced?'Đã lưu và đồng bộ Google Sheets':'Đã lưu · Đang chờ xác nhận đồng bộ')}catch{showToast('Đã lưu trên điện thoại · Chưa thể đồng bộ')}
  }else showToast('Đã lưu trên điện thoại');
  return tx;
}
async function pushToSheet(tx,action='create'){try{return await nativeRequest({...tx,action:'v3_'+action,amount:String(tx.amount||'')});}catch(e){if(e.payload?.code==='TX_CONFLICT'){tx.conflict={remote:e.payload.remote?sheetRecord(e.payload.remote):null};write(STORE.tx,transactions);render();showToast('Xung đột giao dịch · Mở Lịch sử để chọn bản dùng')}throw e;}}
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
async function requestSheetSnapshot(includeMetadata=false){const data=await nativeRequest({action:'snapshot'});if(data.apiVersion!==3||data.webVersion!==1)throw new Error('Cần triển khai apps-script/Code.gs của bản GitHub Pages.');return includeMetadata?data:data.transactions;}
function persistBudgetState(){write(STORE.budget,budgets);write('family_budget_sync_v2',budgetState);}
function sameBudgets(a,b){return JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]))===JSON.stringify(Object.keys(b).sort().map(k=>[k,b[k]]));}
async function mergeRemoteBudget(remote){
  if(!remote||!remote.values||!remote.revision)throw new Error('Máy chủ chưa hỗ trợ đồng bộ ngân sách. Hãy cập nhật Code.gs.');
  const pending=budgetState.pending;
  if(!pending||sameBudgets(pending.values,remote.values)){budgets={...remote.values};budgetState={revision:remote.revision,pending:null,remote:null};persistBudgetState();return;}
  if(pending.baseRevision!==remote.revision){budgetState.remote=remote;persistBudgetState();return;}
  try{const saved=await nativeRequest({action:'save_budgets',values:JSON.stringify(pending.values),revision:pending.baseRevision});budgets={...saved.budgets.values};budgetState={revision:saved.budgets.revision,pending:null,remote:null};persistBudgetState();}
  catch(error){if(error.payload?.code==='BUDGET_CONFLICT'){budgetState.remote=error.payload.budgets;persistBudgetState();}else throw error;}
}
async function syncWithSheet(quiet=false){
  if(syncFlight)return syncFlight;
  syncFlight=(async()=>{
    $('#syncNowBtn')?.classList.add('syncing');
    try{
      const snapshot=await requestSheetSnapshot(true);if(snapshot.loans){Object.assign(LOAN_SCHEDULE,snapshot.loans);write('loans',snapshot.loans)}const remote=snapshot.transactions.map(sheetRecord).filter(t=>t.id&&!pendingDeletes.includes(t.id));
      transactions=mergeSheetTransactions(remote,transactions).filter(t=>!pendingDeletes.includes(t.id));write(STORE.tx,transactions);
      await mergeRemoteBudget(snapshot.budgets);lastSyncOk=!queued()&&!budgetState.remote;if(lastSyncOk){lastVerified=Date.now();write('lastVerifiedV3',lastVerified)}render();
      if(!quiet)showToast(budgetState.remote?'Ngân sách có xung đột · Mở Ngân sách để chọn bản dùng':queued()?'Còn thay đổi chưa đồng bộ':'Đã đồng bộ Google Sheets');return lastSyncOk;
    }catch(error){lastSyncOk=false;renderHeader();renderBudgets();if(!quiet)showToast(error.message||'Chưa thể đồng bộ');return false;}
    finally{$('#syncNowBtn')?.classList.remove('syncing');}
  })();
  try{return await syncFlight;}finally{syncFlight=null;}
}
async function retryUnsynced(){
  if(!endpoint())return;
  for(const id of [...pendingDeletes]){try{await pushToSheet({id},'delete');pendingDeletes=pendingDeletes.filter(item=>item!==id);write('family_deleted_v2',pendingDeletes);}catch{break;}}
  const pending=transactions.filter(t=>!t.synced&&!t.conflict&&!pendingDeletes.includes(t.id));for(const tx of pending){try{await pushToSheet(tx,tx.pendingUpdate?'update':'create');}catch{break;}}
  await syncWithSheet(true);
}
async function deleteTransaction(id){
  const tx=transactions.find(t=>t.id===id);if(!tx||!confirm(`Xóa giao dịch “${tx.note||catInfo(tx.category,tx.type)[1]}” trị giá ${money(tx.amount)}?`))return;
  pendingDeletes=[...new Set([...pendingDeletes,id])];write('family_deleted_v2',pendingDeletes);transactions=transactions.filter(t=>t.id!==id);write(STORE.tx,transactions);render();
  await retryUnsynced();showToast(pendingDeletes.includes(id)?'Đã xóa trên máy · Chờ đồng bộ':'Đã xóa và đồng bộ Google Sheets');
}
function nav(name){
  const next=$(`#${name}View`),current=$('.view.active');if(!next||next===current)return;
  const pages=['home','history','dashboard','budget'],direction=pages.indexOf(name)>pages.indexOf(current?.id.replace(/View$/,''))?1:-1;
  if(name==='budget')renderBudgets();
  $$('.view').forEach(v=>{v.getAnimations?.().forEach(a=>a.cancel());v.style.transform='';v.style.willChange='';v.classList.toggle('active',v===next)});
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.nav===name));
  scrollTo({top:0,behavior:'instant'});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)next.animate?.([{transform:`translateX(${direction*24}px)`,opacity:.85},{transform:'translateX(0)',opacity:1}],{duration:160,easing:'cubic-bezier(.2,.8,.2,1)'});
}
$$('[data-open-entry]').forEach(b=>b.onclick=()=>openEntry(b.dataset.openEntry));$$('[data-nav]').forEach(b=>b.onclick=()=>nav(b.dataset.nav));
$('#settingsBtn').onclick=()=>{ $('#endpointInput').value=nativeConfig.endpoint;$('#familyTokenInput').value='';$('#familyTokenInput').placeholder=nativeConfig.hasToken?'Đã lưu mã · Để trống để giữ nguyên':'Nhập FAMILY_ACCESS_TOKEN';openOverlay('#settingsOverlay')};
$('#assistantBtn').onclick=()=>openOverlay('#assistantOverlay');
$$('[data-close="entry"]').forEach(b=>b.onclick=()=>closeOverlay('#entryOverlay'));$$('[data-close="settings"]').forEach(b=>b.onclick=()=>closeOverlay('#settingsOverlay'));$$('[data-close="assistant"]').forEach(b=>b.onclick=()=>closeOverlay('#assistantOverlay'));
$$('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeOverlay('#'+o.id)}));
$('#historyList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-id]');if(edit)return editIncome(edit.dataset.editId);const button=e.target.closest('[data-delete-id]');if(button)deleteTransaction(button.dataset.deleteId)});
$('#syncPill').onclick=()=>{if(budgetState.remote)nav('budget');else if(transactions.some(t=>t.conflict))nav('history');else $('#syncNowBtn').click()};
$('#syncNowBtn').onclick=async()=>{await retryUnsynced();await syncWithSheet(false)};
$$('.type-switch button').forEach(b=>b.onclick=()=>{entryType=b.dataset.type;selectedCategory=(entryType==='Expense'?EXPENSE_CATS:INCOME_CATS)[0][0];renderEntry()});
$('#amountInput').addEventListener('input',e=>{e.target.value=parseDigits(e.target.value)?new Intl.NumberFormat('vi-VN').format(parseDigits(e.target.value)):''});
$('#entryForm').addEventListener('submit',async e=>{e.preventDefault();const amount=parseDigits($('#amountInput').value);if(!amount)return showToast('Vui lòng nhập số tiền');$('#submitEntry').disabled=true;closeOverlay('#entryOverlay');const input={type:entryType,amount,category:selectedCategory,person:$('#personInput').value,date:$('#dateInput').value,note:$('#noteInput').value.trim()};if(editingTransactionId)await updateIncome(editingTransactionId,input);else await saveTransaction(input);editingTransactionId=null;$('#submitEntry').disabled=false});
$('#prevMonth').onclick=()=>{activeMonth=new Date(activeMonth.getFullYear(),activeMonth.getMonth()-1,1);render()};$('#nextMonth').onclick=()=>{activeMonth=new Date(activeMonth.getFullYear(),activeMonth.getMonth()+1,1);render()};
$('#historySearch').addEventListener('input',renderHistory);
$$('[data-filter]').forEach(b=>b.onclick=()=>{historyFilter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderHistory()});
$('#saveBudgetBtn').onclick=async()=>{
  if(syncFlight){showToast('Đang đồng bộ, vui lòng đợi rồi lưu lại.');return;}
  const values={};$$('[data-budget]').forEach(i=>{if(i.dataset.budget==='loan-payment'&&i.value.trim()==='')return;values[i.dataset.budget]=parseDigits(i.value);});
  const scoped=limitsAt(budgets,monthKey(activeMonth)),merged={...budgets};for(const [id] of EXPENSE_CATS){if(values[id]!==scoped[id])merged[monthKey(activeMonth)+':'+id]=values[id]??-1;}budgets=merged;budgetState.pending={values:{...budgets},baseRevision:budgetState.pending?budgetState.pending.baseRevision:budgetState.revision};persistBudgetState();render();
  $('#saveBudgetBtn').disabled=true;try{if(endpoint())await syncWithSheet(false);showToast(budgetState.pending?'Đã lưu trên máy · Chưa ghi lên Sheets':'Đã lưu ngân sách vào Google Sheets');}finally{$('#saveBudgetBtn').disabled=false;}
};
$('#useRemoteBudget').onclick=()=>{const remote=budgetState.remote;if(!remote)return;budgets={...remote.values};budgetState={revision:remote.revision,pending:null,remote:null};persistBudgetState();render();};
$('#useLocalBudget').onclick=async()=>{if(!budgetState.remote||!budgetState.pending)return;if(!confirm('Ghi ngân sách trên điện thoại này thay cho bản đang có trên Google Sheets?'))return;budgetState.pending.baseRevision=budgetState.remote.revision;budgetState.remote=null;persistBudgetState();await syncWithSheet(false);};
$('#saveEndpointBtn').onclick=async()=>{
  const url=$('#endpointInput').value.trim(),token=$('#familyTokenInput').value.trim();
  if(url!==nativeConfig.endpoint&&(transactions.some(t=>!t.synced)||pendingDeletes.length||budgetState.pending))return showToast('Còn dữ liệu chưa đồng bộ. Hãy hoàn tất trước khi đổi spreadsheet.');
  const result=JSON.parse(FamilyNative.configure(url,token,$('#rememberConnection').checked));if(!result.ok)return showToast(result.error);
  if(url!==nativeConfig.endpoint){transactions=[];budgets={};Object.assign(LOAN_SCHEDULE,{records:[],extraDebt:0});write('loans',LOAN_SCHEDULE);lastVerified=null;write('lastVerifiedV3',null);budgetState={revision:null,pending:null,remote:null};write(STORE.tx,transactions);persistBudgetState();}
  nativeConfig=JSON.parse(FamilyNative.getConfig());$('#familyTokenInput').value='';closeOverlay('#settingsOverlay');render();await retryUnsynced();if(lastSyncOk)showToast('Đã kết nối Google Sheets');else {openOverlay('#settingsOverlay');showToast('Chưa kết nối được. Bấm Đồng bộ ở Lịch sử để xem lỗi.');}
};
$('#clearDataBtn').onclick=()=>{if(!confirm('Xóa bản lưu trên điện thoại, gồm các thay đổi chưa đồng bộ? Dữ liệu trên Google Sheets vẫn được giữ.'))return;transactions=[];budgets={};pendingDeletes=[];budgetState={revision:null,pending:null,remote:null};write(STORE.tx,transactions);write('family_deleted_v2',pendingDeletes);persistBudgetState();render();closeOverlay('#settingsOverlay');};
function assistantContext(q){
  const viewMonth=monthKey(activeMonth);if(!/trả nợ|khoản vay|shinhan/i.test(q))return {viewMonth};
  const m=/dự báo|tháng tới/i.test(q)?monthKey(new Date(activeMonth.getFullYear(),activeMonth.getMonth()+1,1)):viewMonth;
  const debt=homeLoanSummary(m);return {viewMonth,loan:{month:m,total:debt.total,incomplete:debt.missing}};
}
function addChatBubble(text,kind,id){
  const bubble=document.createElement('div');bubble.className='chat-bubble '+kind;bubble.textContent=text;if(id)bubble.id=id;$('#chatLog').appendChild(bubble);$('#chatLog').scrollTop=$('#chatLog').scrollHeight;return bubble;
}
let assistantRequestId='',assistantTimer;
async function askAssistant(question){
  if(assistantRequestId)return;
  const q=String(question||'').trim();if(!q)return showToast('Hãy nhập câu hỏi');if(q.length>4000)return showToast('Câu hỏi tối đa 4.000 ký tự');
  if(!endpoint()){closeOverlay('#assistantOverlay');$('#settingsBtn').click();return;}
  assistantRequestId=Date.now().toString(36);addChatBubble(q,'user');$('#assistantQuestion').value='';addChatBubble('Đang đọc dữ liệu gia đình…','ai loading','assistantLoading');$('#askAssistantBtn').disabled=true;
  try{const result=await nativeRequest({action:'chat_scoped',question:q,context:JSON.stringify(assistantContext(q))});finishAssistant(result.answer);}catch(error){finishAssistant(error.message||'Trợ lý chưa phản hồi.',false);}
}
function finishAssistant(message,ok=true){
  clearTimeout(assistantTimer);assistantRequestId='';$('#assistantLoading')?.remove();addChatBubble(message,ok?'ai':'ai');$('#askAssistantBtn').disabled=false;
}
$$('[data-ai-question]').forEach(b=>b.onclick=()=>{$('#assistantQuestion').value=b.dataset.aiQuestion;askAssistant(b.dataset.aiQuestion)});
$('#askAssistantBtn').onclick=()=>askAssistant($('#assistantQuestion').value);

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&endpoint())retryUnsynced();});
window.addEventListener('familyresume',()=>{if(endpoint())retryUnsynced();});
window.addEventListener('online',()=>{if(endpoint())retryUnsynced();});
render();if(endpoint())retryUnsynced();else $('#settingsBtn').click();

// Swipe navigation only on the page surface, leaving nested controls alone.
function swipeDestination(page,dx,dy,elapsed){
  const pages=['home','history','dashboard','budget'];
  const distance=Math.abs(dx),quick=elapsed>0&&elapsed<=250&&distance/elapsed>=.35;
  if(elapsed>1200||distance<(quick?28:48)||distance<Math.abs(dy)*1.6)return null;
  const index=pages.indexOf(page),next=index+(dx<0?1:-1);
  return index>=0&&next>=0&&next<pages.length?pages[next]:null;
}
(function enablePageSwipes(){
  const surface=$('main');let gesture=null,ignoreClickUntil=0,frame=0;
  const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;if(gesture){gesture.view.style.transform='';gesture.view.style.willChange='';}gesture=null;};
  const blocked=target=>{
    if($('.overlay.open')||target.closest('input,textarea,select,button,a,[contenteditable="true"],svg,.dash-trend-scroll,.detail-scroll,.loan-table-scroll'))return true;
    for(let node=target;node&&node!==surface;node=node.parentElement){if(node.scrollWidth>node.clientWidth+2&&/auto|scroll/.test(getComputedStyle(node).overflowX))return true;}
    return false;
  };
  surface.addEventListener('touchstart',event=>{
    reset();if(event.touches.length!==1||blocked(event.target))return;
    const t=event.touches[0];if(t.clientX<24||t.clientX>innerWidth-24)return;
    const view=$('.view.active');if(!view)return;
    gesture={view,offset:0,x:t.clientX,y:t.clientY,id:t.identifier,page:view.id.replace(/View$/,''),time:performance.now(),horizontal:false};
  },{passive:true});
  surface.addEventListener('touchmove',event=>{
    if(!gesture)return;if(event.touches.length!==1||$('.overlay.open')){reset();return;}
    const t=event.touches[0];if(t.identifier!==gesture.id){reset();return;}
    const dx=t.clientX-gesture.x,dy=t.clientY-gesture.y;
    if(!gesture.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){reset();return;}
    if(Math.abs(dx)>18&&Math.abs(dx)>Math.abs(dy)*1.6)gesture.horizontal=true;
    if(gesture.horizontal){if(event.cancelable)event.preventDefault();const g=gesture;g.offset=Math.max(-72,Math.min(72,dx*.35));if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(gesture===g){g.view.style.willChange='transform';g.view.style.transform=`translateX(${g.offset}px)`;}});}
  },{passive:false});
  surface.addEventListener('touchend',event=>{
    const g=gesture;reset();if(!g||$('.overlay.open')||$('.view.active')?.id!==g.page+'View')return;
    const t=[...event.changedTouches].find(t=>t.identifier===g.id);if(!t)return;
    const next=swipeDestination(g.page,t.clientX-g.x,t.clientY-g.y,performance.now()-g.time);
    if(g.horizontal)ignoreClickUntil=performance.now()+400;
    if(next){if(event.cancelable)event.preventDefault();nav(next);}
  },{passive:false});
  surface.addEventListener('touchcancel',reset,{passive:true});
  surface.addEventListener('click',event=>{if(performance.now()<ignoreClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
})();
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
