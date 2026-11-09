'use strict';
const CONNECTION_KEY='ffpages:connection';
function connection(){try{return JSON.parse(sessionStorage.getItem(CONNECTION_KEY)||localStorage.getItem(CONNECTION_KEY)||'{}')}catch{return {}}}
function config(){const c=connection();return {endpoint:c.endpoint||'',hasToken:!!c.token}}
function validEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password}catch{return false}}
const FamilyNative={
 getConfig:()=>JSON.stringify(config()),
 configure(url,token,remember=false){
  if(!validEndpoint(url))return JSON.stringify({ok:false,error:'URL phải có dạng https://script.google.com/macros/s/…/exec'});
  const previous=connection();token=token||(previous.endpoint===url?previous.token:'');
  if(!token||token.length<24)return JSON.stringify({ok:false,error:'Mã kết nối cần ít nhất 24 ký tự.'});
  try{const value=JSON.stringify({endpoint:url,token});sessionStorage.setItem(CONNECTION_KEY,value);if(remember)localStorage.setItem(CONNECTION_KEY,value);else localStorage.removeItem(CONNECTION_KEY);return '{"ok":true}'}catch{return JSON.stringify({ok:false,error:'Trình duyệt không cho lưu cấu hình. Hãy bật lưu trữ cho trang này.'})}
 }
};
let nativeConfig=config();
async function nativeRequest(values){
 const c=connection();if(!validEndpoint(c.endpoint)||!c.token)throw new Error('Nhập URL Apps Script và mã kết nối trong Cài đặt.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),110000);
 try{
  const body=new URLSearchParams();for(const [key,value] of Object.entries({...values,nativeVersion:3,webVersion:1,token:c.token}))body.set(key,String(value));
  const response=await fetch(c.endpoint,{method:'POST',body,credentials:'omit',redirect:'follow',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal});
  if(!response.ok)throw new Error('Google Sheets HTTP '+response.status);
  let data;try{data=await response.json()}catch{throw new Error('Web App chưa trả JSON. Kiểm tra quyền Anyone và deployment Code.gs mới.')}
  if(!data.ok){const error=new Error(data.error||'Không thể đồng bộ');error.payload=data;throw error}return data;
 }catch(e){if(e.name==='AbortError')throw new Error('Hết thời gian chờ; bản nháp được giữ để thử lại.');if(e instanceof TypeError)throw new Error('Không kết nối được Apps Script. Kiểm tra mạng, URL /exec, quyền Anyone và deployment mới. Bản nháp vẫn trên máy.');throw e}
 finally{clearTimeout(timer)}
}
