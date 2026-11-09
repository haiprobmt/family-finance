const iconPaths={
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
dashboard:'<path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7"/>',
history:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
budget:'<path d="M12 3v9h9M9 4a9 9 0 1 0 11 11"/><path d="M15 3a8 8 0 0 1 6 6h-6Z"/>',
assistant:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/>',
plus:'<path d="M12 5v14M5 12h14"/>'
};
function uiIcon(name){return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">'+iconPaths[name]+'</svg>'}
document.querySelectorAll('.nav-item[data-nav]').forEach(el=>{el.querySelector('span').innerHTML=uiIcon(el.dataset.nav)});
document.querySelector('#assistantBtn span').innerHTML=uiIcon('assistant');
document.querySelector('#settingsBtn span').innerHTML=uiIcon('settings');
document.querySelectorAll('.action-plus,.nav-add').forEach(el=>el.innerHTML=uiIcon('plus'));

