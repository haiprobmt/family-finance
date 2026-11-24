// Additive 3.0 collections: assets, asset valuations, recurring rules and debts.
// New actions only (ext_snapshot, ext_save); APK 2.3.0 never calls them and is unaffected.
// Sheets exist only after the owner runs migrationsApply() (Migrations.gs). Each collection
// is saved whole with a SHA-256 revision, mirroring the budget conflict model:
// a stale revision returns COLLECTION_CONFLICT with the current server copy.
const EXT_VERSION=1;
const EXT_COLLECTIONS={
  assets:{sheet:'Assets',max:500,
    fields:['id','type','name','currency','acquisitionDate','acquisitionValue','currentValue','valuationDate','ownershipShare','notes','status','disposalDate'],
    dates:['acquisitionDate','valuationDate','disposalDate'],optionalNumbers:['acquisitionValue','currentValue'],numbers:['ownershipShare'],lists:[],
    text:{id:100,type:20,name:120,currency:3,notes:500,status:10},
    defaults:{currency:'VND',notes:'',status:'active',disposalDate:'',acquisitionDate:'',acquisitionValue:'',currentValue:'',valuationDate:''},
    validate:v=>FFDomain.netWorth.validateAsset(v)},
  valuations:{sheet:'AssetValuations',max:5000,
    fields:['id','assetId','valuationDate','value','sourceType','note'],
    dates:['valuationDate'],optionalNumbers:[],numbers:['value'],lists:[],
    text:{id:120,assetId:100,sourceType:20,note:300},defaults:{note:''},
    validate:v=>FFDomain.netWorth.validateValuation(v)},
  recurring:{sheet:'RecurringRules',max:200,
    fields:['id','type','amount','category','person','note','cadence','interval','startDate','endDate','status','skipped'],
    dates:['startDate','endDate'],optionalNumbers:[],numbers:['amount','interval'],lists:['skipped'],
    text:{id:100,type:10,category:30,person:60,note:200,cadence:10,status:10},defaults:{person:'Gia đình',note:'',endDate:'',status:'active',skipped:[],interval:1},
    validate:v=>FFDomain.recurring.validateRule(v)},
  debts:{sheet:'Debts',max:200,
    fields:['id','type','name','currency','balance','balanceDate','startDate','status','paidDate','notes'],
    dates:['balanceDate','startDate','paidDate'],optionalNumbers:[],numbers:['balance'],lists:[],
    text:{id:100,type:20,name:120,currency:3,status:10,notes:500},
    defaults:{currency:'VND',startDate:'',status:'active',paidDate:'',notes:''},
    validate:v=>FFDomain.netWorth.validateDebt(v)}
};
function extHeaders(def){return def.fields.concat(['UpdatedAt']);}
// Canonical form used for validation, storage and revision hashing.
function extNormalize(def,input){
  const src=input&&typeof input==='object'&&!Array.isArray(input)?input:{},out={};
  for(const f of def.fields){
    let v=Object.prototype.hasOwnProperty.call(src,f)?src[f]:def.defaults[f];
    if(def.lists.includes(f))v=Array.isArray(v)?v.map(String).slice(0,500):[];
    else if(def.numbers.includes(f))v=v===''||v===null||v===undefined?NaN:Number(v);
    else if(def.optionalNumbers.includes(f))v=v===''||v===null||v===undefined?'':Number(v);
    else if(def.dates.includes(f))v=v===null||v===undefined?'':String(v);
    else v=String(v===null||v===undefined?'':v).slice(0,def.text[f]||200);
    out[f]=v;
  }
  return out;
}
function extRevision(values){return sha256Hex(JSON.stringify(values.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)));}
function extSheet(def){return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);}
function readCollection(name){
  const def=EXT_COLLECTIONS[name],sheet=extSheet(def);
  if(!sheet)return {available:false,values:[],revision:null};
  const rows=sheet.getDataRange().getValues(),headers=rows.shift()||[];
  if(extHeaders(def).some((h,i)=>headers[i]!==h))throw new Error('Sheet '+def.sheet+' có cấu trúc khác. Chưa đọc dữ liệu.');
  const values=rows.filter(r=>r[0]!==''&&r[0]!=null).map(r=>{
    const o={};def.fields.forEach((f,i)=>{let v=r[i];
      if(def.lists.includes(f))v=String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
      else if(def.dates.includes(f))v=v===''?'':formatSheetDate(v);
      else if(def.numbers.includes(f))v=Number(v);
      else if(def.optionalNumbers.includes(f))v=v===''?'':Number(v);
      else v=String(v);
      o[f]=v;});
    return o;}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return {available:true,values,revision:extRevision(values)};
}
function extSnapshot(){
  const collections={};for(const name of Object.keys(EXT_COLLECTIONS))collections[name]=readCollection(name);
  return {ok:true,extVersion:EXT_VERSION,schema:appliedMigrations(),collections};
}
function extSave(p){
  const name=String(p.collection||''),def=Object.prototype.hasOwnProperty.call(EXT_COLLECTIONS,name)?EXT_COLLECTIONS[name]:null;
  if(!def)throw new Error('Bộ dữ liệu không được hỗ trợ.');
  if(!extSheet(def))return {ok:false,code:'FEATURE_NOT_MIGRATED',error:'Chưa bật tính năng này trên Google Sheets (cần chạy migrationsApply).'};
  const raw=JSON.parse(p.values||'null');
  if(!Array.isArray(raw)||raw.length>def.max)throw new Error('Dữ liệu '+name+' không hợp lệ.');
  const next=raw.map(v=>extNormalize(def,v)),ids=new Set();
  for(const v of next){const errors=def.validate(v);if(errors.length)throw new Error('Dữ liệu không hợp lệ ('+String(v.id).slice(0,40)+'): '+errors.join(', '));if(ids.has(v.id))throw new Error('Trùng mã: '+String(v.id).slice(0,40));ids.add(v.id);}
  const current=readCollection(name);
  if(current.revision===extRevision(next))return {ok:true,collection:current};
  if(String(p.revision||'')!==current.revision)return {ok:false,code:'COLLECTION_CONFLICT',error:'Dữ liệu đã thay đổi ở thiết bị khác hoặc Google Sheets.',collection:current};
  const sheet=extSheet(def),now=new Date().toISOString();
  // Text is always written with a leading apostrophe so Sheets never re-types it.
  const rows=[extHeaders(def),...next.slice().sort((a,b)=>a.id<b.id?-1:1).map(v=>def.fields.map(f=>{
    const x=v[f];if(def.lists.includes(f))return "'"+x.join(',');if(def.dates.includes(f)||def.numbers.includes(f)||def.optionalNumbers.includes(f))return x;return "'"+x;}).concat([now]))];
  const width=extHeaders(def).length;while(rows.length<sheet.getLastRow())rows.push(new Array(width).fill(''));
  sheet.getRange(1,1,rows.length,width).setValues(rows);SpreadsheetApp.flush();
  return {ok:true,collection:readCollection(name)};
}
