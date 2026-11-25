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
// Served by the family's own server: the same-origin /api endpoint is the default and only other valid URL.
{const self=vm.createContext({URL,URLSearchParams,AbortController,setTimeout,clearTimeout,localStorage:storage(),sessionStorage:storage(),location:new URL('https://family.example/')});
vm.runInContext(read('web-bridge.js')+';globalThis.bridge=FamilyNative',self);
assert.equal(JSON.parse(self.bridge.getConfig()).endpoint,'https://family.example/api');
assert.equal(JSON.parse(self.bridge.configure('https://evil.example/api','test-token-1234567890123456')).ok,false);
assert.equal(JSON.parse(self.bridge.configure('','test-token-1234567890123456')).ok,true);
assert.equal(JSON.parse(self.sessionStorage.getItem('ffpages:connection')).endpoint,'https://family.example/api');
assert.equal(JSON.parse(self.bridge.configure(url,'test-token-1234567890123456')).ok,true);
const plain=vm.createContext({URL,URLSearchParams,localStorage:storage(),sessionStorage:storage(),location:new URL('http://192.168.1.5:8080/')});
vm.runInContext(read('web-bridge.js')+';globalThis.bridge=FamilyNative',plain);
assert.equal(JSON.parse(plain.bridge.getConfig()).endpoint,'','no token over plain HTTP except localhost');
const pages=vm.createContext({URL,URLSearchParams,localStorage:storage(),sessionStorage:storage(),location:new URL('https://haiprobmt.github.io/family-finance/')});
vm.runInContext(read('web-bridge.js')+';globalThis.bridge=FamilyNative',pages);
assert.equal(JSON.parse(pages.bridge.getConfig()).endpoint,'');}
const html=read('index.html');assert(html.includes('manifest.webmanifest'));assert(!html.includes('family-photo'));
const loans=read('loans-data.js');assert(loans.includes('records:[]'));assert(loans.includes('extraDebt:0'));
for(const file of fs.readdirSync(docs)){assert(!/family-photo|\.apk$|\.p12$|password/.test(file));if(/\.(js|html|css)$/.test(file)){const s=read(file);assert(!/AKfy[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,}|lethuyan|hainguyendl93/.test(s),file);}}
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){const ref=m[1];if(!ref.includes('://'))assert(fs.existsSync(path.join(docs,ref)),ref);}
const manifest=JSON.parse(read('manifest.webmanifest'));assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
const sw=read('sw.js');assert(sw.includes("event.request.method!=='GET'"));assert(sw.includes('!urls.has(event.request.url)'));
// 3.0: service-worker allowlist == every local asset referenced by the page, CSS and manifest; nothing else.
const swFiles=vm.runInNewContext(sw.match(/const FILES=(\[[\s\S]*?\]);/)[1]);
const needed=new Set(['./','index.html']);for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g))if(!m[1].includes('://'))needed.add(m[1]);
for(const dir of ['','styles/'])if(fs.existsSync(path.join(docs,dir)))for(const f of fs.readdirSync(path.join(docs,dir)).filter(f=>f.endsWith('.css')))for(const m of read(dir+f).matchAll(/url\("?([^")]+)"?\)/g))if(!m[1].startsWith('data:'))needed.add(path.posix.normalize(dir+m[1]));
for(const i of manifest.icons)needed.add(i.src);
assert.deepEqual([...swFiles].sort(),[...needed].sort(),'sw.js FILES must match referenced assets');
for(const f of swFiles)if(f!=='./')assert(fs.existsSync(path.join(docs,f)),f);
assert(!/script\.google|exec|api\.deepseek/.test(swFiles.join(' ')),'no API URLs cached');
// 3.0: scan nested source folders for secrets/private markers too.
(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(js|html|css|json)$/.test(e.name)){const s=fs.readFileSync(p,'utf8');assert(!/AKfy[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,}|lethuyan|hainguyendl93/.test(s),p);}}})(path.join(docs,'src'));
ctx.nativeRequest({action:'snapshot'}).then(()=>console.log('PASS privacy, asset paths, manifest, session-only default, HTTPS endpoint validation, authenticated POST, cache boundary, sw allowlist')).catch(e=>{console.error(e);process.exitCode=1});
