const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
};

let _loadingTimer, _loadingCount = 0;
function loading(on) {
  const el = document.getElementById('loading');
  if (!el) return;
  _loadingCount += on ? 1 : -1;
  clearTimeout(_loadingTimer);
  if (_loadingCount > 0) _loadingTimer = setTimeout(() => { el.hidden = false; }, 300);
  else el.hidden = true;
}

async function api(action, data = {}, { quiet = false } = {}) {
  const url = window.API_URL || '';
  if (!/^(https:\/\/|http:\/\/localhost)/.test(url)) throw Object.assign(new Error('config.js에 서버(웹 앱) 주소가 아직 없습니다. README의 설치 방법을 따라 주세요.'), { code: 'CONFIG' });
  if (!quiet) loading(true);
  try {
    let res;
    try {
      res = await fetch(url, { method: 'POST', body: JSON.stringify({ action, ...data }) });
    } catch (e) {
      throw Object.assign(new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.'), { code: 'NETWORK' });
    }
    let j;
    try { j = await res.json(); } catch (e) { throw Object.assign(new Error('서버 응답을 읽지 못했어요. (웹 앱 배포 설정에서 액세스를 "모든 사용자"로 했는지 확인)'), { code: 'BADRESP' }); }
    if (!j.ok) throw Object.assign(new Error(j.message || j.error), { code: j.error });
    return j.data;
  } finally { if (!quiet) loading(false); }
}

function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3500);
}

async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function unb64(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function copyText(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '복사됨 ✓'; setTimeout(() => btn.textContent = o, 1500); } };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('복사하세요', text));
  else prompt('복사하세요', text);
}
