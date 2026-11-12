/**
 * 내신 영단어 암기 — 서버 (Google Apps Script)
 * 구글 시트 → 확장 프로그램 → Apps Script 에 이 파일 내용을 통째로 붙여넣고
 * 1) 위쪽 함수 선택에서 setup 실행(권한 허용)  2) 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자)
 */
const TZ = 'Asia/Seoul';
const T = { words: '단어', students: '학생', settings: '설정', attempts: '시험기록', progress: '진도', wrongs: '오답', schedules: '예약' };
const HEAD = {
  words: ['단원', '단어', '뜻', '유의어', '반의어'],
  students: ['반', '이름', '비밀번호'],
  settings: ['항목', '값', '설명'],
  attempts: ['시각', '반', '이름', '단원', '단계', '점수', '문항수', '통과'],
  progress: ['반', '이름', '단원', '단계', '통과일시'],
  wrongs: ['반', '이름', '단원', '단어', '틀린횟수', '최근'],
  schedules: ['이름', '다음 실행', '반복', '설정', '최근 실행', '결과', '사용'],
};
const DEFAULT_SETTINGS = [
  ['통과기준', 80, '통과에 필요한 정답률(%)'],
  ['출제문항수', 0, '한 번에 낼 문항 수 (0 = 단원 전체)'],
  ['단원잠금', '예', '예 = 앞 단원을 끝내야 다음 단원이 열림 / 아니오'],
  ['선생님비밀번호', '1234', '꼭 바꾸세요'],
  ['제목', '내신 영단어 암기', '화면 제목'],
];
const SAMPLE = [
  ['Day 1', 'abundant', '풍부한', 'plentiful, ample', 'scarce'],
  ['Day 1', 'increase', '증가하다', 'rise, grow', 'decrease'],
  ['Day 1', 'ancient', '고대의', 'old', 'modern'],
  ['Day 1', 'accept', '받아들이다', 'receive, admit', 'reject, refuse'],
  ['Day 1', 'brave', '용감한', 'courageous, bold', 'cowardly'],
  ['Day 2', 'rapid', '빠른', 'quick, fast', 'slow'],
  ['Day 2', 'obvious', '분명한', 'clear, evident', 'unclear'],
  ['Day 2', 'rare', '드문', 'uncommon', 'common'],
  ['Day 2', 'similar', '비슷한', 'alike', 'different'],
  ['Day 2', 'evidence', '증거', 'proof', ''],
];
const REPEAT = { none: '한 번만', daily: '매일', weekdays: '평일(월~금)', weekly: '매주' };

// ================================================================ 설치

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const P = PropertiesService.getScriptProperties();
  P.setProperty('SHEET_ID', ss.getId());
  if (!P.getProperty('SECRET')) P.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(T).forEach(function (k) {
    let s = ss.getSheetByName(T[k]);
    if (!s) {
      s = ss.insertSheet(T[k]);
      s.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  });
  ss.getSheetByName(T.students).getRange('C:C').setNumberFormat('@');
  const st = ss.getSheetByName(T.settings);
  if (st.getLastRow() < 2) st.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  const w = ss.getSheetByName(T.words);
  if (w.getLastRow() < 2) w.getRange(2, 1, SAMPLE.length, 5).setValues(SAMPLE);
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
  Logger.log('설치 완료! 이제 [배포 → 새 배포 → 웹 앱]으로 배포하세요.');
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

let _ss = null;
function ss_() {
  if (_ss) return _ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}
function sheet_(k) {
  const s = ss_().getSheetByName(T[k]);
  if (!s) throw err_('SETUP', '시트 "' + T[k] + '" 가 없습니다. Apps Script에서 setup을 먼저 실행하세요.');
  return s;
}
function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss');
  return v === null || v === undefined ? '' : String(v).trim();
}
function table_(k) {
  const s = sheet_(k), n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, HEAD[k].length).getValues().map(function (r) { return r.map(cell_); });
}
function append_(k, rows) {
  if (!rows.length) return;
  const s = sheet_(k);
  s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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

function settings_() {
  const o = {};
  table_('settings').forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  return {
    passRate: Number(o['통과기준']) || 80,
    qPer: Number(o['출제문항수']) || 0,
    lock: !/^(아니|n|no|false|0|x)/i.test(o['단원잠금'] || '예'),
    pw: o['선생님비밀번호'] || '1234',
    title: o['제목'] || '내신 영단어 암기',
  };
}

function words_() {
  return table_('words').filter(function (r) { return r[1] && r[2]; }).map(function (r) {
    const unit = r[0] || '기본';
    return { id: unit + '|' + r[1], unit: unit, word: r[1], meaning: r[2], syn: splitList_(r[3]), ant: splitList_(r[4]) };
  });
}

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
  if (role === 't' && o.v !== sign_(settings_().pw).slice(0, 10)) throw err_('AUTH', '비밀번호가 바뀌었습니다. 다시 로그인하세요.');
  return o;
}
function checkFails_(key) {
  const c = CacheService.getScriptCache(), n = Number(c.get('f:' + key) || 0);
  if (n >= 8) throw err_('LOCKED', '비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 하거나 선생님께 말씀하세요.');
  return function () { c.put('f:' + key, String(n + 1), 600); };
}

// ================================================================ 웹 API

function doGet() {
  return json_({ ok: true, message: '단어 암기 서버가 작동 중입니다.' });
}
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const fn = API[req.action];
    if (!fn) throw err_('BAD', '알 수 없는 요청: ' + req.action);
    out = { ok: true, data: fn(req) };
  } catch (x) {
    out = { ok: false, error: x.code || 'ERROR', message: x.message };
  }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const API = {
  bootstrap: function () {
    const classes = {};
    table_('students').forEach(function (r) { if (r[1]) classes[r[0]] = 1; });
    return { title: settings_().title, classes: Object.keys(classes).sort() };
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
    const me = readToken_(q.token, 's'), S = settings_(), ws = words_();
    const status = unitStatus_(ws, table_('progress'), me.k, me.n, S.lock);
    const wmap = {};
    ws.forEach(function (w) { wmap[w.id] = w; });
    const review = table_('wrongs').filter(function (r) { return r[0] === me.k && r[1] === me.n && wmap[r[2] + '|' + r[3]]; })
      .sort(function (a, b) { return Number(b[4]) - Number(a[4]); }).slice(0, 15)
      .map(function (r) { const w = wmap[r[2] + '|' + r[3]]; return { word: w.word, meaning: w.meaning, syn: w.syn.join(', '), ant: w.ant.join(', '), cnt: Number(r[4]) }; });
    return { klass: me.k, name: me.n, title: S.title, passRate: S.passRate, units: status, position: position_(status), review: review };
  },

  startQuiz: function (q) {
    const me = readToken_(q.token, 's'), S = settings_(), ws = words_();
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
          if (idx[key] !== undefined) {
            const i = idx[key];
            rows[i][4] = Number(rows[i][4]) + 1;
            s.getRange(i + 2, 5, 1, 2).setValues([[rows[i][4], ts]]);
          } else {
            idx[key] = -1;
            add.push([me.k, me.n, w.unit, w.word, 1, ts]);
          }
        });
        append_('wrongs', add);
      }
    } finally { lock.releaseLock(); }
    const status = unitStatus_(words_(), table_('progress'), me.k, me.n, S.lock);
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

  // ---------------- 선생님
  tLogin: function (q) {
    const fail = checkFails_('teacher');
    const S = settings_();
    if (String(q.password || '') !== String(S.pw)) { fail(); throw err_('LOGIN', '비밀번호가 올바르지 않습니다.'); }
    return { token: makeToken_({ r: 't', v: sign_(S.pw).slice(0, 10) }), defaultPw: String(S.pw) === '1234' };
  },

  tDashboard: function (q) {
    readToken_(q.token, 't');
    const S = settings_(), ws = words_(), progress = table_('progress'), attempts = table_('attempts'), wrongs = table_('wrongs');
    const att = {}, wcount = {};
    attempts.forEach(function (r) {
      const k = skey_(r[1], r[2]);
      const a = att[k] || (att[k] = { n: 0, p: 0, sc: 0, tot: 0, last: '' });
      a.n++; if (r[7] === 'O') a.p++; a.sc += Number(r[5]) || 0; a.tot += Number(r[6]) || 0;
      if (r[0] > a.last) a.last = r[0];
    });
    wrongs.forEach(function (r) { const k = skey_(r[0], r[1]); wcount[k] = (wcount[k] || 0) + 1; });
    const nUnits = units_(ws).length;
    const students = table_('students').filter(function (r) { return r[1]; }).map(function (r) {
      const k = skey_(r[0], r[1]), a = att[k], status = unitStatus_(ws, progress, r[0], r[1], S.lock);
      return {
        klass: r[0], name: r[1], position: position_(status),
        unitsDone: status.filter(function (u) { return u.done; }).length, unitsTotal: nUnits,
        attempts: a ? a.n : 0, passes: a ? a.p : 0,
        accuracy: a && a.tot ? Math.round(100 * a.sc / a.tot) : null,
        last: a ? a.last.slice(0, 16) : '', wrongWords: wcount[k] || 0,
      };
    }).sort(function (a, b) { return (a.klass + a.name).localeCompare(b.klass + b.name, 'ko'); });
    const agg = {};
    wrongs.forEach(function (r) {
      const k = r[2] + '|' + r[3];
      if (q.klass && r[0] !== q.klass) return;
      const a = agg[k] || (agg[k] = { unit: r[2], word: r[3], c: 0, s: 0 });
      a.c += Number(r[4]) || 0; a.s++;
    });
    const wm = {};
    ws.forEach(function (w) { wm[w.id] = w.meaning; });
    const top = Object.keys(agg).map(function (k) { agg[k].meaning = wm[k] || ''; return agg[k]; })
      .sort(function (a, b) { return b.c - a.c; }).slice(0, 15);
    const today = now_().slice(0, 10);
    const activeToday = {};
    attempts.forEach(function (r) { if (r[0].slice(0, 10) === today) activeToday[skey_(r[1], r[2])] = 1; });
    return {
      title: S.title, students: students, topWrong: top, nWords: ws.length, nUnits: nUnits,
      units: units_(ws).map(function (u) { return u.name; }),
      activeToday: Object.keys(activeToday).length, sheetUrl: ss_().getUrl(), folderUrl: folder_().getUrl(),
      defaultPw: String(S.pw) === '1234', passRate: S.passRate,
    };
  },

  tStudent: function (q) {
    readToken_(q.token, 't');
    const S = settings_(), ws = words_(), wm = {};
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

  tFormData: function (q) {
    readToken_(q.token, 't');
    const classes = {}, students = [];
    table_('students').forEach(function (r) { if (r[1]) { classes[r[0]] = 1; students.push(skey_(r[0], r[1])); } });
    return { classes: Object.keys(classes).sort(), students: students, units: units_(words_()).map(function (u) { return u.name; }) };
  },

  tSheet: function (q) {
    readToken_(q.token, 't');
    const r = buildSheet_(q.cfg || {});
    if (!r) throw err_('EMPTY', '만들 시험지가 없습니다. 학생(또는 반)을 골랐는지, 단어 수를 확인하세요.');
    return r;
  },

  tSaveSheet: function (q) {
    readToken_(q.token, 't');
    const r = buildSheet_(q.cfg || {});
    if (!r) throw err_('EMPTY', '만들 시험지가 없습니다.');
    return savePdf_(r.html, (q.cfg && q.cfg.title) || '영단어 시험');
  },

  tSchedules: function (q) {
    readToken_(q.token, 't');
    const list = table_('schedules').map(function (r, i) {
      let cfg = {};
      try { cfg = JSON.parse(r[3] || '{}'); } catch (e) { /* 무시 */ }
      return { row: i + 2, name: r[0], runAt: r[1].slice(0, 16), repeat: r[2], repeatLabel: REPEAT[r[2]] || r[2], cfg: cfg,
               lastRun: r[4].slice(0, 16), result: r[5], active: r[6] !== 'N' };
    });
    const files = [], it = folder_().getFiles();
    while (it.hasNext() && files.length < 200) {
      const f = it.next();
      files.push({ name: f.getName(), url: f.getUrl(), at: Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd HH:mm') });
    }
    files.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    return { schedules: list, files: files.slice(0, 40), folderUrl: folder_().getUrl(), repeats: REPEAT };
  },

  tAddSchedule: function (q) {
    readToken_(q.token, 't');
    const runAt = String(q.runAt || '').replace('T', ' ').slice(0, 16);
    if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(runAt)) throw err_('BAD', '예약 시간을 입력하세요.');
    const name = String(q.name || '').trim() || (q.cfg && q.cfg.title) || '예약 시험지';
    append_('schedules', [[name, "'" + runAt, REPEAT[q.repeat] ? q.repeat : 'none', JSON.stringify(q.cfg || {}), '', '', 'Y']]);
    return { ok: true };
  },

  tScheduleAction: function (q) {
    readToken_(q.token, 't');
    const s = sheet_('schedules'), row = Number(q.row);
    if (!(row >= 2 && row <= s.getLastRow())) throw err_('BAD', '예약을 찾을 수 없습니다.');
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

// ================================================================ 시험지

function buildSheet_(cfg) {
  const ws = words_(), wm = {};
  ws.forEach(function (w) { wm[w.id] = w; });
  const allStudents = table_('students').filter(function (r) { return r[1]; });
  const want = {};
  (cfg.students || []).forEach(function (k) { want[k] = 1; });
  const classes = cfg.classes || [];
  const targets = allStudents.filter(function (r) { return want[skey_(r[0], r[1])] || classes.indexOf(r[0]) >= 0; })
    .map(function (r) { return { klass: r[0], name: r[1] }; });
  const nWrong = Math.max(0, Number(cfg.wrongCount) || 0), nRand = Math.max(0, Number(cfg.randomCount) || 0);
  const days = Number(cfg.days) || 0, fill = cfg.fill !== false;
  const units = cfg.units || [];
  const randPool = ws.filter(function (w) { return !units.length || units.indexOf(w.unit) >= 0; });
  const wrongs = table_('wrongs');
  const since = days > 0 ? Utilities.formatDate(new Date(Date.now() - days * 864e5), TZ, 'yyyy-MM-dd HH:mm:ss') : '';

  function wrongWords(keys) {
    const agg = {};
    wrongs.forEach(function (r) {
      if (!keys[skey_(r[0], r[1])] || (since && r[5] < since)) return;
      const id = r[2] + '|' + r[3];
      if (!wm[id]) return;
      agg[id] = (agg[id] || 0) + (Number(r[4]) || 0);
    });
    return Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; }).slice(0, nWrong).map(function (id) { return wm[id]; });
  }
  function compose(keys) {
    const ww = nWrong ? wrongWords(keys) : [];
    const chosen = {};
    ww.forEach(function (w) { chosen[w.id] = 1; });
    const need = nRand + (fill ? nWrong - ww.length : 0);
    const rr = shuffle_(randPool.filter(function (w) { return !chosen[w.id]; })).slice(0, need);
    return { words: ww.concat(rr), nw: ww.length, nr: rr.length };
  }

  const tests = [];
  if (cfg.mode === 'class') {
    const keys = {};
    targets.forEach(function (t) { keys[skey_(t.klass, t.name)] = 1; });
    const c = compose(keys);
    const kl = {};
    targets.forEach(function (t) { if (t.klass) kl[t.klass] = 1; });
    if (c.words.length) tests.push({ klass: Object.keys(kl).join(', '), name: '', nw: c.nw, nr: c.nr, sections: sheetQuestions_(c.words, cfg, ws) });
  } else {
    targets.forEach(function (t) {
      const keys = {};
      keys[skey_(t.klass, t.name)] = 1;
      const c = compose(keys);
      if (c.words.length) tests.push({ klass: t.klass, name: t.name, nw: c.nw, nr: c.nr, sections: sheetQuestions_(c.words, cfg, ws) });
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
      body += '<h2>정답 — ' + h_(title) + (k.t.name ? ' (' + h_(k.t.klass) + ' ' + h_(k.t.name) + ')' : '') + '</h2><table class="key">';
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

function savePdf_(html, name) {
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  const safe = String(name).replace(/[\\\/:*?"<>|\s]+/g, '_').slice(0, 60);
  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(stamp + '_' + safe + '.pdf');
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
  const r = s.getRange(row, 1, 1, 7).getValues()[0].map(cell_);
  let msg;
  try {
    const cfg = JSON.parse(r[3] || '{}');
    const built = buildSheet_(cfg);
    if (built) {
      const f = savePdf_(built.html, r[0] || '예약 시험지');
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
    const nowS = now_().slice(0, 16);
    table_('schedules').forEach(function (r, i) {
      if (r[6] !== 'N' && r[1] && r[1].slice(0, 16) <= nowS) executeSchedule_(i + 2, true);
    });
  } finally { lock.releaseLock(); }
}
