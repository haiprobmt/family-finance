'use strict';
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>showToast('Chưa bật được chế độ ngoại tuyến.'));
let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
document.querySelector('#installAppBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else alert('Android: menu trình duyệt → Cài đặt ứng dụng / Thêm vào màn hình chính. iPhone: Safari → Chia sẻ → Thêm vào Màn hình chính.')};
document.querySelector('#disconnectBtn').onclick=()=>{
 if(queued()&&!confirm('Có thay đổi chưa đồng bộ. Đăng xuất sẽ xóa các bản nháp trên máy này. Tiếp tục?'))return;
 if(!confirm('Đăng xuất và xóa bản lưu trên trình duyệt này? Dữ liệu trên Sheets không thay đổi.'))return;
 for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage))if(key.startsWith('ffpages:'))storage.removeItem(key);
 location.reload();
};
