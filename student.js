const app = document.getElementById('app');
const nav = document.getElementById('nav');
let token = store.get('vocab_token');
let me = null;

function setTitle(t) { if (t) { document.getElementById('brand').textContent = '📘 ' + t; document.title = t; } }

function handleErr(e) {
  if (e.code === 'AUTH') { logout(); return; }
  toast(e.message, 'error');
}

function logout() {
  token = null; store.set('vocab_token', null);
  showLogin();
}

// ---------------------------------------------------------------- 로그인
async function showLogin() {
  nav.innerHTML = '<a href="teacher.html" class="muted">선생님</a>';
  app.innerHTML = '<div class="card narrow center-card"><p class="muted">불러오는 중…</p></div>';
  let boot = { classes: [], title: '' };
  try { boot = await api('bootstrap'); setTitle(boot.title); } catch (e) { toast(e.message, 'error'); }
  const last = JSON.parse(store.get('vocab_last') || '{}');
  const classField = boot.classes.length && !(boot.classes.length === 1 && !boot.classes[0])
    ? `<select name="klass" required>${boot.classes.map(c => `<option ${c === last.klass ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`
    : `<input name="klass" placeholder="반 (없으면 비워두기)" value="${esc(last.klass || '')}">`;
  app.innerHTML = `
    <div class="card narrow center-card">
      <h1>단어 공부 시작하기</h1>
      <p class="muted">반과 이름, 선생님께 받은 비밀번호를 입력하세요.</p>
      <form class="stack" id="lf">
        <label>반 ${classField}</label>
        <label>이름 <input name="name" required autocomplete="off" value="${esc(last.name || '')}"></label>
        <label>비밀번호 <input name="pin" required inputmode="numeric" type="password" autocomplete="off"></label>
        <button class="btn big primary">로그인</button>
      </form>
    </div>`;
  const f = document.getElementById('lf');
  (last.name ? f.pin : f.name).focus();
  f.onsubmit = async ev => {
    ev.preventDefault();
    const d = { klass: (f.klass.value || '').trim(), name: f.name.value.trim(), pin: f.pin.value.trim() };
    try {
      const r = await api('login', d);
      token = r.token; store.set('vocab_token', token);
      store.set('vocab_last', JSON.stringify({ klass: d.klass, name: d.name }));
      showHome();
    } catch (e) { toast(e.message, 'error'); f.pin.value = ''; f.pin.focus(); }
  };
}

// ---------------------------------------------------------------- 홈
async function showHome() {
  window.scrollTo(0, 0);
  let d;
  try { d = await api('home', { token }); } catch (e) { return handleErr(e); }
  me = d; setTitle(d.title);
  nav.innerHTML = `<span class="who">${esc(d.klass)} ${esc(d.name)}</span><button class="linkish muted" id="lo">로그아웃</button>`;
  document.getElementById('lo').onclick = logout;
  const done = d.units.filter(u => u.done).length;
  app.innerHTML = `
    <section class="hero">
      <div><h1>${esc(d.name)}님, 오늘도 한 단계!</h1><p>지금 할 차례: <b>${esc(d.position)}</b></p></div>
      <div class="ring-wrap"><div class="bar"><span style="width:${d.units.length ? 100 * done / d.units.length : 0}%"></span></div>
        <small>${done} / ${d.units.length} 단원 완료</small></div>
    </section>
    ${d.units.length ? '' : '<div class="card"><p>아직 등록된 단어가 없어요. 선생님이 단어를 올리면 시작할 수 있어요.</p></div>'}
    <div class="units">${d.units.map(unitCard).join('')}</div>
    ${d.review.length ? `<section class="card"><h2>복습 노트 — 내가 자주 틀린 단어</h2><table class="tbl">
      <tr><th>단어</th><th>뜻</th><th>유의어</th><th>반의어</th><th>틀린 횟수</th></tr>
      ${d.review.map(w => `<tr><td><b>${esc(w.word)}</b></td><td>${esc(w.meaning)}</td><td>${esc(w.syn)}</td><td>${esc(w.ant)}</td><td>${w.cnt}</td></tr>`).join('')}
    </table></section>` : ''}`;
  app.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => startQuiz(b.dataset.unit, +b.dataset.stage));
}

function unitCard(u) {
  const s1 = `<button class="step ${u.s1 ? 'passed' : ''}" data-unit="${esc(u.name)}" data-stage="1" ${u.s1Open ? '' : 'disabled'}>
      <b>1단계</b><span>단어 뜻</span><em>${u.s1 ? '✔ 통과 · 다시 풀기' : u.s1Open ? '도전하기 →' : '🔒'}</em></button>`;
  const s2 = u.has2
    ? `<button class="step ${u.s2 ? 'passed' : ''}" data-unit="${esc(u.name)}" data-stage="2" ${u.s2Open ? '' : 'disabled'}>
        <b>2단계</b><span>유의어 · 반의어</span><em>${u.s2 ? '✔ 통과 · 다시 풀기' : u.s2Open ? '도전하기 →' : '🔒 1단계 통과 후'}</em></button>`
    : `<div class="step none"><b>2단계</b><span>이 단원은 유의어·반의어가 없어요</span></div>`;
  return `<div class="unit ${u.done ? 'done' : ''} ${u.unlocked ? '' : 'locked'}">
    <div class="unit-head"><h2>${esc(u.name)}</h2><span class="muted">${u.n}단어</span>
      ${u.done ? '<span class="pill ok">완료</span>' : !u.unlocked ? '<span class="pill">🔒 잠김</span>' : ''}</div>
    <div class="steps">${s1}${s2}</div></div>`;
}

// ---------------------------------------------------------------- 퀴즈
const LABEL = { en2ko: '뜻 고르기', ko2en: '단어 고르기', syn: '유의어', ant: '반의어' };

async function startQuiz(unit, stage) {
  let q;
  try { q = await api('startQuiz', { token, unit, stage }); } catch (e) { return handleErr(e); }
  // 정답 위치 미리 계산 (서버는 해시만 보냄)
  const answers = await Promise.all(q.questions.map(async (x, i) => {
    for (let k = 0; k < x.choices.length; k++) if (await sha256hex(`${q.quizId}:${i}:${k}`) === x.h) return k;
    return -1;
  }));
  runQuiz(q, answers);
}

function runQuiz(q, answers) {
  window.scrollTo(0, 0);
  nav.innerHTML = '<button class="linkish muted" id="quit">← 그만하기</button>';
  document.getElementById('quit').onclick = () => { if (confirm('그만둘까요? 지금까지 푼 것은 저장되지 않아요.')) showHome(); };
  app.innerHTML = `
    <div class="quiz-top"><div><b>${esc(q.unit)}</b> · ${q.stage}단계 ${q.stage === 1 ? '단어 뜻' : '유의어·반의어'}</div>
      <div class="muted">통과 기준 ${q.passRate}%</div></div>
    <div class="bar"><span id="prog"></span></div>
    <div id="quiz" class="card quiz"></div>`;
  const el = document.getElementById('quiz'), prog = document.getElementById('prog');
  const QS = q.questions, picks = [];
  let i = 0, locked = false;

  function render() {
    prog.style.width = (100 * i / QS.length) + '%';
    if (i >= QS.length) return finish();
    const x = QS[i];
    locked = false;
    el.innerHTML = `
      <div class="qmeta"><span class="pill">${LABEL[x.qtype]}</span><span class="muted">${i + 1} / ${QS.length}</span></div>
      <div class="prompt ${x.qtype === 'ko2en' ? 'ko' : ''}">${esc(x.prompt)}</div>
      ${x.sub ? `<div class="sub">(${esc(x.sub)})</div>` : ''}
      <div class="ask">${esc(x.ask)}</div>
      <div class="choices">${x.choices.map((c, k) => `<button class="choice" data-k="${k}"><span class="num">${k + 1}</span>${esc(c)}</button>`).join('')}</div>
      <div id="fb" class="fb"></div>`;
    el.querySelectorAll('.choice').forEach(b => b.onclick = () => answer(+b.dataset.k));
  }

  function answer(k) {
    if (locked) return;
    locked = true;
    picks[i] = k;
    const btns = el.querySelectorAll('.choice');
    btns.forEach(b => b.disabled = true);
    const right = answers[i];
    if (right >= 0) btns[right].classList.add('right');
    const fb = document.getElementById('fb');
    if (k === right) {
      fb.innerHTML = '<span class="good">⭕ 정답!</span>';
      i++; setTimeout(render, 650);
    } else {
      btns[k].classList.add('wrong');
      let info = {};
      try { info = JSON.parse(unb64(QS[i].x)); } catch (e) { /* 무시 */ }
      fb.innerHTML = `<span class="bad">❌ 아쉬워요</span> <span class="explain"><b>${esc(info.w)}</b> = ${esc(info.m)}</span>
        <button class="btn primary" id="nx">다음 →</button>`;
      const nx = document.getElementById('nx');
      nx.onclick = () => { i++; render(); };
      nx.focus();
    }
  }

  async function finish() {
    el.innerHTML = '<p class="muted">채점 중…</p>';
    let r;
    try { r = await api('finishQuiz', { token, quizId: q.quizId, choices: picks }); }
    catch (e) {
      if (e.code === 'AUTH') return handleErr(e);
      el.innerHTML = `<p>${esc(e.message)}</p><div class="row-btns"><button class="btn primary" id="retry">다시 보내기</button><button class="btn" id="home">목록으로</button></div>`;
      document.getElementById('retry').onclick = finish;
      document.getElementById('home').onclick = showHome;
      return;
    }
    showResult(r);
  }
  document.onkeydown = e => {
    if (!document.getElementById('quiz')) return;
    if (e.key >= '1' && e.key <= '4') { const b = el.querySelectorAll('.choice')[+e.key - 1]; if (b && !b.disabled) b.click(); }
    if (e.key === 'Enter') { const nx = document.getElementById('nx'); if (nx) { e.preventDefault(); nx.click(); } }
  };
  render();
}

function showResult(r) {
  const pct = r.total ? Math.round(100 * r.score / r.total) : 0;
  const wrongTable = !r.wrong.length ? '' : `<h3>틀린 문제 다시 보기</h3><table class="tbl">${r.stage === 1
    ? '<tr><th>단어</th><th>뜻</th></tr>' + r.wrong.map(w => `<tr><td><b>${esc(w.word)}</b></td><td>${esc(w.meaning)}</td></tr>`).join('')
    : '<tr><th>단어</th><th>문제</th><th>정답</th></tr>' + r.wrong.map(w => `<tr><td><b>${esc(w.word)}</b> <small class="muted">${esc(w.meaning)}</small></td><td>${w.qtype === 'syn' ? '유의어' : '반의어'}</td><td><b>${esc(w.answer)}</b></td></tr>`).join('')}</table>`;
  document.getElementById('quiz').innerHTML = `
    <div class="result ${r.passed ? 'pass' : 'fail'}">
      <div class="big-emoji">${r.passed ? '🎉' : '💪'}</div>
      <h1>${r.passed ? '통과!' : '아직 통과 못 했어요'}</h1>
      <p class="score">${r.score} / ${r.total} <small>(${pct}%)</small></p>
      <p class="muted">${r.passed ? '잘했어요! 다음 단계가 열렸어요.' : `통과하려면 ${r.passRate}% 이상 맞혀야 해요. 틀린 단어를 보고 다시 도전!`}</p>
    </div>
    ${wrongTable}
    <div class="row-btns">
      ${r.passed && r.next ? `<button class="btn big primary" id="nextb">다음: ${esc(r.next.unit)} ${r.next.stage}단계 →</button>` : ''}
      <button class="btn big ${r.passed ? '' : 'primary'}" id="again">${r.passed ? '한 번 더 풀기' : '다시 도전하기'}</button>
      <button class="btn big" id="home">목록으로</button>
    </div>`;
  document.getElementById('prog').style.width = '100%';
  nav.innerHTML = '';
  const nb = document.getElementById('nextb');
  if (nb) nb.onclick = () => startQuiz(r.next.unit, r.next.stage);
  document.getElementById('again').onclick = () => startQuiz(r.unit, r.stage);
  document.getElementById('home').onclick = showHome;
}

token ? showHome() : showLogin();
