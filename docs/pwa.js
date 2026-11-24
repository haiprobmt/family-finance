'use strict';
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js').catch(()=>showToast('Chưa bật được chế độ ngoại tuyến.'));
 // A new release activated in the background: reload when the user comes back to the app (or right
 // away if it is hidden), never while a dialog or form field is in use. Pending changes are stored
 // locally and re-sent after reload, so nothing is lost.
 const hadController=!!navigator.serviceWorker.controller;let updateReady=false;
 const reloadIfIdle=()=>{const a=document.activeElement;if(updateReady&&!document.querySelector('.overlay.open')&&!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))location.reload()};
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController)return;updateReady=true;if(document.visibilityState==='hidden')reloadIfIdle()});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reloadIfIdle()});
}
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
document.querySelector('#installAppBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else alert('Android: menu trình duyệt → Cài đặt ứng dụng / Thêm vào màn hình chính. iPhone: Safari → Chia sẻ → Thêm vào Màn hình chính.')};
document.querySelector('#disconnectBtn').onclick=()=>{
 if(typeof offerBackupBeforeReset==='function')offerBackupBeforeReset();
 if(queued()&&!confirm('Có thay đổi chưa đồng bộ. Đăng xuất sẽ xóa các bản nháp trên máy này. Tiếp tục?'))return;
 if(!confirm('Đăng xuất và xóa bản lưu trên trình duyệt này? Dữ liệu trên Sheets không thay đổi.'))return;
 for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.startsWith('ffpages:'))storage.removeItem(key);
 location.reload();
};
