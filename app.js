/* ระบบลา — staff & head app (runs inside LINE via LIFF, or any browser). Vanilla JS, no build step. */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  // ?preview=1 runs the app on sample data in this browser only (no LINE, no real data). Add &as=E-001 to view as the head.
  if (new URLSearchParams(location.search).has('preview')) CFG.MOCK = true;
  var S = { me: null, taken: null, form: null, calMonth: null };
  var $app = document.getElementById('app');

  /* ------------------------------------------------------------ helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
  var STATUS = { PENDING: 'รออนุมัติ', ESCALATED: 'รออนุมัติ (ส่งต่อแล้ว)', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ',
    AUTO_REJECTED: 'ไม่ผ่าน · แผนกมีคนลาแล้ว', CANCEL_REQUESTED: 'ขอยกเลิก', CANCELLED: 'ยกเลิกแล้ว' };
  function parts(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function isoOf(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return t.toISOString().slice(0, 10); }
  function addDays(iso, n) { var p = parts(iso); return isoOf(p.y, p.m, p.d + n); }
  function weekday(iso) { var w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
  function thaiDate(iso, withDow) {
    if (!iso) return '';
    var p = parts(iso);
    return (withDow ? DOW[weekday(iso) - 1] + ' ' : '') + p.d + ' ' + MONTHS[p.m - 1] + ' ' + String(p.y + 543).slice(2);
  }
  function range(a, b) { return a === b ? thaiDate(a, true) : thaiDate(a, true) + ' – ' + thaiDate(b, true); }
  function today() { return (S.me && S.me.today) || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
  function workDays() { return String((S.me && S.me.settings && S.me.settings.work_days) || '1,2,3,4,5').split(',').map(Number); }
  function isOff(iso) { return workDays().indexOf(weekday(iso)) === -1 || (S.me && S.me.holidays.indexOf(iso) !== -1); }
  function typeOf(id) { return (S.me.types || []).filter(function (t) { return t.type_id === id; })[0]; }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function errorBox(errors, kind) {
    if (!errors || !errors.length) return '';
    return '<div class="notice ' + (kind || 'bad') + '">' + (errors.length === 1 ? esc(errors[0].msg || errors[0]) :
      '<ul>' + errors.map(function (e) { return '<li>' + esc(e.msg || e) + '</li>'; }).join('') + '</ul>') + '</div>';
  }
  function loading(msg) { $app.innerHTML = '<div class="splash"><div class="spinner"></div><p>' + esc(msg || 'กำลังโหลด…') + '</p></div>'; }

  function openSheet(html, onMount) {
    var root = document.getElementById('sheet-root');
    root.innerHTML = '<div class="sheet-bg" data-close><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var bg = root.firstChild;
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.hasAttribute('data-close-btn')) closeSheet(); });
    if (onMount) onMount(bg.firstChild);
    var f = bg.querySelector('textarea, input, button'); if (f) f.focus();
  }
  function closeSheet() { document.getElementById('sheet-root').innerHTML = ''; }

  /* ------------------------------------------------------------ API */
  function api(action, data) {
    if (CFG.MOCK) return window.MockApi.call(action, data || {});
    var body = { action: action, idToken: window.liff ? liff.getIDToken() : null, data: data || {} };
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) return j.data;
        if (j.error && j.error.code === 'AUTH' && !sessionStorage.getItem('relogin')) {
          sessionStorage.setItem('relogin', '1'); liff.logout(); liff.login({ redirectUri: location.href });
        }
        var err = new Error(j.error ? j.error.msg : 'เกิดข้อผิดพลาด'); err.code = j.error && j.error.code; throw err;
      }, function () { var e = new Error('เชื่อมต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); e.code = 'NETWORK'; throw e; });
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    if (CFG.MOCK) {
      var s = document.createElement('script'); s.src = 'mock.js'; s.onload = start; document.head.appendChild(s);
      return;
    }
    if (!window.liff) { $app.innerHTML = errorBox([{ msg: 'โหลด LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่' }]); return; }
    liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
      var tok = liff.getDecodedIDToken();
      if (tok && tok.exp * 1000 < Date.now() + 60000) { liff.logout(); liff.login({ redirectUri: location.href }); return; }
      start();
    }).catch(function (e) { $app.innerHTML = errorBox([{ msg: 'เปิดแอปไม่สำเร็จ: ' + e.message }]); });
  }

  function start() {
    var q0 = new URLSearchParams(location.search);
    if (q0.get('page') === 'linkadmin' && q0.get('code')) {
      document.getElementById('tabbar').hidden = true;
      api('linkAdminByCode', { code: q0.get('code') }).then(function (r) {
        $app.innerHTML = '<h1>ผูก LINE เรียบร้อย</h1><div class="notice ok">บัญชีผู้ดูแล <b>' + esc(r.username) + '</b> จะได้รับแจ้งเตือนทาง LINE นี้</div><p class="muted">ปิดหน้านี้ได้เลย</p>';
      }).catch(function (e) { $app.innerHTML = '<h1>ผูก LINE ไม่สำเร็จ</h1>' + errorBox([e]); });
      return;
    }
    api('me').then(function (me) {
      try { sessionStorage.removeItem('relogin'); } catch (e) { }
      S.me = me;
      if (me.settings && me.settings.company_name) document.getElementById('brand').textContent = 'ระบบลา · ' + me.settings.company_name;
      if (!me.linked) { viewLink(); return; }
      document.getElementById('who').textContent = me.employee.name + ' · ' + me.employee.dept_name;
      var q = new URLSearchParams(location.search);
      if (q.get('page') === 'request' && q.get('id') && !location.hash) location.hash = '#req/' + q.get('id');
      window.addEventListener('hashchange', route);
      route();
    }).catch(function (e) { $app.innerHTML = '<h1>เปิดแอปไม่สำเร็จ</h1>' + errorBox([e]) + '<button class="btn" onclick="location.reload()">ลองใหม่</button>'; });
  }

  function refreshMe() { return api('me').then(function (me) { S.me = me; renderTabs(); }); }

  /* ------------------------------------------------------------ nav */
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    new: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    mine: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
    team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.2.9-4 3-4.6"/>',
    inbox: '<path d="M4 4h16v16H4z"/><path d="M4 14h5l1.5 2h3L15 14h5"/><path d="M9 8l2 2 4-4"/>'
  };
  function renderTabs() {
    var tabs = [['home', 'หน้าหลัก'], ['new', 'ขอลา'], ['mine', 'ใบลาของฉัน'], ['team', 'แผนก']];
    if (S.me.is_head) tabs.push(['inbox', 'อนุมัติ']);
    var cur = (location.hash.replace('#', '').split('/')[0]) || 'home';
    if (cur === 'req') cur = '';
    var bar = document.getElementById('tabbar');
    bar.innerHTML = tabs.map(function (t) {
      var dot = t[0] === 'inbox' && S.me.inbox_count ? '<span class="dot">' + S.me.inbox_count + '</span>' : '';
      return '<a href="#' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        ICONS[t[0]] + '</svg>' + t[1] + dot + '</a>';
    }).join('');
    bar.hidden = false;
  }
  function route() {
    closeSheet();
    var h = location.hash.replace('#', '') || 'home', p = h.split('/');
    renderTabs();
    window.scrollTo(0, 0);
    if (p[0] === 'new') return viewNew();
    if (p[0] === 'mine') return viewMine();
    if (p[0] === 'team') return viewTeam();
    if (p[0] === 'inbox') return viewInbox();
    if (p[0] === 'req' && p[1]) return viewRequest(decodeURIComponent(p[1]));
    return viewHome();
  }

  /* ------------------------------------------------------------ link LINE to employee */
  function viewLink() {
    document.getElementById('tabbar').hidden = true;
    $app.innerHTML =
      '<h1>ยืนยันตัวตนครั้งแรก</h1>' +
      '<p class="lead">' + (S.me.line_name ? 'สวัสดี ' + esc(S.me.line_name) + ' — ' : '') + 'กรอกรหัสพนักงานและวันเกิด เพื่อผูกบัญชี LINE นี้กับข้อมูลของคุณ ทำครั้งเดียว</p>' +
      '<form id="f" class="panel" novalidate>' +
      '<label class="field"><span>รหัสพนักงาน</span><input type="text" name="emp_id" autocomplete="off" autocapitalize="characters" required placeholder="เช่น E-001"></label>' +
      '<label class="field"><span>วันเกิด</span><input type="date" name="birth_date" required></label>' +
      '<label class="check"><input type="checkbox" name="consent" required><span>ฉันยินยอมให้บริษัทใช้ข้อมูลการลาและเอกสารประกอบ (รวมถึงใบรับรองแพทย์) เพื่อบริหารการลาเท่านั้น ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล</span></label>' +
      '<div id="err"></div><button class="btn primary block" type="submit">ยืนยัน</button></form>' +
      '<p class="muted">ข้อมูลไม่ตรงหรือเปลี่ยนเครื่อง LINE ใหม่ ติดต่อฝ่ายบุคคล</p>';
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, err = document.getElementById('err');
      if (!f.emp_id.value.trim() || !f.birth_date.value) { err.innerHTML = errorBox([{ msg: 'กรอกรหัสพนักงานและวันเกิดให้ครบ' }]); return; }
      if (!f.consent.checked) { err.innerHTML = errorBox([{ msg: 'กรุณาติ๊กยินยอมก่อน' }]); return; }
      f.querySelector('button').disabled = true;
      api('link', { emp_id: f.emp_id.value.trim(), birth_date: f.birth_date.value }).then(function () {
        toast('ผูกบัญชีเรียบร้อย'); start();
      }).catch(function (x) { err.innerHTML = errorBox([x]); f.querySelector('button').disabled = false; });
    });
  }

  /* ------------------------------------------------------------ home */
  function viewHome() {
    var me = S.me;
    var lys = me.balances[0];
    var chips = me.balances.map(function (b) {
      var locked = !me.self_service || (b.granted === 0 && b.type_id === 'VAC');
      return '<div class="chip' + (locked && b.granted === 0 ? ' locked' : '') + '" style="--c:' + esc(b.color) + '">' +
        '<div class="chip-swatch"><span class="chip-unit">เหลือ</span><span class="chip-num">' + Math.max(b.available, 0) + '</span><span class="chip-unit">จาก ' + b.granted + ' วัน</span></div>' +
        '<div class="chip-name">' + esc(b.name_th) + '</div>' +
        '<div class="chip-meta">' + (b.pending ? 'รออนุมัติ ' + b.pending + ' วัน' : 'ใช้แล้ว ' + b.used + ' วัน') + '</div></div>';
    }).join('');
    $app.innerHTML =
      '<h1>สวัสดี ' + esc(me.employee.first_name) + '</h1>' +
      '<p class="lead">ปีการลาของคุณ ' + (lys ? thaiDate(lys.leave_year_start) + ' – ' + thaiDate(lys.leave_year_end) : '') + '</p>' +
      (me.self_service ? '' : '<div class="notice warn">คุณทำงานยังไม่ครบ ' + me.self_service_after_months + ' เดือน ยังยื่นลาในแอปเองไม่ได้ ถ้าต้องลา (เช่น ป่วย) ให้แจ้งผู้ดูแลระบบเพื่อบันทึกให้</div>') +
      '<div class="chips">' + chips + '</div>' +
      (me.self_service ? '<a class="btn primary block" href="#new" style="margin-top:12px">ขอลา</a>' : '') +
      (me.is_head && me.inbox_count ? '<a class="notice info" style="display:block;text-decoration:none;color:inherit" href="#inbox"><b>มีใบลารออนุมัติ ' + me.inbox_count + ' รายการ</b> · แตะเพื่อดู</a>' : '') +
      '<h2>ใบลาที่กำลังจะถึง</h2><div id="upcoming"><p class="muted">กำลังโหลด…</p></div>';
    api('myRequests').then(function (list) {
      var up = list.filter(function (r) { return r.end_date >= today() && ['PENDING', 'ESCALATED', 'APPROVED', 'CANCEL_REQUESTED'].indexOf(r.status) !== -1; })
        .sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; }).slice(0, 5);
      document.getElementById('upcoming').innerHTML = up.length ? reqList(up, false) : '<div class="empty">ยังไม่มีใบลาที่กำลังจะถึง</div>';
    }).catch(function (e) { document.getElementById('upcoming').innerHTML = errorBox([e]); });
  }

  function reqList(list, showName) {
    return '<ul class="list">' + list.map(function (r) {
      return '<li><a class="row" style="color:inherit;text-decoration:none" href="#req/' + encodeURIComponent(r.req_id) + '"><span class="bar" style="--c:' + esc(r.color) + '"></span>' +
        '<span class="grow"><span class="title">' + esc(showName ? r.name : r.type_name) + '</span><br><span class="sub">' +
        (showName ? esc(r.type_name) + ' · ' : '') + range(r.start_date, r.end_date) + ' · ' + r.working_days + ' วัน</span></span>' +
        '<span class="badge st-' + r.status + '">' + STATUS[r.status] + '</span></a></li>';
    }).join('') + '</ul>';
  }

  /* ------------------------------------------------------------ new request */
  function viewNew() {
    var me = S.me;
    if (!me.self_service) {
      $app.innerHTML = '<h1>ขอลา</h1><div class="notice warn">คุณทำงานยังไม่ครบ ' + me.self_service_after_months + ' เดือน การลาในช่วงนี้ให้แจ้งผู้ดูแลระบบเพื่อบันทึกแทน</div>';
      return;
    }
    S.form = S.form || { type_id: '', start: '', end: '', reason: '', files: [] };
    var t0 = today();
    S.calMonth = S.calMonth || t0.slice(0, 7);
    $app.innerHTML =
      '<h1>ขอลา</h1>' +
      '<div class="two"><div>' +
      '<h2>ประเภทการลา</h2><div class="types" id="types"></div><div id="typeinfo"></div>' +
      '<h2>เลือกวัน</h2><p class="muted" style="margin-top:-4px">แตะวันแรก แล้วแตะวันสุดท้าย (ลาวันเดียวแตะวันเดียว)</p>' +
      '<div class="cal" id="cal"></div>' +
      '</div><div>' +
      '<div id="sum"></div>' +
      '<label class="field"><span>เหตุผล</span><textarea id="reason" maxlength="300" placeholder="เช่น ไปงานแต่งญาติที่ต่างจังหวัด"></textarea></label>' +
      '<div><b>เอกสารแนบ</b> <span class="muted" id="dochint"></span><div class="files" id="files"></div>' +
      '<input type="file" id="filein" accept="image/*,application/pdf" multiple hidden></div>' +
      '<div id="err"></div>' +
      '<button class="btn primary block" id="send" style="margin-top:20px">ส่งใบลา</button>' +
      '</div></div>';
    document.getElementById('reason').value = S.form.reason;
    document.getElementById('reason').addEventListener('input', function (e) { S.form.reason = e.target.value; });
    document.getElementById('filein').addEventListener('change', onFiles);
    document.getElementById('send').addEventListener('click', submitForm);
    renderTypes(); renderFiles();
    if (!S.taken) api('takenDates', { from: addDays(t0, -31), to: addDays(t0, 200) }).then(function (r) { S.taken = r.full; renderCal(); }).catch(function () { S.taken = []; renderCal(); });
    renderCal(); renderSummary();
  }

  function renderTypes() {
    var el = document.getElementById('types');
    var sel = S.form.type_id;
    el.innerHTML = S.me.types.map(function (t) {
      return '<button type="button" class="type-opt" style="--c:' + esc(t.color) + '" aria-pressed="' + (t.type_id === sel) + '" data-t="' + esc(t.type_id) + '">' + esc(t.name_th) + '</button>';
    }).join('');
    el.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { S.form.type_id = b.getAttribute('data-t'); S.form.start = S.form.end = ''; renderTypes(); renderCal(); renderSummary(); });
    });
    var t = sel && typeOf(sel), info = document.getElementById('typeinfo');
    if (!t) { info.innerHTML = ''; return; }
    var bal = S.me.balances.filter(function (b) { return b.type_id === t.type_id; })[0];
    var bits = [];
    if (bal) bits.push('เหลือ ' + Math.max(bal.available, 0) + ' วัน');
    bits.push(t.notice_days ? 'ต้องแจ้งล่วงหน้า ' + t.notice_days + ' วัน' : 'ยื่นย้อนหลังได้ภายใน 3 วันทำงานหลังกลับมา');
    if (t.doc_rule === 'REQUIRED') bits.push('ต้องแนบเอกสาร');
    if (t.doc_rule === 'REQUIRED_IF_MIN_DAYS') bits.push('ลา ' + t.doc_min_days + ' วันขึ้นไปต้องมีใบรับรองแพทย์');
    if (t.blocked_by_slot) bits.push('แผนกลาได้วันละ 1 คน');
    info.innerHTML = '<p class="muted" style="margin:10px 0 0">' + esc(bits.join(' · ')) + '</p>';
    document.getElementById('dochint').textContent = t.doc_rule === 'REQUIRED' ? '(จำเป็น)' : t.doc_rule === 'REQUIRED_IF_MIN_DAYS' ? '(จำเป็นถ้าลา ' + t.doc_min_days + ' วันขึ้นไป)' : '(ถ้ามี)';
  }

  function dayState(iso) {
    var t = typeOf(S.form.type_id), t0 = today();
    var min = !t ? t0 : t.notice_days ? addDays(t0, t.notice_days) : addDays(t0, -30);
    var st = { off: isOff(iso), past: iso < min || iso > addDays(t0, 365), taken: false };
    if (t && t.blocked_by_slot && S.taken && S.taken.indexOf(iso) !== -1) st.taken = true;
    return st;
  }

  function renderCal() {
    var el = document.getElementById('cal');
    if (!el) return;
    var ym = S.calMonth, y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    var first = isoOf(y, m, 1), lead = weekday(first) - 1, days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var html = '<div class="cal-head"><button class="cal-nav" data-nav="-1" aria-label="เดือนก่อน">‹</button><strong>' + MONTHS_FULL[m - 1] + ' ' + (y + 543) +
      '</strong><button class="cal-nav" data-nav="1" aria-label="เดือนถัดไป">›</button></div><div class="cal-grid">' +
      DOW.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    for (var i = 0; i < lead; i++) html += '<div></div>';
    for (var d = 1; d <= days; d++) {
      var iso = isoOf(y, m, d), st = dayState(iso), cls = ['day'];
      if (st.off) cls.push('off'); if (st.past) cls.push('past'); if (st.taken) cls.push('taken');
      if (iso === today()) cls.push('today');
      if (S.form.start && iso >= S.form.start && iso <= (S.form.end || S.form.start)) cls.push(iso === S.form.start || iso === S.form.end ? 'edge' : 'in');
      var dis = !S.form.type_id || st.past || st.taken || st.off;
      var label = thaiDate(iso, true) + (st.taken ? ' แผนกมีคนลาแล้ว' : st.off ? ' วันหยุด' : '');
      html += '<button type="button" class="' + cls.join(' ') + '" data-d="' + iso + '"' + (dis ? ' disabled' : '') + ' aria-label="' + label + '">' + d + '</button>';
    }
    html += '</div><div class="legend"><span><i style="background:var(--tape)"></i>วันที่เลือก</span><span><i style="background:repeating-linear-gradient(135deg,#F6D9D5 0 3px,#FBECEA 3px 6px)"></i>แผนกมีคนลาแล้ว</span><span><i style="background:transparent;border:1px solid #C2C9D0"></i>วันหยุด / เลือกไม่ได้</span></div>';
    if (!S.form.type_id) html += '<p class="muted" style="margin:8px 0 0">เลือกประเภทการลาก่อน</p>';
    el.innerHTML = html;
    el.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = +b.getAttribute('data-nav'), mm = m + n, yy = y;
        if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; }
        S.calMonth = yy + '-' + String(mm).padStart(2, '0'); renderCal();
      });
    });
    el.querySelectorAll('[data-d]').forEach(function (b) { b.addEventListener('click', function () { pickDay(b.getAttribute('data-d')); }); });
  }

  function pickDay(iso) {
    var f = S.form;
    if (!f.start || f.end !== f.start || iso < f.start) { f.start = f.end = iso; }
    else {
      var t = typeOf(f.type_id), blocked = false;
      for (var d = f.start; d <= iso; d = addDays(d, 1)) if (t.blocked_by_slot && S.taken && S.taken.indexOf(d) !== -1 && !isOff(d)) blocked = true;
      if (blocked) { toast('ช่วงนี้มีวันที่แผนกมีคนลาแล้ว เลือกใหม่'); f.start = f.end = iso; }
      else f.end = iso;
    }
    renderCal(); renderSummary();
  }

  var previewTimer;
  function renderSummary() {
    var el = document.getElementById('sum'), f = S.form;
    if (!el) return;
    if (!f.type_id || !f.start) { el.innerHTML = '<div class="panel muted">ยังไม่ได้เลือกวัน</div>'; return; }
    el.innerHTML = '<div class="panel"><div class="muted">' + esc(typeOf(f.type_id).name_th) + '</div><div class="summary"><span>' + range(f.start, f.end) +
      '</span><b id="wd">…</b></div><div id="pv"></div></div>';
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      api('preview', { type_id: f.type_id, start_date: f.start, end_date: f.end, reason: f.reason || '-', attachment_count: f.files.length }).then(function (r) {
        var wd = document.getElementById('wd'); if (!wd) return;
        wd.textContent = r.dates.length + ' วันทำงาน';
        var errs = r.errors.filter(function (e) { return e.code !== 'NO_REASON'; });
        document.getElementById('pv').innerHTML = errorBox(errs) + errorBox(r.warnings, 'warn');
      }).catch(function (e) { var pv = document.getElementById('pv'); if (pv) pv.innerHTML = errorBox([e]); });
    }, 250);
  }

  /* files: photos are shrunk to 1600 px JPEG before upload */
  function onFiles(e) {
    Array.prototype.forEach.call(e.target.files, function (file) {
      if (S.form.files.length >= 5) return toast('แนบได้สูงสุด 5 ไฟล์');
      if (file.type === 'application/pdf') {
        if (file.size > 8 * 1024 * 1024) return toast('ไฟล์ PDF ใหญ่เกิน 8 MB');
        readB64(file).then(function (b64) { S.form.files.push({ name: file.name, mime: 'application/pdf', base64: b64 }); renderFiles(); renderSummary(); });
      } else if (/^image\//.test(file.type)) {
        shrinkImage(file).then(function (o) { S.form.files.push(o); renderFiles(); renderSummary(); })
          .catch(function () { toast('เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่หรือเลือกไฟล์ JPG/PNG'); });
      } else toast('รองรับเฉพาะรูปภาพหรือ PDF');
    });
    e.target.value = '';
  }
  function readB64(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(file); });
  }
  function shrinkImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var data = c.toDataURL('image/jpeg', 0.82); URL.revokeObjectURL(url);
        res({ name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', base64: data.split(',')[1], preview: data });
      };
      img.onerror = rej; img.src = url;
    });
  }
  function renderFiles() {
    var el = document.getElementById('files'); if (!el) return;
    el.innerHTML = S.form.files.map(function (f, i) {
      return '<div class="file">' + (f.preview ? '<img src="' + f.preview + '" alt="">' : 'PDF<br>' + esc(f.name.slice(0, 14))) +
        '<button type="button" data-rm="' + i + '" aria-label="ลบไฟล์">×</button></div>';
    }).join('') + '<button type="button" class="file addfile" id="addf">+ ถ่ายรูป<br>/ เลือกไฟล์</button>';
    el.querySelectorAll('[data-rm]').forEach(function (b) { b.addEventListener('click', function () { S.form.files.splice(+b.getAttribute('data-rm'), 1); renderFiles(); renderSummary(); }); });
    document.getElementById('addf').addEventListener('click', function () { document.getElementById('filein').click(); });
  }

  function uploadAll(files) {
    var ids = [];
    return files.reduce(function (p, f) {
      return p.then(function () { return api('upload', { name: f.name, mime: f.mime, base64: f.base64 }).then(function (r) { ids.push(r.att_id); }); });
    }, Promise.resolve()).then(function () { return ids; });
  }

  function submitForm() {
    var f = S.form, err = document.getElementById('err'), btn = document.getElementById('send');
    var problems = [];
    if (!f.type_id) problems.push({ msg: 'เลือกประเภทการลา' });
    if (!f.start) problems.push({ msg: 'เลือกวันที่ลา' });
    if (!f.reason.trim()) problems.push({ msg: 'ระบุเหตุผล' });
    if (problems.length) { err.innerHTML = errorBox(problems); return; }
    btn.disabled = true; btn.textContent = f.files.length ? 'กำลังอัปโหลดไฟล์…' : 'กำลังส่ง…'; err.innerHTML = '';
    uploadAll(f.files).then(function (ids) {
      btn.textContent = 'กำลังส่ง…';
      return api('submit', { input: { type_id: f.type_id, start_date: f.start, end_date: f.end, reason: f.reason.trim() }, att_ids: ids });
    }).then(function (r) {
      if (!r.ok) { err.innerHTML = errorBox(r.errors); btn.disabled = false; btn.textContent = 'ส่งใบลา'; return; }
      S.form = null; S.taken = null;
      toast('ส่งใบลาแล้ว รอหัวหน้าอนุมัติ');
      refreshMe().then(function () { location.hash = '#req/' + encodeURIComponent(r.req.req_id); });
    }).catch(function (e) { err.innerHTML = errorBox([e]); btn.disabled = false; btn.textContent = 'ส่งใบลา'; });
  }

  /* ------------------------------------------------------------ my requests */
  function viewMine() {
    loading();
    api('myRequests').then(function (list) {
      $app.innerHTML = '<h1>ใบลาของฉัน</h1>' + (list.length ? reqList(list, false) :
        '<div class="empty">ยังไม่มีใบลา<br><a class="btn primary" style="margin-top:12px" href="#new">ขอลา</a></div>');
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ team calendar */
  function viewTeam() {
    loading();
    api('deptCalendar', { days: 7 }).then(function (depts) {
      var d = depts[0];
      $app.innerHTML = '<h1>แผนก' + esc(d.name) + '</h1><p class="lead">ใครลาบ้างใน 7 วันทำงานข้างหน้า</p><div class="days">' + d.days.map(function (day) {
        return '<div class="dayrow' + (day.slot_full ? ' full' : '') + '"><div class="d1">' + DOW[day.weekday - 1] + ' ' + parts(day.date).d + '<small>' + MONTHS[parts(day.date).m - 1] + '</small></div>' +
          '<div>' + (day.away.length ? day.away.map(function (a) { return '<span class="person" style="--c:' + esc(a.color) + '">' + esc(a.name) + ' <span class="muted">' + esc(a.type) + '</span></span>'; }).join('') : '<span class="muted">ไม่มีคนลา</span>') + '</div>' +
          '<div class="avail"><b>' + day.available + '/' + day.headcount + '</b>อยู่ทำงาน</div></div>';
      }).join('') + '</div>';
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ approval inbox (heads) */
  function viewInbox() {
    loading();
    api('inbox').then(function (list) {
      S.me.inbox_count = list.length; renderTabs();
      $app.innerHTML = '<h1>รออนุมัติ</h1>' + (list.length ? '<ul class="list">' + list.map(function (r) {
        return '<li><a class="row" style="color:inherit;text-decoration:none" href="#req/' + encodeURIComponent(r.req_id) + '"><span class="bar" style="--c:' + esc(r.color) + '"></span>' +
          '<span class="grow"><span class="title">' + esc(r.name) + '</span><br><span class="sub">' + esc(r.type_name) + ' · ' + range(r.start_date, r.end_date) + ' · ' + r.working_days + ' วัน' +
          (r.waiting_hours >= 24 ? ' · <b style="color:var(--warn)">รอ ' + Math.floor(r.waiting_hours / 24) + ' วัน</b>' : '') + '</span></span>' +
          '<span class="badge st-' + r.status + '">' + (r.status === 'CANCEL_REQUESTED' ? 'ขอยกเลิก' : 'รออนุมัติ') + '</span></a></li>';
      }).join('') + '</ul>' : '<div class="empty">ไม่มีใบลารออนุมัติ</div>');
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ request detail */
  function viewRequest(id) {
    loading();
    api('request', { req_id: id }).then(function (d) {
      var r = d.req, mine = r.emp_id === S.me.employee.emp_id;
      var t = typeOf(r.type_id) || {};
      var needsDoc = t.doc_rule === 'REQUIRED' || (t.doc_rule === 'REQUIRED_IF_MIN_DAYS' && Number(r.working_days) >= t.doc_min_days);
      var html = '<a class="linkbtn" href="' + (mine ? '#mine' : '#inbox') + '">‹ กลับ</a>' +
        '<h1>' + esc(mine ? d.type.name_th : d.employee.name) + '</h1>' +
        '<p><span class="badge st-' + r.status + '">' + STATUS[r.status] + '</span></p>' +
        '<div class="panel"><dl class="kv">' +
        (mine ? '' : '<dt>ประเภท</dt><dd>' + esc(d.type.name_th) + '</dd>') +
        '<dt>วันที่</dt><dd>' + range(r.start_date, r.end_date) + '</dd>' +
        '<dt>จำนวน</dt><dd>' + r.working_days + ' วันทำงาน</dd>' +
        '<dt>เหตุผล</dt><dd>' + esc(r.reason) + '</dd>' +
        (r.decision_note ? '<dt>หมายเหตุ</dt><dd>' + esc(r.decision_note) + '</dd>' : '') +
        '<dt>ยื่นเมื่อ</dt><dd>' + thaiDate(String(r.created_at).slice(0, 10)) + ' ' + String(r.created_at).slice(11, 16) + ' น.</dd>' +
        '</dl></div>' +
        '<h2>เอกสารแนบ</h2><div class="files" id="atts">' + (d.attachments.length ? d.attachments.map(function (a) {
          return '<button type="button" class="file" data-att="' + esc(a.att_id) + '" data-mime="' + esc(a.mime) + '">' + (a.mime === 'application/pdf' ? 'PDF' : 'รูปภาพ') + '<br>แตะเพื่อดู</button>';
        }).join('') : '<span class="muted">ไม่มี</span>') + '</div>';

      if (mine && needsDoc && !d.attachments.length && ['PENDING', 'ESCALATED'].indexOf(r.status) !== -1)
        html += '<div class="notice warn">ยังไม่ได้แนบเอกสาร หัวหน้าจะอนุมัติไม่ได้จนกว่าจะแนบ</div><button class="btn block" id="adddoc">แนบเอกสาร</button><input type="file" id="docin" accept="image/*,application/pdf" hidden>';

      if (d.can_decide) {
        html += '<h2>ก่อนอนุมัติ</h2>' + (d.check.ok ? '<div class="notice ok">ผ่านการตรวจทุกข้อ' +
          (d.balance_after != null ? ' · หลังอนุมัติเหลือ ' + d.balance_after + ' วัน' : '') + '</div>' : errorBox(d.check.errors)) +
          (d.check.will_auto_reject ? '<div class="notice warn">ถ้าอนุมัติ ใบลาอื่นในแผนกที่ขอวันเดียวกัน ' + d.check.will_auto_reject + ' ใบจะถูกปฏิเสธอัตโนมัติ</div>' : '') +
          (d.check.double_absence && d.check.double_absence.length ? '<div class="notice warn">วันที่ ' + d.check.double_absence.map(function (x) { return thaiDate(x); }).join(', ') + ' แผนกมีคนลาอยู่แล้ว (ลาป่วย/อุบัติเหตุอนุมัติได้)</div>' : '') +
          '<div class="btn-row"><button class="btn danger" id="rej">ไม่อนุมัติ</button><button class="btn dark" id="apv"' + (d.check.ok ? '' : ' disabled') + '>อนุมัติ</button></div>';
      }
      if (!mine && r.status === 'CANCEL_REQUESTED' && S.me.is_head)
        html += '<h2>พนักงานขอยกเลิกใบลานี้</h2><div class="btn-row"><button class="btn" id="cno">ไม่ให้ยกเลิก</button><button class="btn dark" id="cyes">อนุมัติให้ยกเลิก</button></div>';
      if (mine && ['PENDING', 'ESCALATED'].indexOf(r.status) !== -1) html += '<button class="btn danger block" style="margin-top:24px" id="cancel">ยกเลิกใบลา</button>';
      if (mine && r.status === 'APPROVED' && r.start_date > today()) html += '<button class="btn danger block" style="margin-top:24px" id="askcancel">ขอยกเลิกใบลา</button><p class="muted">หัวหน้าต้องอนุมัติการยกเลิก แล้วระบบจะคืนวันลาให้</p>';
      if (mine && r.status === 'APPROVED' && r.start_date <= today()) html += '<p class="muted" style="margin-top:24px">ใบลาเริ่มแล้ว ถ้าต้องแก้ไขติดต่อผู้ดูแลระบบ</p>';
      $app.innerHTML = html;
      bindRequest(d);
    }).catch(function (e) { $app.innerHTML = '<a class="linkbtn" href="#home">‹ หน้าหลัก</a>' + errorBox([e]); });
  }

  function act(promise, okMsg, next) {
    return promise.then(function (res) {
      if (res && res.ok === false) { openSheet('<h3>ทำรายการไม่ได้</h3>' + errorBox(res.errors) + '<button class="btn block" data-close-btn>ปิด</button>'); return; }
      closeSheet(); toast(okMsg); refreshMe(); next ? next() : route();
    }).catch(function (e) { openSheet('<h3>ทำรายการไม่ได้</h3>' + errorBox([e]) + '<button class="btn block" data-close-btn>ปิด</button>'); });
  }

  function askReason(title, btnLabel, danger, cb) {
    openSheet('<h3>' + esc(title) + '</h3><label class="field"><span>เหตุผล</span><textarea id="why" maxlength="300"></textarea></label>' +
      '<div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn ' + (danger ? 'danger' : 'dark') + '" id="go">' + esc(btnLabel) + '</button></div>',
      function (el) {
        el.querySelector('#go').addEventListener('click', function () {
          var why = el.querySelector('#why').value.trim();
          if (!why) { el.querySelector('#why').focus(); toast('กรุณาระบุเหตุผล'); return; }
          this.disabled = true; cb(why);
        });
      });
  }

  function bindRequest(d) {
    var r = d.req, on = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    document.querySelectorAll('[data-att]').forEach(function (b) {
      b.addEventListener('click', function () {
        openSheet('<h3>เอกสารแนบ</h3><div class="viewer"><div class="spinner"></div></div><button class="btn block" data-close-btn style="margin-top:12px">ปิด</button>');
        api('attachment', { att_id: b.getAttribute('data-att') }).then(function (f) {
          var v = document.querySelector('.viewer'); if (!v) return;
          var src = 'data:' + f.mime + ';base64,' + f.base64;
          v.innerHTML = f.mime === 'application/pdf' ? '<iframe src="' + src + '" title="PDF"></iframe>' : '<img src="' + src + '" alt="เอกสารแนบ">';
        }).catch(function (e) { var v = document.querySelector('.viewer'); if (v) v.innerHTML = errorBox([e]); });
      });
    });
    on('apv', function () {
      openSheet('<h3>อนุมัติใบลานี้?</h3><p>' + esc(d.employee.name) + '<br>' + esc(d.type.name_th) + ' · ' + range(r.start_date, r.end_date) + '</p>' +
        '<div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn dark" id="go">อนุมัติ</button></div>', function (el) {
          el.querySelector('#go').addEventListener('click', function () { this.disabled = true; act(api('approve', { req_id: r.req_id }), 'อนุมัติแล้ว แจ้งพนักงานทาง LINE แล้ว', function () { location.hash = '#inbox'; }); });
        });
    });
    on('rej', function () { askReason('ไม่อนุมัติใบลา', 'ไม่อนุมัติ', true, function (why) { act(api('reject', { req_id: r.req_id, reason: why }), 'ไม่อนุมัติแล้ว แจ้งพนักงานทาง LINE แล้ว', function () { location.hash = '#inbox'; }); }); });
    on('cyes', function () { act(api('decideCancel', { req_id: r.req_id, approve: true }), 'อนุมัติให้ยกเลิกแล้ว', function () { location.hash = '#inbox'; }); });
    on('cno', function () { act(api('decideCancel', { req_id: r.req_id, approve: false }), 'ใบลายังมีผลตามเดิม', function () { location.hash = '#inbox'; }); });
    on('cancel', function () {
      openSheet('<h3>ยกเลิกใบลานี้?</h3><p>' + range(r.start_date, r.end_date) + '</p><div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn danger" id="go">ยกเลิกใบลา</button></div>', function (el) {
        el.querySelector('#go').addEventListener('click', function () { this.disabled = true; act(api('cancel', { req_id: r.req_id }), 'ยกเลิกใบลาแล้ว'); });
      });
    });
    on('askcancel', function () { askReason('ขอยกเลิกใบลา', 'ส่งคำขอยกเลิก', true, function (why) { act(api('cancel', { req_id: r.req_id, reason: why }), 'ส่งคำขอยกเลิกให้หัวหน้าแล้ว'); }); });
    on('adddoc', function () { document.getElementById('docin').click(); });
    var docin = document.getElementById('docin');
    if (docin) docin.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var prep = file.type === 'application/pdf' ? readB64(file).then(function (b) { return { name: file.name, mime: file.type, base64: b }; }) : shrinkImage(file);
      toast('กำลังอัปโหลด…');
      act(prep.then(function (f) { return uploadAll([f]); }).then(function (ids) { return api('addAttachments', { req_id: r.req_id, att_ids: ids }); }), 'แนบเอกสารแล้ว แจ้งหัวหน้าแล้ว');
    });
  }

  boot();
})();
