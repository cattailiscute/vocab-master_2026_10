const app = document.getElementById('app');
const nav = document.getElementById('nav');
let token = store.get('vocab_tt');
let dash = null, formData = null, view = 'home';
const studentUrl = new URL('index.html', location.href).href.replace(/index\.html$/, '');

function handleErr(e) {
  if (e.code === 'AUTH') { token = null; store.set('vocab_tt', null); return showLogin(); }
  toast(e.message, 'error');
}

function renderNav() {
  const tabs = [['home', '학생 현황'], ['words', '단어 관리'], ['students', '학생 관리'], ['sheet', '시험지 만들기'], ['sched', '예약 저장'], ['share', '학생 링크']];
  nav.innerHTML = tabs.map(([k, l]) => `<button data-v="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('') +
    (dash && dash.sheetUrl ? `<a href="${esc(dash.sheetUrl)}" target="_blank" rel="noopener">구글 시트 ↗</a>` : '') +
    '<button data-v="logout" class="muted">로그아웃</button>';
  nav.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.v));
}

function go(v) {
  if (v === 'logout') { token = null; store.set('vocab_tt', null); return showLogin(); }
  view = v; renderNav(); window.scrollTo(0, 0);
  ({ home: showHome, words: showWords, students: showStudents, sheet: showSheet, sched: showSched, share: showShare })[v]();
}

// ---------------------------------------------------------------- 로그인
async function showLogin() {
  dash = null; formData = null;
  nav.innerHTML = '<a href="index.html" class="muted">학생 화면</a>';
  app.innerHTML = '<div class="card narrow center-card"><p class="muted">불러오는 중…</p></div>';
  let boot = { teachers: [] };
  try { boot = await api('bootstrap'); } catch (e) { toast(e.message, 'error'); }
  const last = store.get('vocab_tname') || '';
  app.innerHTML = `<div class="card narrow center-card"><h1>선생님 로그인</h1>
    <form class="stack" id="lf">
      <label>이름 <select name="tname">${boot.teachers.concat(['관리자']).map(n => `<option ${n === last ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>비밀번호 <input type="password" name="pw" required autofocus></label>
      <button class="btn big primary">로그인</button></form>
    <p class="muted small">선생님 이름·비밀번호·담당 반은 관리자가 구글 시트 [선생님] 탭에서 정합니다. '관리자'는 모든 반을 봅니다.</p></div>`;
  const f = document.getElementById('lf');
  f.onsubmit = async ev => {
    ev.preventDefault();
    try {
      const r = await api('tLogin', { name: f.tname.value, password: f.pw.value });
      token = r.token; store.set('vocab_tt', token); store.set('vocab_tname', r.name);
      go('home');
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ---------------------------------------------------------------- 현황
async function showHome(klass) {
  try { dash = await api('tDashboard', { token, klass: klass || '' }); } catch (e) { return handleErr(e); }
  renderNav();
  document.getElementById('brand').textContent = `📘 ${dash.title} · ${dash.me.name}`;
  const classes = dash.me.classes;
  const list = klass ? dash.students.filter(s => s.klass === klass) : dash.students;
  app.innerHTML = `
    ${dash.defaultPw ? '<div class="flash warn">관리자 초기 비밀번호(1234)를 사용 중입니다. 구글 시트 [설정] 탭에서 <b>선생님비밀번호</b>를 꼭 바꾸세요.</div>' : ''}
    ${!classes.length ? '<div class="flash warn">담당 반이 없습니다. 관리자에게 구글 시트 [선생님] 탭의 <b>담당반</b>을 채워 달라고 하세요.</div>' : ''}
    <div class="page-head"><h1>학생 현황 <small class="muted">${esc(dash.me.admin ? '전체 반' : classes.join(', '))}</small></h1>
      <div class="filters">
        <button class="chip ${!klass ? 'on' : ''}" data-k="">전체</button>
        ${classes.map(c => `<button class="chip ${klass === c ? 'on' : ''}" data-k="${esc(c)}">${esc(c || '(반 없음)')}</button>`).join('')}
        <button class="btn small" id="csv">CSV 내보내기</button>
      </div></div>
    ${!klass && dash.classSummary.length > 1 ? `<section class="card"><h2>반별 요약</h2>
      <table class="tbl hover"><tr><th>반</th>${dash.me.admin ? '<th>담당</th>' : ''}<th>학생</th><th>평균 진도</th><th>평균 정답률</th><th>모두 완료</th><th>오늘 학습</th></tr>
      ${dash.classSummary.map(c => `<tr><td><button class="linkish" data-k="${esc(c.klass)}">${esc(c.klass)}</button></td>
        ${dash.me.admin ? `<td>${esc(c.teacher || '-')}</td>` : ''}<td>${c.n}명</td>
        <td><div class="minibar"><span style="width:${c.progress}%"></span></div>${c.progress}%</td>
        <td>${c.accuracy == null ? '-' : `<span class="${c.accuracy < 60 ? 'lowv' : ''}">${c.accuracy}%</span>`}</td>
        <td>${c.allDone}명</td><td>${c.activeToday}명</td></tr>`).join('')}</table></section>` : ''}
    <div class="stats">
      <div class="stat"><b>${list.length}</b><span>학생</span></div>
      <div class="stat"><b>${dash.nUnits}</b><span>단원</span></div>
      <div class="stat"><b>${dash.nWords}</b><span>단어</span></div>
      <div class="stat"><b>${dash.activeToday}</b><span>오늘 시험 본 학생</span></div>
    </div>
    <div class="grid2">
      <section class="card">${!list.length ? `<div class="empty">학생이 없습니다. [학생 관리]에서 추가하세요.</div>` : `
        <table class="tbl hover">
          <tr><th>반</th><th>이름</th><th>현재 위치</th><th>완료 단원</th><th>시험</th><th>정답률</th><th>틀린 단어</th><th>최근 학습</th><th></th></tr>
          ${list.map((s, i) => `<tr>
            <td>${esc(s.klass)}</td><td><button class="linkish" data-s="${i}">${esc(s.name)}</button></td>
            <td>${esc(s.position)}</td>
            <td><div class="minibar"><span style="width:${s.unitsTotal ? 100 * s.unitsDone / s.unitsTotal : 0}%"></span></div>${s.unitsDone}/${s.unitsTotal}</td>
            <td>${s.attempts}회 <small class="muted">(통과 ${s.passes})</small></td>
            <td>${s.accuracy == null ? '-' : `<span class="${s.accuracy < 60 ? 'lowv' : ''}">${s.accuracy}%</span>`}</td>
            <td>${s.wrongWords}</td><td class="muted">${esc(s.last || '없음')}</td>
            <td><button class="btn small" data-sheet="${i}">시험지</button></td></tr>`).join('')}
        </table>`}
      </section>
      <section class="card"><h2>많이 틀린 단어 TOP 15</h2>
        ${dash.topWrong.length ? `<table class="tbl"><tr><th>단어</th><th>뜻</th><th>단원</th><th>오답</th><th>학생 수</th></tr>
          ${dash.topWrong.map(w => `<tr><td><b>${esc(w.word)}</b></td><td>${esc(w.meaning)}</td><td class="muted">${esc(w.unit)}</td><td>${w.c}</td><td>${w.s}</td></tr>`).join('')}</table>`
          : '<p class="muted">아직 기록이 없습니다.</p>'}
        ${dash.me.admin ? `<h2>선생님 · 반 · 설정 바꾸기</h2>
        <p class="muted small">구글 시트 [선생님] 탭에 이름·비밀번호·담당반, [설정] 탭에 통과 기준 등을 적으면 바로 반영됩니다.</p>
        <a class="btn" href="${esc(dash.sheetUrl)}" target="_blank" rel="noopener">구글 시트 열기 ↗</a>` : ''}
      </section>
    </div>`;
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => showHome(b.dataset.k));
  app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => showStudent(list[+b.dataset.s]));
  app.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => { const s = list[+b.dataset.sheet]; view = 'sheet'; renderNav(); showSheet({ students: [s.klass + '|' + s.name] }); });
  document.getElementById('csv').onclick = () => {
    const rows = [['반', '이름', '현재 위치', '완료 단원', '전체 단원', '시험 횟수', '통과 횟수', '정답률(%)', '틀린 단어 수', '최근 학습']]
      .concat(list.map(s => [s.klass, s.name, s.position, s.unitsDone, s.unitsTotal, s.attempts, s.passes, s.accuracy ?? '', s.wrongWords, s.last]));
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `학생현황_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
}

async function showStudent(s) {
  let d;
  try { d = await api('tStudent', { token, klass: s.klass, name: s.name }); } catch (e) { return handleErr(e); }
  window.scrollTo(0, 0);
  const st = (u, n) => d.stats[u + '|' + n];
  app.innerHTML = `
    <button class="linkish back" id="back">← 학생 현황</button>
    <div class="page-head"><h1>${esc(d.klass)} ${esc(d.name)}</h1>
      <div><span class="pill">현재: ${esc(d.position)}</span> <button class="btn primary small" id="mk">이 학생 시험지 만들기</button></div></div>
    <div class="grid2">
      <section class="card"><h2>단원별 진도</h2>
        <table class="tbl"><tr><th>단원</th><th>1단계 (뜻)</th><th>2단계 (유의어·반의어)</th></tr>
        ${d.units.map(u => { const a = st(u.name, 1), b = st(u.name, 2); return `<tr class="${u.unlocked ? '' : 'locked-row'}">
          <td><b>${esc(u.name)}</b> <small class="muted">${u.n}개</small></td>
          <td>${u.s1 ? `<span class="pill ok">통과</span> <small class="muted">${esc(u.s1At.slice(0, 10))}</small>` : u.unlocked ? '<span class="pill warn">진행 중</span>' : '<span class="muted">잠김</span>'}
            ${a ? `<small> · ${a.n}회, 최고 ${a.best}%</small>` : ''}</td>
          <td>${!u.has2 ? '<span class="muted">해당 없음</span>' : u.s2 ? `<span class="pill ok">통과</span> <small class="muted">${esc(u.s2At.slice(0, 10))}</small>` : u.s2Open ? '<span class="pill warn">진행 중</span>' : '<span class="muted">잠김</span>'}
            ${b ? `<small> · ${b.n}회, 최고 ${b.best}%</small>` : ''}</td></tr>`; }).join('')}
        </table>
        <h2>시험 기록 (최근 40회)</h2>
        <table class="tbl"><tr><th>일시</th><th>단원</th><th>단계</th><th>점수</th><th>결과</th></tr>
        ${d.history.map(h => `<tr><td class="muted">${esc(h.at)}</td><td>${esc(h.unit)}</td><td>${h.stage}단계</td>
          <td>${h.score}/${h.total} (${h.total ? Math.round(100 * h.score / h.total) : 0}%)</td>
          <td>${h.passed ? '<span class="pill ok">통과</span>' : '<span class="pill bad">미통과</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">기록 없음</td></tr>'}
        </table></section>
      <section class="card"><h2>틀린 단어 (${d.wrong.length}개)</h2>
        <table class="tbl"><tr><th>단어</th><th>뜻</th><th>단원</th><th>틀린 횟수</th><th>마지막</th></tr>
        ${d.wrong.map(w => `<tr><td><b>${esc(w.word)}</b></td><td>${esc(w.meaning)}</td><td class="muted">${esc(w.unit)}</td><td>${w.cnt}</td><td class="muted">${esc(w.last)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">없음</td></tr>'}
        </table></section>
    </div>`;
  document.getElementById('back').onclick = () => showHome();
  document.getElementById('mk').onclick = () => { view = 'sheet'; renderNav(); showSheet({ students: [d.klass + '|' + d.name] }); };
}

// ---------------------------------------------------------------- 시험지 설정 폼
const DEFAULT_CFG = { title: '영단어 시험', mode: 'each', classes: [], students: [], wrongCount: 10, randomCount: 10, days: 0, units: [], format: 'mixed', rel: false, key: true, fill: true };

async function loadFormData() {
  if (!formData) formData = await api('tFormData', { token });
  return formData;
}

function cfgForm(cfg) {
  const fd = formData;
  const chk = (name, v, on, label) => `<label class="inline chipbox"><input type="checkbox" name="${name}" value="${esc(v)}" ${on ? 'checked' : ''}> ${esc(label)}</label>`;
  return `
  <fieldset><legend>대상 학생</legend>
    <div class="row-wrap">
      <label class="inline"><input type="radio" name="mode" value="each" ${cfg.mode !== 'class' ? 'checked' : ''}> 학생별로 각자 다른 시험지 <small class="muted">(각자 틀린 단어)</small></label>
      <label class="inline"><input type="radio" name="mode" value="class" ${cfg.mode === 'class' ? 'checked' : ''}> 공통 시험지 1장 <small class="muted">(선택한 학생들이 많이 틀린 단어)</small></label>
    </div>
    ${fd.classes.length ? `<div class="row-wrap"><b class="lbl">반 전체:</b>${fd.classes.map(c => chk('classes', c, cfg.classes.includes(c), c || '(반 없음)')).join('')}
      <small class="muted">— 반을 고르면 나중에 추가된 학생도 자동 포함</small></div>` : ''}
    <details ${cfg.students.length ? 'open' : ''}><summary>개별 학생 선택 (${fd.students.length}명)</summary>
      <div class="student-pick">${fd.students.map(k => chk('students', k, cfg.students.includes(k), k.replace('|', ' '))).join('')}</div></details>
  </fieldset>
  <fieldset><legend>문제 구성</legend>
    <div class="row">
      <label>틀린 단어 수 <input type="number" name="wrongCount" min="0" max="200" value="${cfg.wrongCount}"></label>
      <label>랜덤 단어 수 <input type="number" name="randomCount" min="0" max="200" value="${cfg.randomCount}"></label>
      <label>틀린 단어 기간 <select name="days">${[[0, '전체 기간'], [1, '최근 1일'], [3, '최근 3일'], [7, '최근 7일'], [14, '최근 2주'], [30, '최근 30일']]
        .map(([d, l]) => `<option value="${d}" ${+cfg.days === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="inline"><input type="checkbox" name="fill" ${cfg.fill ? 'checked' : ''}> 틀린 단어가 모자라면 랜덤 단어로 채우기</label>
    ${fd.units.length ? `<div class="row-wrap"><b class="lbl">랜덤 단어 범위:</b>${fd.units.map(u => chk('units', u, cfg.units.includes(u), u)).join('')}
      <small class="muted">— 안 고르면 전체 단원</small></div>` : ''}
  </fieldset>
  <fieldset><legend>문제 형식</legend>
    <div class="row-wrap">${[['mc', '객관식 (4지선다)'], ['write_meaning', '주관식: 뜻 쓰기'], ['write_word', '주관식: 영어 단어 쓰기'], ['mixed', '혼합']]
      .map(([v, l]) => `<label class="inline"><input type="radio" name="format" value="${v}" ${cfg.format === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <label class="inline"><input type="checkbox" name="rel" ${cfg.rel ? 'checked' : ''}> 유의어·반의어 객관식 문항 추가</label>
    <label class="inline"><input type="checkbox" name="key" ${cfg.key ? 'checked' : ''}> 정답지 포함 (맨 뒤 페이지)</label>
    <label>시험지 제목 <input name="title" value="${esc(cfg.title)}"></label>
  </fieldset>`;
}

function readCfg(f) {
  const all = n => [...f.querySelectorAll(`[name="${n}"]:checked`)].map(x => x.value);
  return {
    title: f.title.value.trim() || '영단어 시험', mode: f.querySelector('[name=mode]:checked').value,
    classes: all('classes'), students: all('students'),
    wrongCount: +f.wrongCount.value || 0, randomCount: +f.randomCount.value || 0, days: +f.days.value,
    units: all('units'), format: f.querySelector('[name=format]:checked').value,
    rel: f.rel.checked, key: f.key.checked, fill: f.fill.checked,
  };
}

// ---------------------------------------------------------------- 시험지 만들기
async function showSheet(preset) {
  try { await loadFormData(); } catch (e) { return handleErr(e); }
  const cfg = Object.assign({}, DEFAULT_CFG, preset || {});
  app.innerHTML = `
    <div class="page-head"><h1>시험지 만들기</h1><span class="muted">학생이 틀린 단어 + 랜덤 단어 → 인쇄</span></div>
    <form class="card stack sheet-form" id="sf">${cfgForm(cfg)}
      <div class="row-btns">
        <button class="btn big primary" type="submit">미리보기 · 인쇄</button>
        <button class="btn big" type="button" id="save">구글 드라이브에 PDF 저장</button>
      </div>
      <p class="muted small">인쇄 창에서 "PDF로 저장"을 고르면 내 컴퓨터에 PDF로 저장할 수도 있어요.</p>
    </form>`;
  const f = document.getElementById('sf');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:20px">시험지 만드는 중…</p>');
    try {
      const r = await api('tSheet', { token, cfg: readCfg(f) });
      if (!w) { toast('팝업이 막혔어요. 브라우저 주소창 옆에서 팝업을 허용해 주세요.', 'error'); return; }
      w.document.open(); w.document.write(r.html); w.document.close();
      setTimeout(() => w.print(), 400);
    } catch (e) { if (w) w.close(); handleErr(e); }
  };
  document.getElementById('save').onclick = async () => {
    try {
      const r = await api('tSaveSheet', { token, cfg: readCfg(f) });
      toast('드라이브에 저장했습니다: ' + r.name, 'ok');
    } catch (e) { handleErr(e); }
  };
}

// ---------------------------------------------------------------- 예약
async function showSched() {
  let d;
  try { [d] = await Promise.all([api('tSchedules', { token }), loadFormData()]); } catch (e) { return handleErr(e); }
  const t = new Date(Date.now() + 3600e3); t.setMinutes(0);
  const pad = n => String(n).padStart(2, '0');
  const defTime = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;
  app.innerHTML = `
    <div class="page-head"><h1>예약 저장</h1><span class="muted">정한 시간에 시험지 PDF를 구글 드라이브에 자동 저장</span></div>
    <div class="notice">${d.folderUrl ? `저장 위치: <a href="${esc(d.folderUrl)}" target="_blank" rel="noopener">구글 드라이브 › 단어 시험지 (자동 저장) ↗</a> · ` : '저장된 시험지는 아래 목록에서 열 수 있습니다. · '}5분 간격으로 확인하므로 정한 시각부터 최대 5분 안에 저장됩니다. Mac을 꺼 둬도 됩니다.
      ${d.folderUrl ? '· Mac에 <b>Google Drive 앱</b>을 설치해 두면 이 폴더가 Mac에도 자동으로 내려받아집니다.' : ''}</div>
    <section class="card"><h2>예약 목록</h2>
      <table class="tbl"><tr><th>이름</th><th>다음 실행</th><th>반복</th><th>구성</th><th>최근 결과</th><th></th></tr>
      ${d.schedules.map(s => `<tr class="${s.active ? '' : 'off-row'}">
        <td><b>${esc(s.name)}</b>${s.owner ? ` <small class="muted">${esc(s.owner)}</small>` : ''}</td><td>${s.active ? esc(s.runAt) : '꺼짐'}</td><td>${esc(s.repeatLabel)}</td>
        <td><small>${s.cfg.mode === 'class' ? '공통' : '학생별'} · 틀린 ${s.cfg.wrongCount ?? '-'} + 랜덤 ${s.cfg.randomCount ?? '-'}
          ${(s.cfg.classes || []).length ? ' · ' + esc(s.cfg.classes.join(', ')) : ''}${(s.cfg.students || []).length ? ` · 개별 ${s.cfg.students.length}명` : ''}</small></td>
        <td><small class="muted">${esc(s.lastRun)} ${esc(s.result)}</small></td>
        <td class="actions">
          <button class="btn small" data-op="run" data-row="${s.row}">지금 저장</button>
          <button class="btn small" data-op="toggle" data-row="${s.row}">${s.active ? '끄기' : '켜기'}</button>
          <button class="btn small danger" data-op="delete" data-row="${s.row}">삭제</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">예약이 없습니다.</td></tr>'}
      </table></section>
    <div class="grid2 rev">
      <form class="card stack sheet-form" id="nf"><h2>새 예약 만들기</h2>
        <div class="row">
          <label>예약 이름 <input name="sname" placeholder="예: 1반 월요일 단어시험"></label>
          <label>저장 시각 <input type="datetime-local" name="runAt" value="${defTime}" required></label>
          <label>반복 <select name="repeat">${Object.entries(d.repeats).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        </div>
        ${cfgForm(DEFAULT_CFG)}
        <button class="btn big primary">예약 추가</button>
      </form>
      <section class="card"><h2>저장된 시험지</h2>
        <table class="tbl">${d.files.map(f => `<tr><td><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a></td><td class="muted">${esc(f.at)}</td></tr>`).join('') || '<tr><td class="muted">아직 저장된 파일이 없습니다.</td></tr>'}</table>
      </section>
    </div>`;
  app.querySelectorAll('[data-op]').forEach(b => b.onclick = async () => {
    if (b.dataset.op === 'delete' && !confirm('예약을 삭제할까요?')) return;
    try {
      const r = await api('tScheduleAction', { token, op: b.dataset.op, row: +b.dataset.row });
      if (r.message) toast(r.message, 'ok');
      showSched();
    } catch (e) { handleErr(e); }
  });
  const f = document.getElementById('nf');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const cfg = readCfg(f);
    if (!cfg.classes.length && !cfg.students.length) return toast('반이나 학생을 하나 이상 고르세요.', 'error');
    try {
      await api('tAddSchedule', { token, name: f.sname.value, runAt: f.runAt.value, repeat: f.repeat.value, cfg });
      toast('예약했습니다.', 'ok');
      showSched();
    } catch (e) { handleErr(e); }
  };
}

// ---------------------------------------------------------------- 학생 링크
function showShare() {
  const link = studentUrl;
  app.innerHTML = `
    <div class="page-head"><h1>학생에게 링크 공유</h1></div>
    <div class="grid2 rev">
      <section class="card share-card">
        <span class="pill ok">언제든 접속 가능 (Mac을 꺼도 됨)</span>
        <div id="qr" class="qr"></div>
        <p class="share-url"><code>${esc(link)}</code></p>
        <div class="row-btns center"><button class="btn primary" id="cp">링크 복사</button><button class="btn" onclick="window.print()">QR 인쇄</button></div>
        <p class="muted small">수업 시간에 화면에 띄워 휴대폰 카메라로 찍게 하거나, 링크를 단체방에 올리세요.</p>
      </section>
      <section class="card"><h2>학생에게 보낼 안내문</h2>
        <textarea rows="7" readonly id="msg">📘 영단어 암기 시작!
접속: ${link}
반 · 이름 · 비밀번호(선생님께 받은 번호)로 로그인하세요.
1단계(뜻) → 2단계(유의어·반의어) 순서로, 통과해야 다음 단계가 열려요.</textarea>
        <div class="row-btns"><button class="btn" id="cpm">안내문 복사</button></div>
        <h2>학생 비밀번호</h2>
        <p class="muted">[학생 관리] 메뉴에서 확인·변경할 수 있습니다.</p>

      </section>
    </div>`;
  if (window.QRCode) new QRCode(document.getElementById('qr'), { text: link, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
  else document.getElementById('qr').innerHTML = '<p class="muted">QR코드를 불러오지 못했어요. 링크를 복사해서 공유하세요.</p>';
  document.getElementById('cp').onclick = e => copyText(link, e.target);
  document.getElementById('cpm').onclick = e => copyText(document.getElementById('msg').value, e.target);
}

// ---------------------------------------------------------------- 단어 파일 읽기
const HEADER_ALIASES = [
  ['unit', ['단원', 'unit', 'day', 'lesson', '차시', '세트', 'set', 'chapter', '과']],
  ['syn', ['유의어', '동의어', 'synonym', '비슷한']],
  ['ant', ['반의어', 'antonym', '반대']],
  ['meaning', ['뜻', 'meaning', '의미', '한글', 'korean', '해석']],
  ['word', ['단어', 'word', '영단어', 'english', '어휘', '영어']],
];
function mapHeader(row) {
  const m = {};
  row.forEach((cell, i) => {
    const c = String(cell ?? '').trim().toLowerCase();
    if (!c) return;
    for (const [key, al] of HEADER_ALIASES) if (!(key in m) && al.some(a => c.includes(a))) { m[key] = i; break; }
  });
  return 'word' in m && 'meaning' in m ? m : null;
}
async function readWordFile(file, defaultUnit) {
  if (!window.XLSX) throw new Error('엑셀 읽기 도구를 불러오지 못했어요. 새로고침 후 다시 시도하세요.');
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.(csv|txt|tsv)$/i.test(file.name)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('euc-kr').decode(buf); }
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string' });
  } else wb = XLSX.read(buf, { type: 'array' });
  const sheets = wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false })])
    .map(([n, rows]) => [n, rows.filter(r => r.some(c => String(c).trim()))]).filter(([, rows]) => rows.length);
  const multi = sheets.length > 1, out = [];
  for (const [sheetName, rows0] of sheets) {
    let rows = rows0, m = mapHeader(rows[0]);
    if (m) rows = rows.slice(1); else m = { word: 0, meaning: 1, syn: 2, ant: 3 };
    const fallback = (multi ? sheetName : defaultUnit) || sheetName || '기본';
    for (const r of rows) {
      const col = k => (m[k] !== undefined ? String(r[m[k]] ?? '').trim() : '');
      const word = col('word'), meaning = col('meaning');
      if (!word || !meaning) continue;
      let unit = col('unit') || fallback;
      if (/^\d+(\.0)?$/.test(unit)) unit = 'Day ' + parseInt(unit, 10);
      out.push([unit, word, meaning, col('syn'), col('ant')]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 단어 관리
let wordsOwner = '';
async function showWords() {
  let d;
  try { d = await api('tWords', { token, owner: wordsOwner }); } catch (e) { return handleErr(e); }
  let parsed = null;
  const unitTable = (units, editable) => units.length ? units.map(u => `
      <details class="unitbox"><summary><b>${esc(u.name)}</b> <span class="muted">${u.n}단어 · 유의어/반의어 ${u.nrel}개</span>
        ${editable ? `<button class="btn small danger" data-del="${esc(u.name)}">단원 삭제</button>` : ''}</summary>
        <table class="tbl"><tr><th>단어</th><th>뜻</th><th>유의어</th><th>반의어</th></tr>
        ${u.words.map(w => `<tr><td><b>${esc(w[0])}</b></td><td>${esc(w[1])}</td><td>${esc(w[2])}</td><td>${esc(w[3])}</td></tr>`).join('')}</table>
      </details>`).join('') : '<p class="muted">없음</p>';
  app.innerHTML = `
    <div class="page-head"><h1>단어 관리</h1>
      ${d.admin ? `<label class="inline">단어장 주인: <select id="owner"><option value="">공통 (모든 반)</option>
        ${d.teachers.map(t => `<option ${t === d.owner ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`
        : '<span class="muted">여기서 올린 단어는 내 담당 반 학생에게만 나옵니다.</span>'}</div>
    <div class="grid2 rev">
      <section class="card">
        <h2>단어 파일 올리기</h2>
        <form class="stack" id="uf">
          <label>엑셀(.xlsx) 또는 CSV 파일 <input type="file" name="file" accept=".xlsx,.xls,.csv,.txt,.tsv" required></label>
          <label>단원 이름 <small class="muted">(파일에 '단원' 열이 없을 때만 사용)</small><input name="unit" placeholder="예: Day 1"></label>
          <fieldset><legend>올리는 방법</legend>
            <label class="inline"><input type="radio" name="mode" value="units" checked> 파일에 있는 단원만 새 파일로 바꾸기 <small class="muted">(추천)</small></label>
            <label class="inline"><input type="radio" name="mode" value="merge"> 추가·수정만 (기존 단어 유지)</label>
            <label class="inline"><input type="radio" name="mode" value="all"> 내 단어 모두 지우고 새로 올리기</label>
          </fieldset>
          <div id="preview"></div>
          <button class="btn primary big" id="upbtn" disabled>올리기</button>
        </form>
        <div class="help">
          <p><b>파일 형식</b> — 첫 줄 제목: <code>단원 | 단어 | 뜻 | 유의어 | 반의어</code></p>
          <ul><li>유의어·반의어가 여러 개면 쉼표(,)로 구분</li>
            <li>열 순서가 달라도 제목으로 찾음 · 시트가 여러 개면 <b>시트 이름 = 단원</b></li>
            <li>단원 순서 = 파일에 나온 순서</li></ul>
          <button class="btn small" id="tpl">양식 파일 받기</button>
        </div>
      </section>
      <section class="card">
        <h2>${d.admin ? (d.owner ? esc(d.owner) + ' 선생님 단어' : '공통 단어 (모든 반)') : '내 단어'} — ${d.units.reduce((a, u) => a + u.n, 0)}개</h2>
        ${unitTable(d.units, true)}
        ${!d.admin && d.shared.length ? `<h2>공통 단어 <small class="muted">(관리자가 올린 단어, 모든 반에 나옴)</small></h2>${unitTable(d.shared, false)}` : ''}
      </section>
    </div>`;
  const f = document.getElementById('uf'), pv = document.getElementById('preview'), up = document.getElementById('upbtn');
  const own = document.getElementById('owner');
  if (own) own.onchange = () => { wordsOwner = own.value; showWords(); };
  const doParse = async () => {
    parsed = null; up.disabled = true; pv.innerHTML = '';
    const file = f.file.files[0];
    if (!file) return;
    try { parsed = await readWordFile(file, f.unit.value.trim()); } catch (e) { pv.innerHTML = `<div class="flash error">${esc(e.message)}</div>`; return; }
    if (!parsed.length) { pv.innerHTML = '<div class="flash error">읽을 수 있는 단어가 없어요. 첫 줄 제목(단어, 뜻)을 확인하세요.</div>'; return; }
    const by = {};
    parsed.forEach(r => { by[r[0]] = (by[r[0]] || 0) + 1; });
    pv.innerHTML = `<div class="flash ok">단어 <b>${parsed.length}개</b> 읽음 — ${Object.entries(by).map(([u, n]) => `${esc(u)} ${n}개`).join(', ')}
      <br><small>예: ${parsed.slice(0, 3).map(r => `${esc(r[1])}=${esc(r[2])}`).join(' · ')}</small></div>`;
    up.disabled = false;
  };
  f.file.onchange = doParse;
  f.unit.onchange = () => { if (f.file.files[0]) doParse(); };
  f.onsubmit = async ev => {
    ev.preventDefault();
    if (!parsed) return;
    const mode = f.querySelector('[name=mode]:checked').value;
    if (mode === 'all' && !confirm('내 단어를 모두 지우고 이 파일로 바꿀까요?')) return;
    try {
      const r = await api('tUploadWords', { token, rows: parsed, mode, owner: wordsOwner });
      toast(`올렸습니다: 새 단어 ${r.added}개, 수정 ${r.updated}개${r.removed ? `, 삭제 ${r.removed}개` : ''}`, 'ok');
      formData = null;
      showWords();
    } catch (e) { handleErr(e); }
  };
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async ev => {
    ev.preventDefault();
    if (!confirm(`단원 "${b.dataset.del}"의 단어를 모두 삭제할까요?`)) return;
    try { await api('tDeleteUnit', { token, unit: b.dataset.del, owner: wordsOwner }); formData = null; showWords(); } catch (e) { handleErr(e); }
  });
  document.getElementById('tpl').onclick = () => {
    if (!window.XLSX) return toast('엑셀 도구를 불러오지 못했어요.', 'error');
    const ws = XLSX.utils.aoa_to_sheet([['단원', '단어', '뜻', '유의어', '반의어'], ['Day 1', 'abundant', '풍부한', 'plentiful, ample', 'scarce'],
      ['Day 1', 'increase', '증가하다', 'rise, grow', 'decrease'], ['Day 2', 'ancient', '고대의', 'old', 'modern']]);
    ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 20 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '단어');
    XLSX.writeFile(wb, '단어_양식.xlsx');
  };
}

// ---------------------------------------------------------------- 학생 관리
async function showStudents(showPins) {
  let d;
  try { d = await api('tStudents', { token }); } catch (e) { return handleErr(e); }
  const by = {};
  d.students.forEach(s => (by[s.klass] = by[s.klass] || []).push(s));
  const classes = d.classes.concat(Object.keys(by).filter(c => !d.classes.includes(c)));
  app.innerHTML = `
    <div class="page-head"><h1>학생 관리</h1><button class="btn small" id="pins">${showPins ? '비밀번호 숨기기' : '비밀번호 보기'}</button></div>
    <div class="grid2 rev">
      <section class="card"><h2>학생 추가</h2>
        <form class="stack" id="af">
          <label>반 <select name="klass">${d.classes.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label>한 줄에 한 명씩 <small class="muted">— <code>이름</code> 또는 <code>이름,비밀번호</code> 또는 <code>반,이름,비밀번호</code>. 비밀번호를 비우면 4자리 자동 생성. 엑셀에서 복사해 붙여넣어도 됩니다.</small>
            <textarea name="bulk" rows="9" placeholder="김민수,1234&#10;이서연&#10;3반,박지훈,5678"></textarea></label>
          <button class="btn primary">추가</button>
        </form>
        <p class="muted small">학생은 학생 화면에서 <b>반 · 이름 · 비밀번호</b>로 로그인합니다.</p>
      </section>
      <section class="card"><h2>학생 목록 (${d.students.length}명)</h2>
        ${classes.map(c => `<h3>${esc(c)} <small class="muted">${(by[c] || []).length}명</small></h3>
          ${(by[c] || []).length ? `<table class="tbl"><tr><th>이름</th><th>비밀번호</th><th>관리</th></tr>
          ${by[c].map(s => `<tr><td>${esc(s.name)}</td><td><code>${showPins ? esc(s.pin) : '••••'}</code></td>
            <td class="actions" data-k="${esc(s.klass)}" data-n="${esc(s.name)}">
              <button class="btn small" data-op="pin">비번 변경</button>
              <button class="btn small" data-op="resetProgress">진도 초기화</button>
              <button class="btn small danger" data-op="delete">삭제</button></td></tr>`).join('')}</table>` : '<p class="muted">학생 없음</p>'}`).join('')}
      </section>
    </div>`;
  document.getElementById('pins').onclick = () => showStudents(!showPins);
  const f = document.getElementById('af');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const rows = f.bulk.value.split(/\r?\n/).map(l => l.split(/[,\t]/).map(x => x.trim())).filter(p => p[0])
      .map(p => p.length >= 3 ? [p[0], p[1], p[2]] : [f.klass.value, p[0], p[1] || '']);
    if (!rows.length) return toast('학생 이름을 입력하세요.', 'error');
    try {
      const r = await api('tAddStudents', { token, rows });
      toast(`${r.added}명 추가` + (r.skipped.length ? ` · 이미 있음: ${r.skipped.join(', ')}` : '') + (r.denied.length ? ` · 담당 반 아님: ${r.denied.join(', ')}` : ''), r.added ? 'ok' : 'error');
      formData = null;
      showStudents(true);
    } catch (e) { handleErr(e); }
  };
  app.querySelectorAll('[data-op]').forEach(b => b.onclick = async () => {
    const td = b.parentElement, klass = td.dataset.k, name = td.dataset.n, op = b.dataset.op;
    let pin;
    if (op === 'pin') { pin = prompt(`${klass} ${name} 학생의 새 비밀번호 (비우면 자동 생성)`, ''); if (pin === null) return; }
    if (op === 'delete' && !confirm(`${klass} ${name} 학생을 삭제할까요? (시험 기록은 남습니다)`)) return;
    if (op === 'resetProgress' && !confirm(`${klass} ${name} 학생의 통과 기록을 지우고 처음부터 하게 할까요?`)) return;
    try {
      const r = await api('tStudentAction', { token, op, klass, name, pin });
      if (op === 'pin') toast(`${name} 비밀번호: ${r.pin}`, 'ok'); else toast('완료했습니다.', 'ok');
      formData = null;
      showStudents(showPins || op === 'pin');
    } catch (e) { handleErr(e); }
  });
}

token ? go('home') : showLogin();
