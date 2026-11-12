/**
 * 내신 영단어 암기 — 서버 (Google Apps Script)
 * 구글 시트 → 확장 프로그램 → Apps Script 에 이 파일 내용을 통째로 붙여넣고
 * 1) 위쪽 함수 선택에서 setup 실행(권한 허용)
 * 2) 배포 → 배포 관리 → ✏️ → 버전: 새 버전 → 배포 (처음이면 새 배포 → 웹 앱, 실행: 나 / 액세스: 모든 사용자)
 */
const TZ = 'Asia/Seoul';
const ADMIN = '관리자';
const T = { words: '단어', students: '학생', teachers: '선생님', settings: '설정', attempts: '시험기록', progress: '진도', wrongs: '오답', schedules: '예약' };
const HEAD = {
  words: ['단원', '단어', '뜻', '유의어', '반의어', '선생님'],
  students: ['반', '이름', '비밀번호'],
  teachers: ['이름', '비밀번호', '담당반'],
  settings: ['항목', '값', '설명'],
  attempts: ['시각', '반', '이름', '단원', '단계', '점수', '문항수', '통과'],
  progress: ['반', '이름', '단원', '단계', '통과일시'],
  wrongs: ['반', '이름', '단원', '단어', '틀린횟수', '최근'],
  schedules: ['이름', '다음 실행', '반복', '설정', '최근 실행', '결과', '사용', '선생님'],
};
const DEFAULT_SETTINGS = [
  ['통과기준', 80, '통과에 필요한 정답률(%)'],
  ['출제문항수', 0, '한 번에 낼 문항 수 (0 = 단원 전체)'],
  ['단원잠금', '예', '예 = 앞 단원을 끝내야 다음 단원이 열림 / 아니오'],
  ['선생님비밀번호', '1234', '관리자(모든 반 보기) 비밀번호 — 꼭 바꾸세요'],
  ['제목', '내신 영단어 암기', '화면 제목'],
  ['반목록', '1반,2반,3반,4반,5반,6반,7반,8반', '학생 로그인 화면에 나올 반 (쉼표로 구분)'],
];
// 반마다 다른 선생님 (이름·비밀번호는 시트 [선생님] 탭에서 바꾸세요)
const SAMPLE_TEACHERS = [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return [n + '반 선생님', String(n).repeat(4), n + '반']; });
const REPEAT = { none: '한 번만', daily: '매일', weekdays: '평일(월~금)', weekly: '매주' };

// ================================================================ 설치

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('구글 시트의 [확장 프로그램 → Apps Script] 메뉴로 연 프로젝트에서 실행해야 합니다.');
  const P = PropertiesService.getScriptProperties();
  P.setProperty('SHEET_ID', ss.getId());
  if (!P.getProperty('SECRET')) P.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(T).forEach(function (k) {
    let s = ss.getSheetByName(T[k]);
    if (!s) { s = ss.insertSheet(T[k]); s.setFrozenRows(1); }
    s.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold');
  });
  ss.getSheetByName(T.students).getRange('C:C').setNumberFormat('@');
  ss.getSheetByName(T.teachers).getRange('B:B').setNumberFormat('@');
  const st = ss.getSheetByName(T.settings);
  const have = {};
  if (st.getLastRow() >= 2) st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().forEach(function (r) { have[String(r[0]).trim()] = 1; });
  const missing = DEFAULT_SETTINGS.filter(function (r) { return !have[r[0]]; });
  if (missing.length) st.getRange(st.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  const tc = ss.getSheetByName(T.teachers);
  if (tc.getLastRow() < 2) tc.getRange(2, 1, SAMPLE_TEACHERS.length, 3).setValues(SAMPLE_TEACHERS);
  const stu = ss.getSheetByName(T.students);
  if (stu.getLastRow() < 2) stu.getRange(2, 1, 1, 3).setValues([['1반', '테스트', '1234']]);
  folder_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDueSchedules') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDueSchedules').timeBased().everyMinutes(5).create();
  ['Sheet1', '시트1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  Logger.log('설치 완료! [배포 → 배포 관리 → ✏️ → 새 버전 → 배포]로 반영하세요.');
}

function folder_() {
  const P = PropertiesService.getScriptProperties();
  const id = P.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 새로 만듦 */ } }
  const f = DriveApp.createFolder('단어 시험지 (자동 저장)');
  P.setProperty('FOLDER_ID', f.getId());
  return f;
}

// ================================================================ 시트 유틸

let _ss = null, _memo = {};
function ss_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}
function sheet_(k) {
  const s = ss_().getSheetByName(T[k]);
  if (!s) throw err_('SETUP', '시트 "' + T[k] + '" 가 없습니다. Apps Script에서 setup을 다시 실행하세요.');
  return s;
}
function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return v === null || v === undefined ? '' : String(v).trim();
}
function table_(k) {
  if (_memo[k]) return _memo[k];
  const s = sheet_(k), n = s.getLastRow();
  const rows = n < 2 ? [] : s.getRange(2, 1, n - 1, HEAD[k].length).getValues().map(function (r) { return r.map(cell_); });
  _memo[k] = rows;
  return rows;
}
function append_(k, rows) {
  if (!rows.length) return;
  const s = sheet_(k);
  s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  delete _memo[k];
}
function rewrite_(k, rows) {
  const s = sheet_(k), n = s.getLastRow(), w = HEAD[k].length;
  if (n >= 2) s.getRange(2, 1, n - 1, w).clearContent();
  if (rows.length) s.getRange(2, 1, rows.length, w).setValues(rows);
  delete _memo[k];
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function err_(code, msg) { const e = new Error(msg || code); e.code = code; return e; }
function splitList_(s) { return String(s || '').split(/[,;\/·|]/).map(function (x) { return x.trim(); }).filter(String); }
function shuffle_(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function sameText_(a, b) {
  a = String(a).trim(); b = String(b).trim();
  return a === b || (/^\d+$/.test(a) && /^\d+$/.test(b) && Number(a) === Number(b));
}
function skey_(klass, name) { return klass + '|' + name; }
function uniq_(a) { const o = {}; return a.filter(function (x) { if (o[x]) return false; o[x] = 1; return true; }); }

function settings_() {
  if (_memo.S) return _memo.S;
  const o = {};
  table_('settings').forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  _memo.S = {
    passRate: Number(o['통과기준']) || 80,
    qPer: Number(o['출제문항수']) || 0,
    lock: !/^(아니|n|no|false|0|x)/i.test(o['단원잠금'] || '예'),
    pw: o['선생님비밀번호'] || '1234',
    title: o['제목'] || '내신 영단어 암기',
    classes: splitList_(o['반목록'] || '1반,2반,3반,4반,5반,6반,7반,8반'),
  };
  return _memo.S;
}

// ---------------- 선생님 / 반 / 단어 범위

function teachers_() {
  return table_('teachers').filter(function (r) { return r[0]; })
    .map(function (r) { return { name: r[0], pw: r[1], classes: splitList_(r[2]) }; });
}
function classTeacher_() {
  const m = {};
  teachers_().forEach(function (t) { t.classes.forEach(function (c) { if (!m[c]) m[c] = t.name; }); });
  return m;
}
function allClasses_() {
  const fromStudents = table_('students').filter(function (r) { return r[1]; }).map(function (r) { return r[0]; });
  const base = settings_().classes;
  return uniq_(base.concat(fromStudents.filter(function (c) { return base.indexOf(c) < 0; }).sort()));
}

function words_() {
  if (_memo.W) return _memo.W;
  _memo.W = table_('words').filter(function (r) { return r[1] && r[2]; }).map(function (r) {
    const unit = r[0] || '기본';
    return { id: unit + '|' + r[1], unit: unit, word: r[1], meaning: r[2], syn: splitList_(r[3]), ant: splitList_(r[4]), owner: r[5] || '' };
  });
  return _memo.W;
}
/** 선생님의 단어 (본인 단어 + 공통 단어). 같은 단원·단어가 겹치면 본인 것이 우선 */
function poolForTeacher_(name) {
  const mine = {}, out = [];
  words_().forEach(function (w) { if (name && w.owner === name) mine[w.id] = 1; });
  words_().forEach(function (w) {
    if (w.owner === name && name) out.push(w);
    else if (!w.owner && !mine[w.id]) out.push(w);
  });
  return out;
}
function poolForClass_(klass) { return poolForTeacher_(classTeacher_()[klass] || ''); }

function units_(ws) {
  const order = [], m = {};
  ws.forEach(function (w) {
    if (!m[w.unit]) { m[w.unit] = { name: w.unit, n: 0, nrel: 0 }; order.push(w.unit); }
    m[w.unit].n++;
    if (w.syn.length || w.ant.length) m[w.unit].nrel++;
  });
  return order.map(function (u) { return m[u]; });
}

function unitStatus_(ws, progressRows, klass, name, lock) {
  const passed = {};
  progressRows.forEach(function (r) { if (r[0] === klass && r[1] === name) passed[r[2] + '|' + r[3]] = r[4]; });
  let prevDone = true;
  return units_(ws).map(function (u) {
    const s1 = !!passed[u.name + '|1'];
    const has2 = u.nrel > 0;
    const s2 = !!passed[u.name + '|2'] || !has2;
    const unlocked = prevDone || !lock;
    const st = {
      name: u.name, n: u.n, has2: has2, s1: s1, s2: s2, unlocked: unlocked,
      s1Open: unlocked, s2Open: unlocked && s1 && has2, done: s1 && s2,
      s1At: passed[u.name + '|1'] || '', s2At: passed[u.name + '|2'] || '',
    };
    prevDone = lock ? (prevDone && s1 && s2) : true;
    return st;
  });
}

function position_(status) {
  for (let i = 0; i < status.length; i++) {
    if (!status[i].s1) return status[i].name + ' · 1단계';
    if (!status[i].s2) return status[i].name + ' · 2단계';
  }
  return status.length ? '모두 완료' : '-';
}

// ================================================================ 문제 생성

function pickDistractors_(correct, groups, n, exclude) {
  const seen = {};
  seen[String(correct).toLowerCase()] = 1;
  (exclude || []).forEach(function (e) { seen[String(e).toLowerCase()] = 1; });
  const out = [];
  for (let g = 0; g < groups.length; g++) {
    const grp = shuffle_(groups[g].slice());
    for (let i = 0; i < grp.length; i++) {
      const c = String(grp[i] || '').trim(), k = c.toLowerCase();
      if (k && !seen[k]) { seen[k] = 1; out.push(c); if (out.length >= n) return out; }
    }
  }
  return out;
}

function makeQuestion_(w, qtype, unitPool, pool) {
  let prompt, ask, correct, groups, sub = '', exclude = [];
  const others = function (arr, f) { return arr.filter(function (p) { return p.id !== w.id; }).map(f); };
  if (qtype === 'en2ko') {
    prompt = w.word; ask = '알맞은 뜻을 고르세요'; correct = w.meaning;
    groups = [others(unitPool, function (p) { return p.meaning; }), others(pool, function (p) { return p.meaning; })];
  } else if (qtype === 'ko2en') {
    prompt = w.meaning; ask = '알맞은 영어 단어를 고르세요'; correct = w.word;
    groups = [others(unitPool, function (p) { return p.word; }), others(pool, function (p) { return p.word; })];
  } else {
    const target = qtype === 'syn' ? w.syn : w.ant, opp = qtype === 'syn' ? w.ant : w.syn;
    correct = target[Math.floor(Math.random() * target.length)];
    prompt = w.word; sub = w.meaning;
    ask = qtype === 'syn' ? '유의어(비슷한 뜻)를 고르세요' : '반의어(반대 뜻)를 고르세요';
    exclude = target.concat([w.word]);
    const related = function (arr) {
      let r = [];
      arr.forEach(function (p) { if (p.id !== w.id) r = r.concat([p.word], p.syn, p.ant); });
      return r;
    };
    groups = [opp.slice(0, 1), related(unitPool), related(pool)];
  }
  const choices = shuffle_(pickDistractors_(correct, groups, 3, exclude).concat([correct]));
  return { wid: w.id, unit: w.unit, word: w.word, meaning: w.meaning, qtype: qtype, prompt: prompt, sub: sub, ask: ask,
           choices: choices, answer: choices.indexOf(correct) };
}

function buildStageQuiz_(ws, unit, stage, qPer) {
  const unitPool = ws.filter(function (w) { return w.unit === unit; });
  let qs = [];
  unitPool.forEach(function (w) {
    if (stage === 1) qs.push(makeQuestion_(w, Math.random() < 0.67 ? 'en2ko' : 'ko2en', unitPool, ws));
    else {
      if (w.syn.length) qs.push(makeQuestion_(w, 'syn', unitPool, ws));
      if (w.ant.length) qs.push(makeQuestion_(w, 'ant', unitPool, ws));
    }
  });
  shuffle_(qs);
  if (qPer > 0) qs = qs.slice(0, qPer);
  return qs;
}

// ================================================================ 인증

function secret_() { return PropertiesService.getScriptProperties().getProperty('SECRET') || 'not-set-run-setup'; }
function b64_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8); }
function unb64_(s) { return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString('UTF-8'); }
function sign_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())); }
function hex_(bytes) { return bytes.map(function (b) { return ((b + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function makeToken_(o) {
  o.e = Date.now() + 1000 * 60 * 60 * 24 * 60;
  const p = b64_(JSON.stringify(o));
  return p + '.' + sign_(p);
}
function readToken_(t, role) {
  const parts = String(t || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw err_('AUTH', '다시 로그인해 주세요.');
  const o = JSON.parse(unb64_(parts[0]));
  if (o.e < Date.now() || o.r !== role) throw err_('AUTH', '다시 로그인해 주세요.');
  return o;
}
/** 선생님 토큰 확인 → { name, admin, classes } */
function teacher_(token) {
  const o = readToken_(token, 't');
  const name = o.u || ADMIN;
  if (name === ADMIN) {
    if (o.v !== sign_(ADMIN + ':' + settings_().pw).slice(0, 10)) throw err_('AUTH', '비밀번호가 바뀌었습니다. 다시 로그인하세요.');
    return { name: ADMIN, admin: true, classes: allClasses_() };
  }
  const t = teachers_().filter(function (x) { return x.name === name; })[0];
  if (!t || o.v !== sign_(name + ':' + t.pw).slice(0, 10)) throw err_('AUTH', '다시 로그인해 주세요.');
  return { name: name, admin: false, classes: t.classes };
}
function inScope_(me, klass) { return me.admin || me.classes.indexOf(klass) >= 0; }
function checkFails_(key) {
  const c = CacheService.getScriptCache(), n = Number(c.get('f:' + key) || 0);
  if (n >= 8) throw err_('LOCKED', '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요.');
  return function () { c.put('f:' + key, String(n + 1), 600); };
}

// ================================================================ 웹 API

function doGet() {
  return json_({ ok: true, message: '단어 암기 서버가 작동 중입니다.' });
}
function doPost(e) {
  let out;
  _memo = {};
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = API[req.action];
    if (!fn) throw err_('BAD', '알 수 없는 요청: ' + req.action + ' (Apps Script를 새 버전으로 다시 배포했는지 확인하세요)');
    out = { ok: true, data: fn(req) };
  } catch (x) {
    out = { ok: false, error: x.code || 'ERROR', message: x.message };
  }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const API = {
  bootstrap: function () {
    return { title: settings_().title, classes: allClasses_(), teachers: teachers_().map(function (t) { return t.name; }) };
  },

  // ---------------- 학생
  login: function (q) {
    const klass = String(q.klass || '').trim(), name = String(q.name || '').trim();
    const fail = checkFails_(skey_(klass, name));
    const st = table_('students').filter(function (r) { return r[0] === klass && r[1] === name; })[0];
    if (!st || !sameText_(st[2], q.pin)) { fail(); throw err_('LOGIN', '반, 이름, 비밀번호를 다시 확인해 주세요.'); }
    return { token: makeToken_({ r: 's', k: klass, n: name }), klass: klass, name: name };
  },

  home: function (q) {
    const me = readToken_(q.token, 's'), S = settings_(), ws = poolForClass_(me.k);
    const status = unitStatus_(ws, table_('progress'), me.k, me.n, S.lock);
    const wmap = {};
    ws.forEach(function (w) { wmap[w.id] = w; });
    const review = table_('wrongs').filter(function (r) { return r[0] === me.k && r[1] === me.n && wmap[r[2] + '|' + r[3]]; })
      .sort(function (a, b) { return Number(b[4]) - Number(a[4]); }).slice(0, 15)
      .map(function (r) { const w = wmap[r[2] + '|' + r[3]]; return { word: w.word, meaning: w.meaning, syn: w.syn.join(', '), ant: w.ant.join(', '), cnt: Number(r[4]) }; });
    return { klass: me.k, name: me.n, title: S.title, passRate: S.passRate, units: status, position: position_(status), review: review };
  },

  startQuiz: function (q) {
    const me = readToken_(q.token, 's'), S = settings_(), ws = poolForClass_(me.k);
    const stage = Number(q.stage) === 2 ? 2 : 1;
    const u = unitStatus_(ws, table_('progress'), me.k, me.n, S.lock).filter(function (x) { return x.name === q.unit; })[0];
    if (!u || (stage === 1 && !u.s1Open) || (stage === 2 && !u.s2Open)) throw err_('LOCKED', '아직 열리지 않은 단계예요. 앞 단계를 먼저 통과하세요!');
    const qs = buildStageQuiz_(ws, q.unit, stage, S.qPer);
    if (!qs.length) throw err_('EMPTY', '출제할 문제가 없습니다. 선생님께 문의하세요.');
    const id = Utilities.getUuid();
    CacheService.getScriptCache().put('q:' + id, JSON.stringify({ k: me.k, n: me.n, unit: q.unit, stage: stage, qs: qs }), 21600);
    return {
      quizId: id, unit: q.unit, stage: stage, passRate: S.passRate,
      questions: qs.map(function (x, i) {
        return { prompt: x.prompt, sub: x.sub, ask: x.ask, qtype: x.qtype, choices: x.choices,
                 h: sha_(id + ':' + i + ':' + x.answer), x: b64_(JSON.stringify({ w: x.word, m: x.meaning })) };
      }),
    };
  },

  finishQuiz: function (q) {
    const me = readToken_(q.token, 's'), cache = CacheService.getScriptCache();
    const raw = cache.get('q:' + q.quizId);
    if (!raw) throw err_('EXPIRED', '시험 시간이 너무 지났어요. 다시 시작해 주세요.');
    const quiz = JSON.parse(raw);
    if (quiz.k !== me.k || quiz.n !== me.n) throw err_('AUTH', '다시 로그인해 주세요.');
    if (quiz.result) return quiz.result;
    const S = settings_(), choices = q.choices || [], ts = now_();
    let score = 0;
    const wrong = [];
    quiz.qs.forEach(function (x, i) {
      if (Number(choices[i]) === x.answer) score++;
      else wrong.push({ unit: x.unit, word: x.word, meaning: x.meaning, qtype: x.qtype, answer: x.choices[x.answer] });
    });
    const total = quiz.qs.length, passed = total > 0 && score * 100 >= S.passRate * total;
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      _memo = {};
      append_('attempts', [[ts, me.k, me.n, quiz.unit, quiz.stage, score, total, passed ? 'O' : 'X']]);
      if (passed) {
        const already = table_('progress').some(function (r) { return r[0] === me.k && r[1] === me.n && r[2] === quiz.unit && Number(r[3]) === quiz.stage; });
        if (!already) append_('progress', [[me.k, me.n, quiz.unit, quiz.stage, ts]]);
      }
      if (wrong.length) {
        const s = sheet_('wrongs'), rows = table_('wrongs'), idx = {};
        rows.forEach(function (r, i) { idx[r.slice(0, 4).join('|')] = i; });
        const add = [];
        wrong.forEach(function (w) {
          const key = [me.k, me.n, w.unit, w.word].join('|');
          if (idx[key] !== undefined && idx[key] >= 0) {
            const i = idx[key];
            rows[i][4] = Number(rows[i][4]) + 1;
            s.getRange(i + 2, 5, 1, 2).setValues([[rows[i][4], ts]]);
          } else if (idx[key] === undefined) {
            idx[key] = -1;
            add.push([me.k, me.n, w.unit, w.word, 1, ts]);
          }
        });
        append_('wrongs', add);
      }
    } finally { lock.releaseLock(); }
    const status = unitStatus_(poolForClass_(me.k), table_('progress'), me.k, me.n, S.lock);
    let next = null;
    for (let i = 0; i < status.length && !next; i++) {
      if (status[i].s1Open && !status[i].s1) next = { unit: status[i].name, stage: 1 };
      else if (status[i].s2Open && !status[i].s2) next = { unit: status[i].name, stage: 2 };
    }
    const result = { score: score, total: total, passed: passed, passRate: S.passRate, unit: quiz.unit, stage: quiz.stage, wrong: wrong, next: next };
    quiz.result = result;
    cache.put('q:' + q.quizId, JSON.stringify(quiz), 21600);
    return result;
  },

  // ---------------- 선생님: 로그인 / 현황
  tLogin: function (q) {
    const name = String(q.name || ADMIN).trim();
    const fail = checkFails_('t:' + name);
    let pw;
    if (name === ADMIN) pw = settings_().pw;
    else {
      const t = teachers_().filter(function (x) { return x.name === name; })[0];
      pw = t ? t.pw : null;
    }
    if (pw === null || !sameText_(pw, q.password || '')) { fail(); throw err_('LOGIN', '이름이나 비밀번호가 올바르지 않습니다.'); }
    return { token: makeToken_({ r: 't', u: name, v: sign_(name + ':' + pw).slice(0, 10) }), name: name };
  },

  tDashboard: function (q) {
    const me = teacher_(q.token), S = settings_();
    const progress = table_('progress'), attempts = table_('attempts'), wrongs = table_('wrongs');
    const ct = classTeacher_();
    const att = {}, wcount = {};
    attempts.forEach(function (r) {
      const k = skey_(r[1], r[2]);
      const a = att[k] || (att[k] = { n: 0, p: 0, sc: 0, tot: 0, last: '' });
      a.n++; if (r[7] === 'O') a.p++; a.sc += Number(r[5]) || 0; a.tot += Number(r[6]) || 0;
      if (r[0] > a.last) a.last = r[0];
    });
    wrongs.forEach(function (r) { const k = skey_(r[0], r[1]); wcount[k] = (wcount[k] || 0) + 1; });
    const today = now_().slice(0, 10), activeToday = {};
    attempts.forEach(function (r) { if (r[0].slice(0, 10) === today) activeToday[skey_(r[1], r[2])] = 1; });
    const pools = {};
    const poolOf = function (klass) { const t = ct[klass] || ''; return pools[t] || (pools[t] = poolForTeacher_(t)); };
    const students = table_('students').filter(function (r) { return r[1] && inScope_(me, r[0]); }).map(function (r) {
      const k = skey_(r[0], r[1]), a = att[k], pool = poolOf(r[0]);
      const status = unitStatus_(pool, progress, r[0], r[1], S.lock);
      return {
        klass: r[0], name: r[1], position: position_(status),
        unitsDone: status.filter(function (u) { return u.done; }).length, unitsTotal: status.length,
        attempts: a ? a.n : 0, passes: a ? a.p : 0, sc: a ? a.sc : 0, tot: a ? a.tot : 0,
        accuracy: a && a.tot ? Math.round(100 * a.sc / a.tot) : null,
        last: a ? a.last.slice(0, 16) : '', wrongWords: wcount[k] || 0, today: !!activeToday[k],
      };
    });
    const order = me.classes;
    students.sort(function (a, b) {
      const ia = order.indexOf(a.klass), ib = order.indexOf(b.klass);
      return (ia - ib) || a.name.localeCompare(b.name, 'ko');
    });
    // 반별 요약
    const classSummary = me.classes.map(function (c) {
      const list = students.filter(function (s) { return s.klass === c; });
      const sc = list.reduce(function (x, s) { return x + s.sc; }, 0), tot = list.reduce(function (x, s) { return x + s.tot; }, 0);
      const prog = list.length ? Math.round(100 * list.reduce(function (x, s) { return x + (s.unitsTotal ? s.unitsDone / s.unitsTotal : 0); }, 0) / list.length) : 0;
      return { klass: c, teacher: ct[c] || '', n: list.length, progress: prog, accuracy: tot ? Math.round(100 * sc / tot) : null,
               activeToday: list.filter(function (s) { return s.today; }).length,
               allDone: list.filter(function (s) { return s.unitsTotal && s.unitsDone === s.unitsTotal; }).length };
    });
    const agg = {};
    wrongs.forEach(function (r) {
      if (!inScope_(me, r[0]) || (q.klass && r[0] !== q.klass)) return;
      const k = r[2] + '|' + r[3];
      const a = agg[k] || (agg[k] = { unit: r[2], word: r[3], c: 0, s: 0, klass: r[0] });
      a.c += Number(r[4]) || 0; a.s++;
    });
    const top = Object.keys(agg).map(function (k) {
      const w = poolOf(agg[k].klass).filter(function (x) { return x.id === k; })[0];
      agg[k].meaning = w ? w.meaning : '';
      return agg[k];
    }).sort(function (a, b) { return b.c - a.c; }).slice(0, 15);
    const myPool = me.admin ? words_() : poolForTeacher_(me.name);
    return {
      me: { name: me.name, admin: me.admin, classes: me.classes },
      title: S.title, students: students, classSummary: classSummary, topWrong: top,
      nWords: myPool.length, nUnits: units_(myPool).length,
      activeToday: students.filter(function (s) { return s.today; }).length,
      sheetUrl: me.admin ? ss_().getUrl() : '', folderUrl: me.admin ? folder_().getUrl() : '',
      defaultPw: me.admin && String(S.pw) === '1234', passRate: S.passRate,
    };
  },

  tStudent: function (q) {
    const me = teacher_(q.token);
    if (!inScope_(me, q.klass)) throw err_('FORBIDDEN', '담당 반 학생이 아닙니다.');
    const S = settings_(), ws = poolForClass_(q.klass), wm = {};
    ws.forEach(function (w) { wm[w.id] = w; });
    const status = unitStatus_(ws, table_('progress'), q.klass, q.name, S.lock);
    const mine = table_('attempts').filter(function (r) { return r[1] === q.klass && r[2] === q.name; });
    const stats = {};
    mine.forEach(function (r) {
      const k = r[3] + '|' + r[4], pct = Number(r[6]) ? Math.round(100 * Number(r[5]) / Number(r[6])) : 0;
      const s = stats[k] || (stats[k] = { n: 0, best: 0 });
      s.n++; s.best = Math.max(s.best, pct);
    });
    const history = mine.slice(-40).reverse().map(function (r) {
      return { at: r[0].slice(0, 16), unit: r[3], stage: Number(r[4]), score: Number(r[5]), total: Number(r[6]), passed: r[7] === 'O' };
    });
    const wrong = table_('wrongs').filter(function (r) { return r[0] === q.klass && r[1] === q.name; })
      .sort(function (a, b) { return Number(b[4]) - Number(a[4]); })
      .map(function (r) { const w = wm[r[2] + '|' + r[3]]; return { unit: r[2], word: r[3], meaning: w ? w.meaning : '(삭제된 단어)', cnt: Number(r[4]), last: r[5].slice(0, 10) }; });
    return { klass: q.klass, name: q.name, position: position_(status), units: status, stats: stats, history: history, wrong: wrong };
  },

  // ---------------- 선생님: 학생 관리
  tStudents: function (q) {
    const me = teacher_(q.token);
    const list = table_('students').filter(function (r) { return r[1] && inScope_(me, r[0]); })
      .map(function (r) { return { klass: r[0], name: r[1], pin: r[2] }; });
    return { classes: me.classes, students: list };
  },

  tAddStudents: function (q) {
    const me = teacher_(q.token);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const existing = {};
      table_('students').forEach(function (r) { existing[skey_(r[0], r[1])] = 1; });
      const add = [], skipped = [], denied = [];
      (q.rows || []).slice(0, 500).forEach(function (r) {
        const klass = String(r[0] || '').trim(), name = String(r[1] || '').trim();
        let pin = String(r[2] || '').trim();
        if (!name) return;
        if (!inScope_(me, klass)) { denied.push(klass + ' ' + name); return; }
        if (existing[skey_(klass, name)]) { skipped.push(klass + ' ' + name); return; }
        if (!pin) pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        existing[skey_(klass, name)] = 1;
        add.push([klass, name, "'" + pin]);
      });
      append_('students', add);
      return { added: add.length, skipped: skipped, denied: denied };
    } finally { lock.releaseLock(); }
  },

  tStudentAction: function (q) {
    const me = teacher_(q.token);
    if (!inScope_(me, q.klass)) throw err_('FORBIDDEN', '담당 반 학생이 아닙니다.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const s = sheet_('students'), rows = table_('students');
      const i = rows.findIndex(function (r) { return r[0] === q.klass && r[1] === q.name; });
      if (i < 0) throw err_('BAD', '학생을 찾을 수 없습니다.');
      if (q.op === 'pin') {
        const pin = String(q.pin || '').trim() || String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        s.getRange(i + 2, 3).setValue("'" + pin);
        return { pin: pin };
      }
      if (q.op === 'delete') { s.deleteRow(i + 2); return { ok: true }; }
      if (q.op === 'resetProgress') {
        rewrite_('progress', table_('progress').filter(function (r) { return !(r[0] === q.klass && r[1] === q.name); }));
        return { ok: true };
      }
      throw err_('BAD', '알 수 없는 작업');
    } finally { lock.releaseLock(); }
  },

  // ---------------- 선생님: 단어 관리
  tWords: function (q) {
    const me = teacher_(q.token);
    const owner = me.admin ? String(q.owner || '') : me.name;
    const ws = words_().filter(function (w) { return w.owner === owner; });
    const shared = me.admin ? [] : words_().filter(function (w) { return !w.owner; });
    const pack = function (arr) {
      return units_(arr).map(function (u) {
        return { name: u.name, n: u.n, nrel: u.nrel,
                 words: arr.filter(function (w) { return w.unit === u.name; }).map(function (w) { return [w.word, w.meaning, w.syn.join(', '), w.ant.join(', ')]; }) };
      });
    };
    return { owner: owner, admin: me.admin, teachers: teachers_().map(function (t) { return t.name; }), units: pack(ws), shared: pack(shared) };
  },

  tUploadWords: function (q) {
    const me = teacher_(q.token);
    const owner = me.admin ? String(q.owner || '') : me.name;
    const rows = (q.rows || []).slice(0, 5000).map(function (r) {
      return [String(r[0] || '').trim() || '기본', String(r[1] || '').trim(), String(r[2] || '').trim(),
              splitList_(r[3]).join(', '), splitList_(r[4]).join(', '), owner];
    }).filter(function (r) { return r[1] && r[2]; });
    if (!rows.length) throw err_('EMPTY', '올릴 단어가 없습니다. 파일의 열(단원·단어·뜻)을 확인하세요.');
    const mode = q.mode || 'units';
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const upUnits = {};
      rows.forEach(function (r) { upUnits[r[0]] = 1; });
      let keep = table_('words').filter(function (r) { return r[1] || r[2]; }).map(function (r) { return r.slice(0, 6); });
      const before = keep.filter(function (r) { return (r[5] || '') === owner; }).length;
      if (mode === 'all') keep = keep.filter(function (r) { return (r[5] || '') !== owner; });
      else if (mode === 'units') keep = keep.filter(function (r) { return !((r[5] || '') === owner && upUnits[r[0] || '기본']); });
      // 추가·수정(merge): 같은 단원+단어는 새 값으로
      const idx = {};
      keep.forEach(function (r, i) { if ((r[5] || '') === owner) idx[(r[0] || '기본') + '|' + r[1].toLowerCase()] = i; });
      let added = 0, updated = 0;
      rows.forEach(function (r) {
        const k = r[0] + '|' + r[1].toLowerCase();
        if (idx[k] !== undefined) { keep[idx[k]] = r; updated++; }
        else { idx[k] = keep.length; keep.push(r); added++; }
      });
      rewrite_('words', keep);
      const after = keep.filter(function (r) { return (r[5] || '') === owner; }).length;
      return { owner: owner, uploaded: rows.length, added: added, updated: updated, removed: Math.max(0, before + added - after),
               units: Object.keys(upUnits) };
    } finally { lock.releaseLock(); }
  },

  tDeleteUnit: function (q) {
    const me = teacher_(q.token);
    const owner = me.admin ? String(q.owner || '') : me.name;
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const all = table_('words').map(function (r) { return r.slice(0, 6); });
      const keep = all.filter(function (r) { return !((r[5] || '') === owner && (r[0] || '기본') === q.unit) && (r[1] || r[2]); });
      rewrite_('words', keep);
      return { removed: all.length - keep.length };
    } finally { lock.releaseLock(); }
  },

  // ---------------- 선생님: 시험지 / 예약
  tFormData: function (q) {
    const me = teacher_(q.token);
    const students = table_('students').filter(function (r) { return r[1] && inScope_(me, r[0]); }).map(function (r) { return skey_(r[0], r[1]); });
    const pool = me.admin ? words_() : poolForTeacher_(me.name);
    return { classes: me.classes, students: students, units: units_(pool).map(function (u) { return u.name; }) };
  },

  tSheet: function (q) {
    const me = teacher_(q.token);
    const r = buildSheet_(scopeCfg_(me, q.cfg || {}));
    if (!r) throw err_('EMPTY', '만들 시험지가 없습니다. 학생(또는 반)을 골랐는지, 단어 수를 확인하세요.');
    return r;
  },

  tSaveSheet: function (q) {
    const me = teacher_(q.token);
    const r = buildSheet_(scopeCfg_(me, q.cfg || {}));
    if (!r) throw err_('EMPTY', '만들 시험지가 없습니다.');
    return savePdf_(r.html, (q.cfg && q.cfg.title) || '영단어 시험', me.name);
  },

  tSchedules: function (q) {
    const me = teacher_(q.token);
    const list = [];
    table_('schedules').forEach(function (r, i) {
      if (!me.admin && r[7] !== me.name) return;
      let cfg = {};
      try { cfg = JSON.parse(r[3] || '{}'); } catch (e) { /* 무시 */ }
      list.push({ row: i + 2, name: r[0], runAt: r[1].slice(0, 16), repeat: r[2], repeatLabel: REPEAT[r[2]] || r[2], cfg: cfg,
                  lastRun: r[4].slice(0, 16), result: r[5], active: r[6] !== 'N', owner: r[7] });
    });
    const files = [], it = folder_().getFiles();
    while (it.hasNext() && files.length < 500) {
      const f = it.next(), name = f.getName();
      if (!me.admin && name.indexOf('_' + me.name + '_') < 0) continue;
      files.push({ name: name, url: f.getUrl(), at: Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd HH:mm') });
    }
    files.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return { schedules: list, files: files.slice(0, 40), folderUrl: me.admin ? folder_().getUrl() : '', repeats: REPEAT };
  },

  tAddSchedule: function (q) {
    const me = teacher_(q.token);
    const runAt = String(q.runAt || '').replace('T', ' ').slice(0, 16);
    if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(runAt)) throw err_('BAD', '예약 시간을 입력하세요.');
    const cfg = scopeCfg_(me, q.cfg || {});
    const name = String(q.name || '').trim() || cfg.title || '예약 시험지';
    append_('schedules', [[name, "'" + runAt, REPEAT[q.repeat] ? q.repeat : 'none', JSON.stringify(cfg), '', '', 'Y', me.name]]);
    return { ok: true };
  },

  tScheduleAction: function (q) {
    const me = teacher_(q.token);
    const s = sheet_('schedules'), row = Number(q.row);
    if (!(row >= 2 && row <= s.getLastRow())) throw err_('BAD', '예약을 찾을 수 없습니다.');
    const owner = cell_(s.getRange(row, 8).getValue());
    if (!me.admin && owner !== me.name) throw err_('FORBIDDEN', '다른 선생님의 예약입니다.');
    if (q.op === 'delete') { s.deleteRow(row); return { ok: true }; }
    if (q.op === 'toggle') {
      const cur = cell_(s.getRange(row, 7).getValue());
      s.getRange(row, 7).setValue(cur === 'N' ? 'Y' : 'N');
      return { ok: true };
    }
    if (q.op === 'run') return { message: executeSchedule_(row, false) };
    throw err_('BAD', '알 수 없는 작업');
  },
};

/** 선생님이 고른 반·학생 중 담당 반만 남김 */
function scopeCfg_(me, cfg) {
  const c = JSON.parse(JSON.stringify(cfg));
  if (!me.admin) {
    c.classes = (c.classes || []).filter(function (k) { return me.classes.indexOf(k) >= 0; });
    c.students = (c.students || []).filter(function (k) { return me.classes.indexOf(String(k).split('|')[0]) >= 0; });
  }
  return c;
}

// ================================================================ 시험지

function buildSheet_(cfg) {
  const ct = classTeacher_(), pools = {};
  const poolOf = function (klass) { const t = ct[klass] || ''; return pools[t] || (pools[t] = poolForTeacher_(t)); };
  const allStudents = table_('students').filter(function (r) { return r[1]; });
  const want = {};
  (cfg.students || []).forEach(function (k) { want[k] = 1; });
  const classes = cfg.classes || [];
  const targets = allStudents.filter(function (r) { return want[skey_(r[0], r[1])] || classes.indexOf(r[0]) >= 0; })
    .map(function (r) { return { klass: r[0], name: r[1] }; });
  const nWrong = Math.max(0, Number(cfg.wrongCount) || 0), nRand = Math.max(0, Number(cfg.randomCount) || 0);
  const days = Number(cfg.days) || 0, fill = cfg.fill !== false;
  const units = cfg.units || [];
  const wrongs = table_('wrongs');
  const since = days > 0 ? Utilities.formatDate(new Date(Date.now() - days * 864e5), TZ, 'yyyy-MM-dd HH:mm:ss') : '';

  function compose(keys, pool) {
    const wm = {};
    pool.forEach(function (w) { wm[w.id] = w; });
    const agg = {};
    wrongs.forEach(function (r) {
      if (!keys[skey_(r[0], r[1])] || (since && r[5] < since)) return;
      const id = r[2] + '|' + r[3];
      if (wm[id]) agg[id] = (agg[id] || 0) + (Number(r[4]) || 0);
    });
    const ww = nWrong ? Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; }).slice(0, nWrong).map(function (id) { return wm[id]; }) : [];
    const chosen = {};
    ww.forEach(function (w) { chosen[w.id] = 1; });
    const need = nRand + (fill ? nWrong - ww.length : 0);
    const randPool = pool.filter(function (w) { return !chosen[w.id] && (!units.length || units.indexOf(w.unit) >= 0); });
    const rr = shuffle_(randPool).slice(0, need);
    return { words: ww.concat(rr), nw: ww.length, nr: rr.length };
  }

  const tests = [];
  if (cfg.mode === 'class') {
    // 반마다 단어장이 다를 수 있으므로 반별로 1장씩
    const byClass = {};
    targets.forEach(function (t) { (byClass[t.klass] = byClass[t.klass] || []).push(t); });
    Object.keys(byClass).forEach(function (klass) {
      const keys = {};
      byClass[klass].forEach(function (t) { keys[skey_(t.klass, t.name)] = 1; });
      const pool = poolOf(klass), c = compose(keys, pool);
      if (c.words.length) tests.push({ klass: klass, name: '', nw: c.nw, nr: c.nr, sections: sheetQuestions_(c.words, cfg, pool) });
    });
  } else {
    targets.forEach(function (t) {
      const keys = {};
      keys[skey_(t.klass, t.name)] = 1;
      const pool = poolOf(t.klass), c = compose(keys, pool);
      if (c.words.length) tests.push({ klass: t.klass, name: t.name, nw: c.nw, nr: c.nr, sections: sheetQuestions_(c.words, cfg, pool) });
    });
  }
  if (!tests.length) return null;
  return { html: renderSheetHtml_(tests, cfg.title || '영단어 시험', cfg.key !== false, settings_().title), count: tests.length };
}

function sheetQuestions_(words, cfg, pool) {
  const fmt = cfg.format || 'mixed', mc = [], write = [], rel = [];
  words.forEach(function (w) {
    const kind = fmt !== 'mixed' ? fmt : ['mc', 'write_meaning', 'write_word'][Math.floor(Math.random() * 3)];
    if (kind === 'mc') mc.push(makeQuestion_(w, Math.random() < 0.5 ? 'en2ko' : 'ko2en', pool, pool));
    else if (kind === 'write_word') write.push({ prompt: w.meaning, answer: w.word });
    else write.push({ prompt: w.word, answer: w.meaning });
    if (cfg.rel) {
      const types = [];
      if (w.syn.length) types.push('syn');
      if (w.ant.length) types.push('ant');
      if (types.length) rel.push(makeQuestion_(w, types[Math.floor(Math.random() * types.length)], pool, pool));
    }
  });
  const secs = [];
  if (mc.length) secs.push({ title: '객관식 — 알맞은 것을 고르세요', kind: 'mc', items: shuffle_(mc) });
  if (write.length) secs.push({ title: '주관식 — 빈칸에 쓰세요', kind: 'write', items: shuffle_(write) });
  if (rel.length) secs.push({ title: '유의어 · 반의어', kind: 'mc', items: shuffle_(rel) });
  return secs;
}

function h_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
const CIRC = ['①', '②', '③', '④'];
const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];

function renderSheetHtml_(tests, title, withKey, footer) {
  const date = Utilities.formatDate(new Date(), TZ, 'yyyy. MM. dd.');
  let body = '';
  const keys = [];
  tests.forEach(function (t, ti) {
    const total = t.sections.reduce(function (a, s) { return a + s.items.length; }, 0);
    body += '<div class="test"' + (ti ? ' style="page-break-before:always"' : '') + '>';
    body += '<h1>' + h_(title) + '</h1><p class="meta">틀린 단어 ' + t.nw + '개 + 랜덤 ' + t.nr + '개 · 총 ' + total + '문항</p>';
    body += '<table class="info"><tr><td>반: ' + h_(t.klass) + '</td><td>이름: ' + h_(t.name) + '</td><td>날짜: ' + date +
            '</td><td>점수: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / ' + total + '</td></tr></table>';
    let n = 1;
    const key = [];
    t.sections.forEach(function (s, si) {
      body += '<h2>' + ROMAN[si] + '. ' + h_(s.title) + '</h2>';
      if (s.kind === 'mc') {
        s.items.forEach(function (q) {
          let head;
          if (q.qtype === 'syn' || q.qtype === 'ant') head = '<b>' + h_(q.prompt) + '</b> (' + h_(q.sub) + ') 의 ' + (q.qtype === 'syn' ? '유의어' : '반의어') + '는?';
          else if (q.qtype === 'en2ko') head = '<b>' + h_(q.prompt) + '</b> 의 뜻은?';
          else head = '‘' + h_(q.prompt) + '’ 에 해당하는 영어 단어는?';
          body += '<table class="mc"><tr><td colspan="4" class="qh"><b>' + n + '.</b> ' + head + '</td></tr><tr>' +
                  q.choices.map(function (c, i) { return '<td class="ch">' + CIRC[i] + ' ' + h_(c) + '</td>'; }).join('') +
                  (q.choices.length < 4 ? '<td></td>'.repeat(4 - q.choices.length) : '') + '</tr></table>';
          key.push(n + '. ' + CIRC[q.answer] + ' ' + q.choices[q.answer] + (q.qtype === 'syn' ? ' (유의어)' : q.qtype === 'ant' ? ' (반의어)' : ''));
          n++;
        });
      } else {
        body += '<table class="wr">';
        for (let i = 0; i < s.items.length; i += 2) {
          body += '<tr>';
          for (let j = i; j < i + 2; j++) {
            const q = s.items[j];
            if (q) { body += '<td class="wq"><b>' + n + '.</b> ' + h_(q.prompt) + '</td><td class="blank"></td>'; key.push(n + '. ' + q.answer); n++; }
            else body += '<td></td><td></td>';
          }
          body += '</tr>';
        }
        body += '</table>';
      }
    });
    body += '</div>';
    keys.push({ t: t, key: key });
  });
  if (withKey) {
    body += '<div style="page-break-before:always">';
    keys.forEach(function (k) {
      body += '<h2>정답 — ' + h_(title) + ' (' + h_(k.t.klass) + (k.t.name ? ' ' + h_(k.t.name) : '') + ')</h2><table class="key">';
      for (let i = 0; i < k.key.length; i += 3) {
        body += '<tr>' + [0, 1, 2].map(function (j) { return '<td>' + h_(k.key[i + j] || '') + '</td>'; }).join('') + '</tr>';
      }
      body += '</table>';
    });
    body += '</div>';
  }
  const css = '@page{size:A4;margin:14mm 14mm 16mm}' +
    'body{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Nanum Gothic",sans-serif;font-size:11pt;color:#111;margin:0}' +
    'h1{font-size:17pt;text-align:center;margin:0 0 2px}.meta{text-align:center;color:#666;font-size:8.5pt;margin:0 0 8px}' +
    'h2{font-size:11.5pt;color:#1f3a68;margin:12px 0 4px}table{border-collapse:collapse;width:100%}' +
    '.info td{border:1px solid #444;padding:6px 8px;font-size:10.5pt}' +
    '.mc{margin:0 0 6px;page-break-inside:avoid}.mc .qh{padding:3px 0 1px}.mc .ch{width:25%;padding:1px 0 1px 12px;font-size:10pt}' +
    '.wr td{height:30px;vertical-align:bottom;padding:2px 4px}.wr .wq{width:28%}.wr .blank{width:22%;border-bottom:1px solid #000}' +
    '.key td{border:1px solid #bbb;padding:4px 6px;font-size:9.5pt;width:33%}.foot{text-align:center;color:#999;font-size:8pt;margin-top:14px}';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + h_(title) + '</title><style>' + css + '</style></head><body>' +
         body + '<p class="foot">' + h_(footer) + '</p></body></html>';
}

function savePdf_(html, name, owner) {
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  const safe = function (s) { return String(s).replace(/[\\\/:*?"<>|\s_]+/g, '-').slice(0, 60); };
  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf')
    .setName(stamp + '_' + safe(owner || ADMIN) + '_' + safe(name) + '.pdf');
  const f = folder_().createFile(blob);
  return { name: f.getName(), url: f.getUrl() };
}

// ================================================================ 예약 (5분마다 자동 실행)

function kstParse_(s) {
  const m = String(s).match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5])) : null;
}
function kstDay_(d) { return new Date(d.getTime() + 9 * 3600e3).getUTCDay(); }

function nextRun_(runAt, repeat) {
  let t = kstParse_(runAt);
  const now = Date.now(), step = (repeat === 'weekly' ? 7 : 1) * 864e5;
  while (t.getTime() <= now || (repeat === 'weekdays' && (kstDay_(t) === 0 || kstDay_(t) === 6))) t = new Date(t.getTime() + step);
  return Utilities.formatDate(t, TZ, 'yyyy-MM-dd HH:mm');
}

function executeSchedule_(row, advance) {
  const s = sheet_('schedules');
  const r = s.getRange(row, 1, 1, 8).getValues()[0].map(cell_);
  let msg;
  try {
    const cfg = JSON.parse(r[3] || '{}');
    const built = buildSheet_(cfg);
    if (built) {
      const f = savePdf_(built.html, r[0] || '예약 시험지', r[7] || ADMIN);
      msg = '시험지 ' + built.count + '부 저장: ' + f.name;
    } else msg = '만들 문제가 없어 저장하지 않음';
  } catch (e) { msg = '오류: ' + e.message; }
  if (advance) {
    if (r[2] === 'daily' || r[2] === 'weekdays' || r[2] === 'weekly') s.getRange(row, 2).setValue("'" + nextRun_(r[1], r[2]));
    else s.getRange(row, 7).setValue('N');
  }
  s.getRange(row, 5, 1, 2).setValues([["'" + now_().slice(0, 16), msg]]);
  return msg;
}

function runDueSchedules() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    _memo = {};
    const nowS = now_().slice(0, 16);
    table_('schedules').forEach(function (r, i) {
      if (r[6] !== 'N' && r[1] && r[1].slice(0, 16) <= nowS) executeSchedule_(i + 2, true);
    });
  } finally { lock.releaseLock(); }
}
