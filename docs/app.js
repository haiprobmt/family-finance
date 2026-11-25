// [id, label, icon]. Icons are line SVG names (src/ui/icons.js); ids/labels unchanged.
const EXPENSE_CATS=[['food','Ăn uống','cat-food'],['grocery','Đi chợ','cat-grocery'],['kids','Con cái','cat-kids'],['transport','Xe cộ','cat-transport'],['home','Nhà cửa','cat-home'],['bills','Điện nước','cat-bills'],['health','Sức khỏe','cat-health'],['couple-allowance','Tiêu Vặt Vợ Chồng','cat-couple-allowance'],['other','Khác','cat-other'],['loan-payment','Trả nợ','cat-loan-payment']];
const INCOME_CATS=[['salary','Lương','cat-salary'],['bonus','Thưởng','cat-bonus'],['business','Kinh doanh','cat-business'],['other-income','Khác','cat-other-income']];
const UIc=FFUI.c,UIfmt=FFUI.fmt;
const STORE={tx:'family_finance_transactions_v1',budget:'family_finance_budgets_v1',endpoint:'family_finance_endpoint_v1'};
let transactions=read(STORE.tx,[]),budgets=read(STORE.budget,{});
let budgetState=read('family_budget_sync_v2',{revision:null,pending:null,remote:null}),pendingDeletes=read('family_deleted_v2',[]),syncFlight=null,lastSyncOk=false;
let editBase='',lastVerified=read('lastVerifiedV3',null);
let lastSyncError=null,hideAmounts=read('privacy_hide_amounts',false)===true;
const localStore=FFData.createStore(localStorage);localStore.migrate();
const extStore=FFExt.createExtStore({read,write,request:values=>nativeRequest(values),onChange:()=>{if(typeof renderFinanceViews==='function')renderFinanceViews()}});
// Durable operation view over the legacy keys + 3.0 collections (FFSync.engine.pendingOperations).
function operations(){return [...FFSync.engine.pendingOperations({transactions,pendingDeletes,budgetState}),...extStore.operations()]}
function queued(){return operations().length}
function syncState(){return FFSync.engine.syncStatus({configured:!!endpoint(),syncing:!!syncFlight,lastError:lastSyncError,lastSyncOk,operations:operations(),online:navigator.onLine})}
// Financial rules live in docs/src/domain (pure, parity-tested against the legacy code).
const {money:FM,budget:FB,cashflow:FC,loan:FL}=FFDomain;
function limitsAt(all,month){return FB.limitsAt(all,month)}
let activeMonth=new Date(),entryType='Expense',selectedCategory='food',historyFilter='All',detailCategory=null,editingTransactionId=null;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function read(key,fallback){try{return JSON.parse(localStorage.getItem('ffpages:'+key))??fallback}catch{return fallback}}
function write(key,val){localStorage.setItem('ffpages:'+key,JSON.stringify(val))}
function money(n){FFUI.state.hideAmounts=hideAmounts;return UIfmt.vnd(n)}
function budgetLevel(spend,budget){return FB.budgetLevel(spend,budget)}
function moneyMillions(n){FFUI.state.hideAmounts=hideAmounts;return UIfmt.compact(n)}
function dateISO(d=new Date()){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function catInfo(id,type='Expense'){if(id==='loan-payment')return ['loan-payment','Trả nợ','cat-loan-payment'];return [...EXPENSE_CATS,...INCOME_CATS].find(c=>c[0]===id)||['other',type==='Expense'?'Khác':'Thu nhập',type==='Expense'?'cat-other':'cat-other-income']}
function catIcon(id,type){return FFUI.icon(catInfo(id,type)[2])}
function currentTx(){const mk=monthKey(activeMonth);return transactions.filter(t=>String(t.date).slice(0,7)===mk)}
function totals(){const t=FC.monthTotals(transactions,monthKey(activeMonth));return {expense:t.expense,income:t.income}}
function showToast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),2400)}
function endpoint(){return nativeConfig.hasToken?nativeConfig.endpoint:''}
function render(){FFUI.state.hideAmounts=hideAmounts;renderHeader();renderHome();renderHistory();renderBudgets();renderDashboard();renderCategoryDetail();if(typeof renderFinanceViews==='function')renderFinanceViews()}
function renderHeader(){
  const period=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth);
  $('#monthLabel').textContent=period;$$('[data-period-label]').forEach(el=>el.textContent=period);
  const pill=$('#syncPill'),status=syncState(),last=lastVerified?'Lần đồng bộ hoàn tất: '+new Date(lastVerified).toLocaleString('vi-VN'):'';
  pill.classList.toggle('connected',status.state==='synced');pill.dataset.state=status.state;pill.querySelector('b').textContent=status.label;pill.title=status.error?'Lỗi gần nhất: '+status.error:status.label;
  // Settings shows the last-sync time on its own line (#lastSyncTime), so its mirror omits it.
  $$('[data-sync-mirror]').forEach(el=>el.innerHTML=UIc.syncStatus(status,el.closest('#settingsView')?'':last));
  $('#lastSyncTime').textContent=last||'Chưa có lần đồng bộ hoàn tất trên thiết bị này.';
  // Keep "Trạng thái: …" in step with the pill; it used to stay at "Đang đồng bộ…" after a sync.
  if(typeof renderSyncDiagnostics==='function')renderSyncDiagnostics();
}
function effectiveBudgets(){const mk=monthKey(activeMonth);return FB.effectiveBudgets(budgets,mk,homeLoanSummary(mk).total);}
function renderHome(){
  const mk=monthKey(activeMonth),t=totals(),totalBudget=Object.values(effectiveBudgets()).reduce((a,b)=>a+(Number(b)||0),0),overBudget=totalBudget>0&&t.expense>totalBudget;
  const exp=currentTx().filter(t=>t.type==='Expense');const sums={};exp.forEach(t=>sums[t.category]=(sums[t.category]||0)+Number(t.amount));const debt=homeLoanSummary(mk);const paid=sums['loan-payment']||0;
  // Missing loan schedule is never shown as a confirmed number (BASELINE_AUDIT D6).
  const provisional=!!(totalBudget&&debt.missing&&!Object.prototype.hasOwnProperty.call(limitsAt(budgets,mk),'loan-payment'));
  $('#budgetCaption').textContent=(totalBudget?(overBudget?`Vượt ngân sách ${money(t.expense-totalBudget)}`:`Còn ${money(totalBudget-t.expense)}`):'Đặt ngân sách để theo dõi giới hạn tháng')+(provisional?' · Ngân sách trả nợ tạm tính (thiếu lịch vay)':'');
  $('#budgetGauge').innerHTML=UIc.budgetProgress({label:'Đã dùng ngân sách tháng',spent:t.expense,limit:totalBudget||null,level:budgetLevel(t.expense,totalBudget),provisional,cls:'bp-total'});
  $('#debtSummary').textContent='Trả nợ · Dự kiến '+money(debt.total)+' · Đã trả '+money(paid)+' · Còn phải trả '+money(Math.max(0,debt.total-paid));
  const sorted=Object.entries(sums).sort((a,b)=>b[1]-a[1]);
  renderExpensePie(sorted,debt);
  const recent=[...transactions].sort(sortTx).slice(0,6);
  $('#recentTransactions').innerHTML=recent.length?recent.map(t=>txRow(t)).join(''):UIc.emptyState({title:'Chưa có giao dịch',text:'Giao dịch bạn ghi sẽ xuất hiện tại đây.',actionHtml:UIc.button({label:'Thêm giao dịch',variant:'primary',iconName:'plus',attrs:{'data-open-entry':'Expense'}})});
}

function homeLoanSummary(month){return FL.loanSummary(LOAN_SCHEDULE,month,loanRates)}
function renderLoanDetail(){
  const debt=homeLoanSummary(monthKey(activeMonth));
  $('#categoryDetailTitle').textContent='Trả nợ';
  $('#categoryDetailScope').textContent=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth)+(debt.missing?' · '+debt.missingNote:'');
  $('#categoryDetailTotal').textContent=money(debt.total)+(debt.missing?' (tạm tính)':'');
  $('#categoryDetailBody').innerHTML=debt.rows.map(r=>`<tr><td data-label="Tháng">${monthKey(activeMonth).split('-').reverse().join('/')}</td><td data-label="Khoản"><b>${escapeHtml(r.bank)}</b><small>${r.missing?'Chưa có dữ liệu':escapeHtml(r.rateType)}</small></td><td class="num" data-label="Số tiền">${r.missing?'<span class="unknown">Thiếu</span>':UIc.money(r.payment)}</td></tr>`).join('')+`<tr><td data-label="Tháng">—</td><td data-label="Khoản"><b>Khoản cộng thêm</b></td><td class="num" data-label="Số tiền">${UIc.money(FL.extraDebtAt(LOAN_SCHEDULE,monthKey(activeMonth)))}</td></tr>`;
  $('#categoryDetailEmpty').hidden=true;$('#categoryDetailTable').hidden=false;
}
// Expense composition: donut (≤7 slices, rest grouped as "Khác") + per-category budget progress.
function renderExpensePie(sorted,debt){
  const rows=sorted.filter(([,value])=>value>0),eff=effectiveBudgets();
  $('#expensePie').innerHTML=FFUI.chart.donut({segments:rows.map(([id,value])=>({id,label:catInfo(id)[1],value})),caption:'Tỷ trọng chi tiêu '+UIfmt.monthLong(monthKey(activeMonth)),centerLabel:'Tổng chi',legendAttrs:s=>({'data-detail-category':s.id,'aria-haspopup':'dialog','aria-label':`${s.label}: ${money(s.value)}. Xem giao dịch`})});
  $('#expensePieNote').textContent=debt.missing?debt.missingNote+' Dự kiến trả nợ là số tạm tính.':'';
  $('#expensePieNote').hidden=!debt.missing;
  $('#expensePieLegend').innerHTML=rows.map(([id,value])=>{const budget=eff[id];return UIc.budgetProgress({label:catInfo(id)[1],iconName:catInfo(id)[2],spent:value,limit:budget===undefined?null:Number(budget),level:budgetLevel(value,Number(budget||0)),tag:'button',attrs:{'data-detail-category':id,'aria-haspopup':'dialog'}})}).join('');
}

// Source-transaction row shared by category detail and KPI drill-through.
function detailRow(t,fallback){return `<tr data-tx-id="${escapeHtml(t.id)}" tabindex="0" aria-label="Xem chi tiết giao dịch"><td data-label="Ngày">${escapeHtml(formatDate(t.date))}</td><td data-label="Nội dung"><b>${escapeHtml(t.note||fallback||catInfo(t.category,t.type)[1])}</b><small>${escapeHtml(catInfo(t.category,t.type)[1])} · ${escapeHtml(t.person||'Gia đình')}</small></td><td class="num" data-label="Số tiền">${UIc.money(t.amount,{semantic:t.type==='Income'?'income':'expense'})}<small>${t.synced?'Đã đồng bộ':'Trên thiết bị'}</small></td></tr>`}
function categoryDetailRows(category){return currentTx().filter(t=>t.type==='Expense'&&t.category===category).sort(sortTx)}
function renderCategoryDetail(){
  if(detailCategory===null)return;
  if(detailCategory==='loan-payment'&&!categoryDetailRows(detailCategory).length){renderLoanDetail();return;}
  const rows=categoryDetailRows(detailCategory),name=catInfo(detailCategory)[1];
  $('#categoryDetailTitle').textContent=name;
  const month=new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric'}).format(activeMonth);
  $('#categoryDetailScope').textContent=month+' · '+rows.length+' khoản chi';
  $('#categoryDetailTotal').textContent=money(rows.reduce((sum,t)=>sum+Number(t.amount||0),0));
  $('#categoryDetailBody').innerHTML=rows.map(t=>detailRow(t,name)).join('');
  $('#categoryDetailEmpty').hidden=!!rows.length;
  $('#categoryDetailTable').hidden=!rows.length;
}
function closeCategoryDetail(){
  closeOverlay('#categoryDetailOverlay');
  const trigger=$$('[data-detail-category]').find(b=>b.dataset.detailCategory===detailCategory);
  (trigger||$('#monthLabel')).focus();
}
$('.expense-composition').addEventListener('click',e=>{
  const button=e.target.closest('[data-detail-category]');if(!button)return;
  detailCategory=button.dataset.detailCategory;renderCategoryDetail();openOverlay('#categoryDetailOverlay',button);
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
  const actions=document.createElement('div');actions.className='sheet-actions';
  const del=document.createElement('button');del.type='button';del.className='btn btn-outline btn-md danger-text';del.textContent='Xóa giao dịch';del.onclick=()=>{closeTransactionDetail();closeOverlay('#categoryDetailOverlay');deleteTransaction(t.id)};
  const edit=document.createElement('button');edit.type='button';edit.className='btn btn-primary btn-md';edit.textContent=t.conflict?'Xử lý xung đột':'Sửa giao dịch';edit.onclick=()=>{closeTransactionDetail();closeOverlay('#categoryDetailOverlay');editIncome(t.id)};
  actions.append(del,edit);$('#transactionDetailContent').append(actions);
  openOverlay('#transactionDetailOverlay',trigger);
}
function closeTransactionDetail(){closeOverlay('#transactionDetailOverlay');if(transactionDetailTrigger?.isConnected)transactionDetailTrigger.focus()}
$('#closeTransactionDetail').onclick=closeTransactionDetail;
$('#transactionDetailOverlay').addEventListener('click',e=>{if(e.target===$('#transactionDetailOverlay'))closeTransactionDetail()});
$('#transactionDetailOverlay').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeTransactionDetail()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-edit-id],[data-delete-id]'))return;const row=e.target.closest('[data-tx-id]');if(row)openTransactionDetail(row.dataset.txId,row)});
document.addEventListener('keydown',e=>{const row=e.target.closest('[data-tx-id]');if(row&&e.target===row&&row.tagName!=='BUTTON'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openTransactionDetail(row.dataset.txId,row)}});
function sortTx(a,b){return String(b.date+b.timestamp).localeCompare(String(a.date+a.timestamp))}
function txStatus(t){return t.conflict?'<span class="tx-status pending">Xung đột</span>':t.synced?'<span class="tx-status">Đã đồng bộ</span>':'<span class="tx-status pending">Chờ đồng bộ</span>'}
function txRow(t,deletable=false){
  const c=catInfo(t.category,t.type);
  const actions=deletable?UIc.button({label:t.conflict?'Xử lý xung đột':'Sửa giao dịch',variant:'ghost',iconName:'edit',iconOnly:true,cls:'tx-edit',attrs:{'data-edit-id':t.id}})+UIc.button({label:'Xóa giao dịch',variant:'ghost',iconName:'trash',iconOnly:true,cls:'tx-delete',attrs:{'data-delete-id':t.id}}):'';
  return UIc.transactionRow({id:t.id,iconName:c[2],title:t.note||c[1],meta:`${c[1]} · ${t.person||'Gia đình'} · ${formatDate(t.date)}`,amount:t.amount,type:t.type,status:txStatus(t),actionsHtml:actions,conflict:!!t.conflict});
}
function formatDate(s){const d=new Date(s+'T12:00:00');return new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit'}).format(d)}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function historyDayGroups(rows,today){
  const groups=new Map([[today,[]]]);
  [...rows].sort(sortTx).forEach(t=>{const day=String(t.date||'').slice(0,10);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(t)});
  const days=[today,...[...groups.keys()].filter(day=>day!==today).sort((a,b)=>b.localeCompare(a))];
  return days.map(day=>({day,rows:groups.get(day)}));
}
const txFilters={month:'',category:'',person:''};
function syncFilterOptions(){
  const sel=(id,options,label)=>{const el=$(id),cur=el.value;el.innerHTML=`<option value="">${label}</option>`+options.map(([v,t])=>`<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join('');el.value=options.some(([v])=>v===cur)?cur:'';};
  const months=[...new Set(transactions.map(t=>String(t.date).slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort().reverse();
  sel('#txMonthFilter',months.map(m=>[m,UIfmt.monthLabel(m)]),'Tất cả tháng');
  sel('#txCategoryFilter',[...EXPENSE_CATS,...INCOME_CATS].map(c=>[c[0],c[1]+(INCOME_CATS.includes(c)?' (thu)':'')]),'Tất cả danh mục');
  sel('#txPersonFilter',[...new Set(transactions.map(t=>t.person||'Gia đình'))].sort().map(p=>[p,p]),'Tất cả người nhập');
}
function renderHistory(){
  syncFilterOptions();
  Object.assign(txFilters,{month:$('#txMonthFilter').value,category:$('#txCategoryFilter').value,person:$('#txPersonFilter').value});
  const today=dateISO(),query=searchTokens($('#historySearch').value);
  const filtered=!!(query.length||historyFilter!=='All'||txFilters.month||txFilters.category||txFilters.person);
  // Presentation-only filtering; the underlying records are never modified.
  const rows=transactions.filter(t=>(historyFilter==='All'||t.type===historyFilter)&&(!txFilters.month||String(t.date).startsWith(txFilters.month))&&(!txFilters.category||t.category===txFilters.category)&&(!txFilters.person||(t.person||'Gia đình')===txFilters.person)&&matchesHistory(t,query));
  const active=[['month',txFilters.month&&'Tháng '+UIfmt.monthLabel(txFilters.month)],['category',txFilters.category&&catInfo(txFilters.category)[1]],['person',txFilters.person]].filter(([,v])=>v);
  $('#txFilterCount').textContent=active.length||'';
  $('#txActiveFilters').innerHTML=active.map(([k,v])=>`<button type="button" class="chip" data-clear-filter="${k}" aria-label="Bỏ lọc ${escapeHtml(v)}">${escapeHtml(v)} ×</button>`).join('');
  $('#historyMatches').hidden=!filtered;$('#historyMatches').textContent=rows.length?rows.length+' giao dịch phù hợp':'Không tìm thấy giao dịch phù hợp.';
  const showToday=!filtered;
  const groups=historyDayGroups(rows,today).filter(g=>g.rows.length||(showToday&&g.day===today));
  $('#historyList').innerHTML=transactions.length&&(rows.length||showToday)?groups.map(({day,rows},i)=>{
    const label=day===today?'Hôm nay · '+day.split('-').reverse().join('/'):/^\d{4}-\d{2}-\d{2}$/.test(day)?day.split('-').reverse().join('/'):'Chưa có ngày';
    const daily=rows.reduce((total,t)=>{if(t.type==='Expense')total.expense+=Number(t.amount)||0;if(t.type==='Income')total.income+=Number(t.amount)||0;return total},{expense:0,income:0});
    const summary=`<span class="tx-day-totals">${historyFilter!=='Income'?`<span>Chi ${UIc.money(daily.expense,{semantic:'expense'})}</span>`:''}${historyFilter!=='Expense'?`<span>Thu ${UIc.money(daily.income,{semantic:'income'})}</span>`:''}</span>`;
    return `<section class="tx-day" aria-labelledby="historyDay-${i}"><div class="tx-day-head"><h3 id="historyDay-${i}">${escapeHtml(label)}</h3>${summary}</div><div class="tx-list">${rows.length?rows.map(t=>txRow(t,true)).join(''):'<p class="tx-day-empty">Chưa có giao dịch hôm nay.</p>'}</div></section>`;
  }).join(''):'';
  const empty=!transactions.length?UIc.emptyState({title:'Chưa có giao dịch',text:'Khoản thu chi bạn ghi sẽ xuất hiện tại đây.',actionHtml:UIc.button({label:'Thêm giao dịch',variant:'primary',iconName:'plus',attrs:{'data-open-entry':'Expense'}})}):!rows.length?UIc.emptyState({kind:'filtered',title:'Không có giao dịch phù hợp',text:'Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.',actionHtml:UIc.button({label:'Xóa bộ lọc',variant:'secondary',attrs:{'data-clear-filter':'all'}})}):'';
  $('#historyEmpty').innerHTML=empty;$('#historyEmpty').hidden=!empty;
}

function renderBudgets(){
  const mk=monthKey(activeMonth),scoped=limitsAt(budgets,mk);$('#budgetMonthLabel').textContent='Áp dụng từ '+mk.split('-').reverse().join('/')+' trở đi';
  $('#budgetSyncStatus').textContent=budgetState.pending?(budgetState.remote?'Có xung đột, chọn bản muốn dùng bên dưới.':'Đã lưu trên máy · Chờ đồng bộ Google Sheets'):budgetState.revision?'Ngân sách đã đồng bộ Google Sheets':'Ngân sách chưa được đồng bộ';
  $('#budgetConflict').hidden=!budgetState.remote;
  const spent=FC.categoryTotals(transactions,mk),eff=effectiveBudgets(),debt=homeLoanSummary(mk),fmt=v=>new Intl.NumberFormat('vi-VN').format(v);
  const row=(id,label,icon,inputHtml,limit,note='',provisional=false)=>`<div class="budget-row"><div class="budget-row-head">${FFUI.icon(icon)}<label for="budget-${id}">${escapeHtml(label)}</label></div>${inputHtml}${UIc.budgetProgress({label:'Đã chi tháng này',spent:spent[id]||0,limit,level:budgetLevel(spent[id]||0,Number(limit||0)),provisional})}${note?`<p class="budget-note">${note}</p>`:''}</div>`;
  const rows=EXPENSE_CATS.filter(c=>c[0]!=='loan-payment').map(c=>row(c[0],c[1],c[2],`<input id="budget-${c[0]}" data-budget="${c[0]}" inputmode="numeric" value="${fmt(scoped[c[0]]||0)}" aria-label="Ngân sách ${escapeHtml(c[1])}" />`,eff[c[0]]===undefined?null:Number(eff[c[0]])));
  const autoDebt=debt.total,manualDebt=Object.prototype.hasOwnProperty.call(scoped,'loan-payment');
  rows.push(row('loan-payment','Trả nợ','cat-loan-payment',`<input id="budget-loan-payment" data-budget="loan-payment" inputmode="numeric" value="${manualDebt?fmt(scoped['loan-payment']):''}" placeholder="${fmt(autoDebt)}" aria-label="Ngân sách Trả nợ; để trống dùng mức tự động" />`,eff['loan-payment'],'Để trống sẽ dùng lịch ngân hàng và khoản bổ sung riêng trong Sheets của tháng đang xem.',!manualDebt&&debt.missing));
  $('#budgetEditor').innerHTML=rows.join('');
  $$('[data-budget]').forEach(i=>i.addEventListener('input',()=>{i.value=i.dataset.budget==='loan-payment'&&i.value.trim()===''?'':new Intl.NumberFormat('vi-VN').format(parseDigits(i.value))}));
  // Summary uses the same totals as the dashboard (effective limits incl. scheduled loan budget).
  const total=Object.values(eff).reduce((a,b)=>a+(Number(b)||0),0),used=Object.values(spent).reduce((a,b)=>a+b,0),left=total-used;
  const ratio=total?used/total:null,pct=ratio===null?'—':hideAmounts?'••%':Math.round(ratio*100)+'%';
  const figure=(label,valueHtml,help)=>`<div class="gauge-figure"><span class="gf-label">${label}</span><span class="gf-value">${valueHtml}</span><span class="gf-help">${help}</span></div>`;
  $('#budgetSummary').innerHTML=FFUI.chart.gauge({ratio,level:total?budgetLevel(used,total):'unset',caption:total?`Đã dùng ${pct} ngân sách tháng: ${money(used)} trên ${money(total)}`:'Chưa đặt ngân sách tháng',centerHtml:`<span class="gauge-pct">${pct}</span><span class="gauge-caption">${total?(left<0?'Đã vượt ngân sách':'Đã dùng ngân sách'):'Chưa đặt ngân sách'}</span>`})
    +`<div class="budget-gauge-figures">${figure('Tổng hạn mức',total?UIc.money(total):'<span class="muted">Chưa đặt</span>',!manualDebt&&debt.missing?'<span class="unknown">Trả nợ tạm tính</span>':'Gồm ngân sách trả nợ')+figure('Đã chi',UIc.money(used,{semantic:'expense'}),'Khoản chi đã ghi')+figure(left<0?'Vượt ngân sách':'Còn lại',total?UIc.money(Math.abs(left),{semantic:left<0?'expense':null}):'—','Hạn mức − đã chi')}</div>`;
}
function parseDigits(v){return FM.parseDigits(v)}
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
function sameTransactionValues(a,b){return FFSync.engine.sameTransactionValues(a,b)}
function mergeSheetTransactions(remote,local){return FFSync.engine.mergeSheetTransactions(remote,local)}
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
  $$('.type-switch button').forEach(b=>{b.classList.toggle('active',b.dataset.type===entryType);b.setAttribute('aria-pressed',String(b.dataset.type===entryType))});const cats=exp?EXPENSE_CATS:INCOME_CATS;
  const holder=$('#repeatChoices');holder.replaceChildren();if(exp&&!editingTransactionId){
   const seen=new Set();for(const t of [...transactions].filter(t=>t.type==='Expense').sort(sortTx)){const k=JSON.stringify([t.category,t.note,t.amount]);if(seen.has(k))continue;seen.add(k);const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=(t.note||catInfo(t.category)[1])+' · '+money(t.amount);b.onclick=()=>{selectedCategory=t.category;$('#amountInput').value=Number(t.amount).toLocaleString('vi-VN');$('#noteInput').value=t.note||'';renderEntry()};holder.append(b);if(seen.size===3)break;}
  }
  $('#categoryPicker').innerHTML=cats.map(c=>`<button type="button" class="category-choice ${selectedCategory===c[0]?'active':''}" data-category="${c[0]}" aria-pressed="${selectedCategory===c[0]}">${FFUI.icon(c[2])}<span>${escapeHtml(c[1])}</span></button>`).join('');
  $$('[data-category]').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.category;renderEntry()});
}
function openOverlay(sel,trigger){FFUI.overlay.open($(sel),trigger)}
function closeOverlay(sel){FFUI.overlay.close($(sel))}
async function saveTransaction(input){
  write('lastPerson',input.person||'Gia đình');
  if(input.id&&transactions.some(t=>t.id===input.id))return transactions.find(t=>t.id===input.id);
  const tx={id:input.id||(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)),timestamp:new Date().toISOString(),date:input.date||dateISO(),type:input.type||'Expense',amount:Number(input.amount),category:input.category,person:input.person||'Gia đình',note:input.note||'',synced:false};
  transactions.push(tx);write(STORE.tx,transactions);render();
  if(endpoint()){
    try{await pushToSheet(tx);await syncWithSheet(true);const saved=transactions.find(t=>t.id===tx.id);showToast(saved?.synced?'Đã lưu và đồng bộ Google Sheets':'Đã lưu · Đang chờ xác nhận đồng bộ')}catch{showToast('Đã lưu trên điện thoại · Chưa thể đồng bộ')}
  }else showToast('Đã lưu trên điện thoại');
  return tx;
}
async function pushToSheet(tx,action='create'){try{return await nativeRequest({...tx,action:'v3_'+action,amount:String(tx.amount||'')});}catch(e){if(e.payload?.code==='TX_CONFLICT'){tx.conflict={remote:e.payload.remote?sheetRecord(e.payload.remote):null};write(STORE.tx,transactions);render();showToast('Xung đột giao dịch · Mở Lịch sử để chọn bản dùng')}throw e;}}
function sheetDate(value){return FFSync.engine.sheetDate(value)}
function sheetRecord(row){return FFSync.engine.sheetRecord(row)}
async function requestSheetSnapshot(includeMetadata=false){const data=await nativeRequest({action:'snapshot'});if(data.apiVersion!==3||data.webVersion!==1)throw new Error('Cần triển khai apps-script/Code.gs của bản GitHub Pages.');return includeMetadata?data:data.transactions;}
function persistBudgetState(){write(STORE.budget,budgets);write('family_budget_sync_v2',budgetState);}
function sameBudgets(a,b){return FFSync.engine.sameBudgets(a,b)}
async function mergeRemoteBudget(remote){
  if(!remote||!remote.values||!remote.revision)throw new Error('Máy chủ chưa hỗ trợ đồng bộ ngân sách. Hãy cập nhật Code.gs.');
  const pending=budgetState.pending,decision=FFSync.engine.budgetDecision(budgetState,remote);
  if(decision==='adopt'){budgets={...remote.values};budgetState={revision:remote.revision,pending:null,remote:null};persistBudgetState();return;}
  if(decision==='conflict'){budgetState.remote=remote;persistBudgetState();return;}
  try{const saved=await nativeRequest({action:'save_budgets',values:JSON.stringify(pending.values),revision:pending.baseRevision});budgets={...saved.budgets.values};budgetState={revision:saved.budgets.revision,pending:null,remote:null};persistBudgetState();}
  catch(error){if(error.payload?.code==='BUDGET_CONFLICT'){budgetState.remote=error.payload.budgets;persistBudgetState();}else throw error;}
}
async function syncWithSheet(quiet=false){
  if(syncFlight)return syncFlight;
  syncFlight=(async()=>{
    $('#syncNowBtn')?.classList.add('syncing');renderHeader();
    try{
      const snapshot=await requestSheetSnapshot(true);if(snapshot.loans){Object.assign(LOAN_SCHEDULE,snapshot.loans);write('loans',snapshot.loans)}const remote=snapshot.transactions.map(sheetRecord).filter(t=>t.id&&!pendingDeletes.includes(t.id));
      transactions=mergeSheetTransactions(remote,transactions).filter(t=>!pendingDeletes.includes(t.id));write(STORE.tx,transactions);
      await mergeRemoteBudget(snapshot.budgets);
      try{await extStore.sync()}catch(error){console.warn('ext sync',error.message)}
      lastSyncError=extStore.state().lastError;lastSyncOk=!queued()&&!budgetState.remote&&!lastSyncError;if(lastSyncOk){lastVerified=Date.now();write('lastVerifiedV3',lastVerified)}render();
      if(!quiet)showToast(budgetState.remote?'Ngân sách có xung đột · Mở Ngân sách để chọn bản dùng':queued()?'Còn thay đổi chưa đồng bộ':'Đã đồng bộ Google Sheets');return lastSyncOk;
    }catch(error){lastSyncOk=false;lastSyncError=error.message||'Không thể đồng bộ';renderHeader();renderBudgets();if(!quiet)showToast(error.message||'Chưa thể đồng bộ');return false;}
    finally{$('#syncNowBtn')?.classList.remove('syncing');}
  })();
  try{return await syncFlight;}finally{syncFlight=null;renderHeader();}
}
async function retryUnsynced(){
  if(!endpoint())return;
  // Acknowledged operations are removed one by one; the first failure stops the batch and keeps the rest.
  for(const id of [...pendingDeletes]){try{await pushToSheet({id},'delete');pendingDeletes=pendingDeletes.filter(item=>item!==id);write('family_deleted_v2',pendingDeletes);}catch(error){if(!error.payload)lastSyncError=error.message;break;}}
  const pending=transactions.filter(t=>!t.synced&&!t.conflict&&!pendingDeletes.includes(t.id));for(const tx of pending){try{await pushToSheet(tx,tx.pendingUpdate?'update':'create');}catch(error){if(!error.payload)lastSyncError=error.message;break;}}
  await syncWithSheet(true);
}
async function deleteTransaction(id){
  const tx=transactions.find(t=>t.id===id);if(!tx||!confirm(`Xóa giao dịch “${tx.note||catInfo(tx.category,tx.type)[1]}” trị giá ${money(tx.amount)}?`))return;
  pendingDeletes=[...new Set([...pendingDeletes,id])];write('family_deleted_v2',pendingDeletes);transactions=transactions.filter(t=>t.id!==id);write(STORE.tx,transactions);render();
  await retryUnsynced();showToast(pendingDeletes.includes(id)?'Đã xóa trên máy · Chờ đồng bộ':'Đã xóa và đồng bộ Google Sheets');
}
// Hash routes (#/giao-dich …) give deep links and browser back; see src/ui/shell.js.
const PRIMARY_PAGES=['home','history','budget','assets'];
function nav(name,{fromRoute=false,focus=!fromRoute}={}){
  if(name==='more'){openOverlay('#moreOverlay');return;}
  name=FFUI.shell.resolve(name);if(!name)return;
  const next=$(`#${name}View`),current=$('.view.active');if(!next)return;
  closeOverlay('#moreOverlay');
  if(!fromRoute&&location.hash!==FFUI.shell.hashFor(name))history.pushState(null,'',FFUI.shell.hashFor(name));
  FFUI.shell.markActive(name);
  if(next===current)return;
  const direction=PRIMARY_PAGES.indexOf(name)>PRIMARY_PAGES.indexOf(current?.id.replace(/View$/,''))?1:-1;
  if(name==='budget')renderBudgets();
  $$('.view').forEach(v=>{v.getAnimations?.().forEach(a=>a.cancel());v.style.transform='';v.style.willChange='';v.classList.toggle('active',v===next)});
  scrollTo({top:0,behavior:'instant'});
  if(focus)next.querySelector('.page-title')?.focus({preventScroll:true});
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)next.animate?.([{transform:`translateX(${direction*12}px)`,opacity:.9},{transform:'translateX(0)',opacity:1}],{duration:140,easing:'ease-out'});
}
window.addEventListener('popstate',()=>nav(FFUI.shell.routeFromHash(),{fromRoute:true}));
window.addEventListener('hashchange',()=>nav(FFUI.shell.routeFromHash(),{fromRoute:true}));
function openSettings(){$('#endpointInput').value=nativeConfig.endpoint;$('#familyTokenInput').value='';$('#familyTokenInput').placeholder=nativeConfig.hasToken?'Đã lưu mã · Để trống để giữ nguyên':'Nhập FAMILY_ACCESS_TOKEN';nav('settings')}
// Delegated so controls rendered later (empty states, cards) work too.
document.addEventListener('click',e=>{
  const add=e.target.closest('[data-open-entry]');if(add){e.preventDefault();openEntry(add.dataset.openEntry);return;}
  const link=e.target.closest('[data-nav]');if(link){e.preventDefault();nav(link.dataset.nav);}
});
$('#settingsBtn').onclick=openSettings;
$('#assistantBtn').onclick=()=>nav('ai');
$$('[data-close="entry"]').forEach(b=>b.onclick=()=>closeOverlay('#entryOverlay'));
// Backdrop click closes only dialogs without unsaved input (data-unsafe-close needs Cancel/×).
$$('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o&&!o.hasAttribute('data-unsafe-close'))closeOverlay('#'+o.id)}));
$('#historyList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-id]');if(edit)return editIncome(edit.dataset.editId);const button=e.target.closest('[data-delete-id]');if(button)deleteTransaction(button.dataset.deleteId)});
$('#syncPill').onclick=()=>{if(budgetState.remote)nav('budget');else if(transactions.some(t=>t.conflict))nav('history');else $('#syncNowBtn').click()};
$('#syncNowBtn').onclick=async()=>{await retryUnsynced();await syncWithSheet(false)};
$$('.type-switch button').forEach(b=>b.onclick=()=>{entryType=b.dataset.type;selectedCategory=(entryType==='Expense'?EXPENSE_CATS:INCOME_CATS)[0][0];renderEntry()});
$('#amountInput').addEventListener('input',e=>{e.target.value=parseDigits(e.target.value)?new Intl.NumberFormat('vi-VN').format(parseDigits(e.target.value)):''});
$('#entryForm').addEventListener('submit',async e=>{e.preventDefault();const amount=parseDigits($('#amountInput').value);if(!amount)return showToast('Vui lòng nhập số tiền');$('#submitEntry').disabled=true;closeOverlay('#entryOverlay');const input={type:entryType,amount,category:selectedCategory,person:$('#personInput').value,date:$('#dateInput').value,note:$('#noteInput').value.trim()};if(editingTransactionId)await updateIncome(editingTransactionId,input);else await saveTransaction(input);editingTransactionId=null;$('#submitEntry').disabled=false});
$$('[data-period-step]').forEach(b=>b.onclick=()=>{activeMonth=new Date(activeMonth.getFullYear(),activeMonth.getMonth()+Number(b.dataset.periodStep),1);render()});
$('#historySearch').addEventListener('input',renderHistory);
$$('[data-filter]').forEach(b=>b.onclick=()=>{historyFilter=b.dataset.filter;$$('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});renderHistory()});
['#txMonthFilter','#txCategoryFilter','#txPersonFilter'].forEach(id=>$(id).addEventListener('change',()=>{if(!FFUI.overlay.isOpen())renderHistory()}));
// Mobile: the same filter fields move into a bottom sheet with Apply / Reset.
function closeTxFilters(){$('.filter-bar').insertBefore($('#txFilterFields'),$('#txFilterToggle').nextSibling);closeOverlay('#txFilterOverlay')}
$('#txFilterToggle').onclick=()=>{$('#txFilterSlot').append($('#txFilterFields'));openOverlay('#txFilterOverlay',$('#txFilterToggle'))};
$('#txFilterApply').onclick=()=>{closeTxFilters();renderHistory()};
$('#txFilterClose').onclick=()=>{closeTxFilters();renderHistory()};
$('#txFilterReset').onclick=()=>{['#txMonthFilter','#txCategoryFilter','#txPersonFilter'].forEach(id=>$(id).value='')};
$('#txFilterOverlay').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeTxFilters();renderHistory()}});
document.addEventListener('click',e=>{const c=e.target.closest('[data-clear-filter]');if(!c)return;const k=c.dataset.clearFilter;if(k==='all'){['#txMonthFilter','#txCategoryFilter','#txPersonFilter'].forEach(id=>$(id).value='');$('#historySearch').value='';historyFilter='All';$$('[data-filter]').forEach(x=>{x.classList.toggle('active',x.dataset.filter==='All');x.setAttribute('aria-pressed',String(x.dataset.filter==='All'))});}else $({month:'#txMonthFilter',category:'#txCategoryFilter',person:'#txPersonFilter'}[k]).value='';renderHistory()});
$('#saveBudgetBtn').onclick=async()=>{
  if(syncFlight){showToast('Đang đồng bộ, vui lòng đợi rồi lưu lại.');return;}
  const values={};$$('[data-budget]').forEach(i=>{if(i.dataset.budget==='loan-payment'&&i.value.trim()==='')return;values[i.dataset.budget]=parseDigits(i.value);});
  budgets=FB.applyMonthEdits(budgets,monthKey(activeMonth),values,EXPENSE_CATS.map(c=>c[0]));budgetState.pending={values:{...budgets},baseRevision:budgetState.pending?budgetState.pending.baseRevision:budgetState.revision};persistBudgetState();render();
  $('#saveBudgetBtn').disabled=true;try{if(endpoint())await syncWithSheet(false);showToast(budgetState.pending?'Đã lưu trên máy · Chưa ghi lên Sheets':'Đã lưu ngân sách vào Google Sheets');}finally{$('#saveBudgetBtn').disabled=false;}
};
$('#useRemoteBudget').onclick=()=>{const remote=budgetState.remote;if(!remote)return;budgets={...remote.values};budgetState={revision:remote.revision,pending:null,remote:null};persistBudgetState();render();};
$('#useLocalBudget').onclick=async()=>{if(!budgetState.remote||!budgetState.pending)return;if(!confirm('Ghi ngân sách trên điện thoại này thay cho bản đang có trên Google Sheets?'))return;budgetState.pending.baseRevision=budgetState.remote.revision;budgetState.remote=null;persistBudgetState();await syncWithSheet(false);};
$('#saveEndpointBtn').onclick=async()=>{
  const url=$('#endpointInput').value.trim(),token=$('#familyTokenInput').value.trim();
  if(url!==nativeConfig.endpoint&&(transactions.some(t=>!t.synced)||pendingDeletes.length||budgetState.pending||extStore.operations().length))return showToast('Còn dữ liệu chưa đồng bộ. Hãy hoàn tất trước khi đổi spreadsheet.');
  const result=JSON.parse(FamilyNative.configure(url,token,$('#rememberConnection').checked));if(!result.ok)return showToast(result.error);
  if(url!==nativeConfig.endpoint){extStore.clear();transactions=[];budgets={};Object.assign(LOAN_SCHEDULE,{records:[],extraDebt:0});write('loans',LOAN_SCHEDULE);lastVerified=null;write('lastVerifiedV3',null);budgetState={revision:null,pending:null,remote:null};write(STORE.tx,transactions);persistBudgetState();}
  nativeConfig=JSON.parse(FamilyNative.getConfig());$('#familyTokenInput').value='';render();await retryUnsynced();if(lastSyncOk){showToast('Đã kết nối Google Sheets');nav('home');}else {openSettings();showToast('Chưa kết nối được. Bấm Đồng bộ ở Lịch sử để xem lỗi.');}
};
$('#clearDataBtn').onclick=()=>{if(typeof offerBackupBeforeReset==='function')offerBackupBeforeReset();if(!confirm('Xóa bản lưu trên điện thoại, gồm các thay đổi chưa đồng bộ? Dữ liệu trên Google Sheets vẫn được giữ.'))return;extStore.clear();transactions=[];budgets={};pendingDeletes=[];budgetState={revision:null,pending:null,remote:null};write(STORE.tx,transactions);write('family_deleted_v2',pendingDeletes);persistBudgetState();render();};
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
  if(!endpoint()){openSettings();return;}
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
window.addEventListener('online',()=>{renderHeader();if(endpoint())retryUnsynced();});
window.addEventListener('offline',()=>{renderHeader();if(typeof renderFinanceViews==='function')renderFinanceViews();});
render();
// Initial route from the URL hash (deep link); first run without a connection opens Settings.
nav(FFUI.shell.routeFromHash(),{fromRoute:true,focus:false});
if(endpoint())retryUnsynced();else openSettings();

// Swipe navigation only on the page surface, leaving nested controls alone.
function swipeDestination(page,dx,dy,elapsed){
  const pages=PRIMARY_PAGES; // bottom-nav order
  const distance=Math.abs(dx),quick=elapsed>0&&elapsed<=250&&distance/elapsed>=.35;
  if(elapsed>1200||distance<(quick?28:48)||distance<Math.abs(dy)*1.6)return null;
  const index=pages.indexOf(page),next=index+(dx<0?1:-1);
  return index>=0&&next>=0&&next<pages.length?pages[next]:null;
}
(function enablePageSwipes(){
  const surface=$('main');let gesture=null,ignoreClickUntil=0,frame=0;
  const reset=()=>{if(frame)cancelAnimationFrame(frame);frame=0;if(gesture){gesture.view.style.transform='';gesture.view.style.willChange='';}gesture=null;};
  const blocked=target=>{
    // Swipes only on phones/tablets (no sidebar) and never over controls, charts or scrollable tables.
    if(innerWidth>=1024||$('.overlay.open')||target.closest('input,textarea,select,button,a,[contenteditable="true"],svg,.chart-scroll,.table-wrap,.subnav'))return true;
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
