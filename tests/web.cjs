const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..'),docs=path.join(root,'docs');
const read=f=>fs.readFileSync(path.join(docs,f),'utf8');
function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const ctx=vm.createContext({URL,URLSearchParams,AbortController,setTimeout,clearTimeout,localStorage:storage(),sessionStorage:storage(),fetch:async(url,options)=>{assert(!url.includes('test-token'));assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.body.get('nativeVersion'),'3');assert.equal(options.body.get('token'),'test-token-1234567890123456');return {ok:true,json:async()=>({ok:true,apiVersion:3})}}});
vm.runInContext(read('web-bridge.js')+';globalThis.bridge=FamilyNative',ctx);
const url='https://script.google.com/macros/s/TEST_ONLY/exec';
assert.equal(JSON.parse(ctx.bridge.configure('https://evil.example/exec','test-token-1234567890123456')).ok,false);
assert.equal(JSON.parse(ctx.bridge.configure(url,'test-token-1234567890123456')).ok,true);
assert.equal(ctx.localStorage.getItem('ffpages:connection'),null);
assert.equal(JSON.parse(ctx.bridge.configure(url,'',true)).ok,true);
assert(ctx.localStorage.getItem('ffpages:connection'));
assert.equal(JSON.parse(ctx.bridge.configure('https://script.google.com/macros/s/OTHER/exec','')).ok,false);
const html=read('index.html');assert(html.includes('manifest.webmanifest'));assert(!html.includes('family-photo'));
const loans=read('loans-data.js');assert(loans.includes('records:[]'));assert(loans.includes('extraDebt:0'));
for(const file of fs.readdirSync(docs)){assert(!/family-photo|\.apk$|\.p12$|password/.test(file));if(/\.(js|html|css)$/.test(file)){const s=read(file);assert(!/AKfy[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,}|lethuyan|hainguyendl93/.test(s),file);}}
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const ref=m[1];if(!ref.includes('://'))assert(fs.existsSync(path.join(docs,ref)),ref);}
const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
const sw=read('sw.js');assert(sw.includes("event.request.method!=='GET'"));assert(sw.includes('!urls.has(event.request.url)'));
ctx.nativeRequest({action:'snapshot'}).then(()=>console.log('PASS privacy, asset paths, manifest, session-only default, HTTPS endpoint validation, authenticated POST, cache boundary')).catch(e=>{console.error(e);process.exitCode=1});
