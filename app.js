/* ระบบลา — supervisor app (runs inside LINE via LIFF). Supervisors file leave for their department from the
   employees' paper forms; Admin / Super-admin approve on the admin page. Vanilla JS, no build step. */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  // ?preview=1 runs the app on sample data in this browser only (no LINE, no real data). &as=NEW shows first-time linking.
  if (new URLSearchParams(location.search).has('preview')) CFG.MOCK = true;
  var S = { me: null, taken: {}, form: null, calMonth: null, listFilter: 'open' };
  var $app = document.getElementById('app');

  /* ------------------------------------------------------------ helpers */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
  var STATUS = { PENDING: 'รออนุมัติ', ESCALATED: 'รออนุมัติ (ค้างนาน)', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ',
    AUTO_REJECTED: 'ไม่ผ่าน · แผนกมีคนลาแล้ว', CANCEL_REQUESTED: 'ขอยกเลิก', CANCELLED: 'ยกเลิกแล้ว' };
  function parts(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function isoOf(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return t.toISOString().slice(0, 10); }
  function addDays(iso, n) { var p = parts(iso); return isoOf(p.y, p.m, p.d + n); }
  function weekday(iso) { var w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
  function thaiDate(iso, withDow) {
    if (!iso) return '';
    return (withDow ? DOW[weekday(iso) - 1] + ' ' : '') + dmy(iso);
  }
  function range(a, b) { return a === b ? thaiDate(a, true) : thaiDate(a, true) + ' – ' + thaiDate(b, true); }
  function today() { return (S.me && S.me.today) || new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
  function workDays() { return String((S.me && S.me.settings && S.me.settings.work_days) || '1,2,3,4,5').split(',').map(Number); }
  function isOff(iso) { return workDays().indexOf(weekday(iso)) === -1 || (S.me && S.me.holidays.indexOf(iso) !== -1); }
  function typeOf(id) { return (S.me.types || []).filter(function (t) { return t.type_id === id; })[0]; }
  function member(id) { return (S.me.team || []).filter(function (e) { return e.emp_id === id; })[0]; }
  function deptKey() { var m = S.form && member(S.form.emp_id); return m ? m.dept_id : ''; }
  function takenFor() { return S.taken[deptKey()] || null; }

  /* ------------------------------------------------------------ dd/mm/yyyy date fields
     Every <input type="date"> is turned into a text box that shows and accepts dd/mm/yyyy (C.E.; a
     Buddhist year such as 2569 is converted), plus a calendar button. The original input stays in the
     form as a hidden field holding yyyy-mm-dd, so form code and the server are unchanged. */
  function dmy(iso) { var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function parseDmy(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
    if (!m) return '';
    var d = +m[1], mo = +m[2], y = +m[3];
    if (y >= 2400) y -= 543;
    var t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return '';
    return t.toISOString().slice(0, 10);
  }
  var CAL_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
  function enhanceDate(inp) {
    if (inp.getAttribute('data-dmy')) return;
    inp.setAttribute('data-dmy', '1');
    var wrap = document.createElement('span'); wrap.className = 'dmy';
    var txt = document.createElement('input');
    txt.type = 'text'; txt.inputMode = 'numeric'; txt.placeholder = 'วว/ดด/ปปปป'; txt.maxLength = 10; txt.autocomplete = 'off';
    txt.required = inp.required; txt.disabled = inp.disabled; txt.readOnly = inp.readOnly;
    if (inp.title) { txt.title = inp.title; txt.setAttribute('aria-label', inp.title); }
    var btn = document.createElement('span'); btn.className = 'dmy-btn'; btn.innerHTML = CAL_ICON;
    var pick = document.createElement('input');
    pick.type = 'date'; pick.className = 'dmy-pick'; pick.tabIndex = -1; pick.setAttribute('aria-label', 'เลือกวันที่จากปฏิทิน');
    pick.disabled = inp.disabled || inp.readOnly;
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(txt); wrap.appendChild(btn); btn.appendChild(pick); wrap.appendChild(inp);
    inp.required = false; inp.type = 'hidden';
    txt.value = dmy(inp.value); pick.value = inp.value;
    function setIso(iso) {
      if (inp.value === iso) return;
      inp.value = iso; pick.value = iso;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    txt.addEventListener('input', function () {
      var raw = txt.value, out, tok = raw.split('/');
      // the user typed their own separators (e.g. 5/3/2533) -> keep them; otherwise mask digits as dd/mm/yyyy
      if (tok.slice(0, -1).some(function (t) { return t.replace(/\D/g, '').length === 1; })) out = raw.replace(/[^\d\/]/g, '').slice(0, 10);
      else {
        var dg = raw.replace(/\D/g, '').slice(0, 8);
        out = dg.slice(0, 2) + (dg.length > 2 ? '/' + dg.slice(2, 4) : '') + (dg.length > 4 ? '/' + dg.slice(4) : '');
      }
      if (out !== raw) txt.value = out;
      var iso = parseDmy(out);
      txt.setCustomValidity(out && !iso && out.length >= 8 ? 'วันที่ไม่ถูกต้อง ใช้รูปแบบ วว/ดด/ปปปป' : '');
      setIso(iso);
    });
    txt.addEventListener('blur', function () {
      var iso = parseDmy(txt.value);
      if (iso) txt.value = dmy(iso);
      txt.setCustomValidity(txt.value && !iso ? 'วันที่ไม่ถูกต้อง ใช้รูปแบบ วว/ดด/ปปปป' : '');
    });
    pick.addEventListener('click', function () { try { if (pick.showPicker) pick.showPicker(); } catch (e) { } });
    pick.addEventListener('change', function () { txt.value = dmy(pick.value); txt.setCustomValidity(''); setIso(pick.value); });
    if (inp.form) inp.form.addEventListener('reset', function () { setTimeout(function () { txt.value = ''; txt.setCustomValidity(''); inp.value = ''; pick.value = ''; }, 0); });
  }
  function enhanceDates(root) { Array.prototype.forEach.call((root || document).querySelectorAll('input[type=date]:not(.dmy-pick)'), enhanceDate); }
  new MutationObserver(function () { enhanceDates(document); }).observe(document.documentElement, { childList: true, subtree: true });

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function errorBox(errors, kind) {
    if (!errors || !errors.length) return '';
    return '<div class="notice ' + (kind || 'bad') + '">' + (errors.length === 1 ? esc(errors[0].msg || errors[0].message || errors[0]) :
      '<ul>' + errors.map(function (e) { return '<li>' + esc(e.msg || e.message || e) + '</li>'; }).join('') + '</ul>') + '</div>';
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
      if (!me.is_supervisor) { viewNotSupervisor(); return; }
      document.getElementById('who').textContent = me.employee.name + ' · หัวหน้า' + me.departments.map(function (d) { return d.name; }).join(', ');
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
    list: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
    new: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    mine: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
    team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.2.9-4 3-4.6"/>',
    inbox: ''
  };
  function renderTabs() {
    var tabs = [['home', 'หน้าหลัก'], ['new', 'บันทึกใบลา'], ['list', 'ใบลาแผนก'], ['team', 'ตารางแผนก']];
    var cur = (location.hash.replace('#', '').split('/')[0]) || 'home';
    if (cur === 'req') cur = '';
    var bar = document.getElementById('tabbar');
    bar.innerHTML = tabs.map(function (t) {
      var dot = t[0] === 'list' && S.me.pending_count ? '<span class="dot">' + S.me.pending_count + '</span>' : '';
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
    if (p[0] === 'list' || p[0] === 'mine') return viewList();
    if (p[0] === 'team') return viewTeam();
    if (p[0] === 'req' && p[1]) return viewRequest(decodeURIComponent(p[1]));
    return viewHome();
  }

  /* ------------------------------------------------------------ link LINE (supervisors, one-time code from HR) */
  function viewLink() {
    document.getElementById('tabbar').hidden = true;
    $app.innerHTML =
      '<h1>ผูกบัญชี LINE</h1>' +
      '<p class="lead">' + (S.me.line_name ? 'สวัสดี ' + esc(S.me.line_name) + ' — ' : '') + 'แอปนี้สำหรับหัวหน้างาน กรอกรหัสพนักงานและรหัสผูก LINE 6 หลักที่ได้จากฝ่ายบุคคล ทำครั้งเดียว</p>' +
      '<form id="f" class="panel" novalidate>' +
      '<label class="field"><span>รหัสพนักงาน</span><input type="text" name="emp_id" autocomplete="off" autocapitalize="characters" required placeholder="เช่น E-001"></label>' +
      '<label class="field"><span>รหัสผูก LINE (6 หลัก)</span><input type="text" name="code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="______"></label>' +
      '<label class="check"><input type="checkbox" name="consent" required><span>ฉันจะใช้ข้อมูลการลาและเอกสารของพนักงาน (รวมถึงใบรับรองแพทย์) เพื่องานบริหารการลาเท่านั้น ตามนโยบายคุ้มครองข้อมูลส่วนบุคคลของบริษัท</span></label>' +
      '<div id="err"></div><button class="btn primary block" type="submit">ผูกบัญชี</button></form>' +
      '<p class="muted">รหัสใช้ได้ครั้งเดียวและมีวันหมดอายุ ถ้าหมดอายุ ทำหาย หรือเปลี่ยนเครื่อง ขอรหัสใหม่จากฝ่ายบุคคล</p>';
    var code = document.querySelector('[name=code]');
    code.addEventListener('input', function () { var v = code.value.replace(/\D/g, '').slice(0, 6); if (v !== code.value) code.value = v; });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target, err = document.getElementById('err');
      if (!f.emp_id.value.trim() || !/^\d{6}$/.test(f.code.value)) { err.innerHTML = errorBox([{ msg: 'กรอกรหัสพนักงาน และรหัสผูก LINE ให้ครบ 6 หลัก' }]); return; }
      if (!f.consent.checked) { err.innerHTML = errorBox([{ msg: 'กรุณาติ๊กยอมรับก่อน' }]); return; }
      f.querySelector('button').disabled = true;
      api('link', { emp_id: f.emp_id.value.trim(), code: f.code.value }).then(function () {
        toast('ผูกบัญชีเรียบร้อย'); start();
      }).catch(function (x) { err.innerHTML = errorBox([x]); f.querySelector('button').disabled = false; });
    });
  }

  function viewNotSupervisor() {
    document.getElementById('tabbar').hidden = true;
    $app.innerHTML = '<h1>แอปนี้สำหรับหัวหน้างาน</h1><div class="notice warn">บัญชี LINE นี้ผูกกับ ' + esc(S.me.employee.name) +
      ' ซึ่งไม่ได้เป็นหัวหน้างาน จึงใช้แอปไม่ได้</div><p>การลาให้เขียนใบลาส่งหัวหน้างาน หัวหน้างานจะบันทึกในระบบให้</p>' +
      '<p class="muted">ถ้าคุณเป็นหัวหน้างาน กรุณาแจ้งฝ่ายบุคคลให้ตั้งเป็นหัวหน้าแผนก</p>';
  }

  /* ------------------------------------------------------------ home */
  function viewHome() {
    var me = S.me;
    $app.innerHTML =
      '<h1>สวัสดี ' + esc(me.employee.first_name) + '</h1>' +
      '<p class="lead">หัวหน้า' + esc(me.departments.map(function (d) { return d.name; }).join(', ')) + ' · พนักงาน ' + me.team.length + ' คน</p>' +
      '<a class="btn primary block" href="#new">บันทึกใบลาให้พนักงาน</a>' +
      '<p class="muted" style="margin-top:8px">รับใบลา (กระดาษ) จากพนักงาน แล้วบันทึกที่นี่ ฝ่ายบุคคลจะเป็นผู้อนุมัติ และแจ้งผลกลับทาง LINE นี้</p>' +
      (me.pending_count ? '<a class="notice info" style="display:block;text-decoration:none;color:inherit" href="#list"><b>รอฝ่ายบุคคลอนุมัติ ' + me.pending_count + ' ใบ</b> · แตะเพื่อดู</a>' : '') +
      '<h2>ใบลาที่กำลังจะถึง</h2><div id="upcoming"><p class="muted">กำลังโหลด…</p></div>';
    api('teamRequests').then(function (list) {
      var up = list.filter(function (r) { return r.end_date >= today() && ['PENDING', 'ESCALATED', 'APPROVED', 'CANCEL_REQUESTED'].indexOf(r.status) !== -1; })
        .sort(function (a, b) { return a.start_date < b.start_date ? -1 : 1; }).slice(0, 8);
      document.getElementById('upcoming').innerHTML = up.length ? reqList(up, true) : '<div class="empty">ยังไม่มีใบลาที่กำลังจะถึง</div>';
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
    S.form = S.form || { emp_id: '', type_id: '', start: '', end: '', reason: '', files: [] };
    var t0 = today();
    S.calMonth = S.calMonth || t0.slice(0, 7);
    var byDept = {};
    me.team.forEach(function (e) { (byDept[e.dept_name] = byDept[e.dept_name] || []).push(e); });
    var opts = Object.keys(byDept).map(function (dn) {
      return '<optgroup label="' + esc(dn) + '">' + byDept[dn].map(function (e) {
        return '<option value="' + esc(e.emp_id) + '"' + (e.emp_id === S.form.emp_id ? ' selected' : '') + '>' + esc(e.emp_id + ' · ' + e.name) + (e.emp_id === me.employee.emp_id ? ' (ตัวเอง)' : '') + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    $app.innerHTML =
      '<h1>บันทึกใบลา</h1><p class="lead">กรอกตามใบลาที่พนักงานส่งมา</p>' +
      '<label class="field"><span>พนักงาน</span><select id="emp"><option value="">— เลือกพนักงาน —</option>' + opts + '</select></label>' +
      '<div id="empinfo"></div>' +
      '<div id="formbody"' + (S.form.emp_id ? '' : ' hidden') + '><div class="two"><div>' +
      '<h2>ประเภทการลา</h2><div class="types" id="types"></div><div id="typeinfo"></div>' +
      '<h2>เลือกวัน</h2><p class="muted" style="margin-top:-4px">แตะวันแรก แล้วแตะวันสุดท้าย (ลาวันเดียวแตะวันเดียว)</p>' +
      '<div class="cal" id="cal"></div>' +
      '</div><div>' +
      '<div id="sum"></div>' +
      '<label class="field"><span>เหตุผล (ตามใบลา)</span><textarea id="reason" maxlength="300" placeholder="เช่น ไปงานแต่งญาติที่ต่างจังหวัด"></textarea></label>' +
      '<div><b>เอกสารแนบ</b> <span class="muted" id="dochint"></span><div class="files" id="files"></div>' +
      '<p class="muted" style="margin:6px 0 0">ถ่ายรูปใบลา หรือใบรับรองแพทย์แนบได้</p>' +
      '<input type="file" id="filein" accept="image/*,application/pdf" multiple hidden></div>' +
      '<div id="err"></div>' +
      '<button class="btn primary block" id="send" style="margin-top:20px">บันทึกใบลา</button>' +
      '</div></div></div>';
    document.getElementById('emp').addEventListener('change', function (e) {
      S.form.emp_id = e.target.value; S.form.type_id = ''; S.form.start = S.form.end = '';
      document.getElementById('formbody').hidden = !S.form.emp_id;
      renderEmp(); renderTypes(); renderCal(); renderSummary();
    });
    document.getElementById('reason').value = S.form.reason;
    document.getElementById('reason').addEventListener('input', function (e) { S.form.reason = e.target.value; });
    document.getElementById('filein').addEventListener('change', onFiles);
    document.getElementById('send').addEventListener('click', submitForm);
    renderEmp(); renderTypes(); renderFiles(); renderCal(); renderSummary();
  }

  /* the chosen employee: balances, first-year notice, and their department's full days */
  function renderEmp() {
    var el = document.getElementById('empinfo'), m = member(S.form.emp_id), body = document.getElementById('formbody');
    if (!m) { el.innerHTML = ''; return; }
    if (!m.self_service) {
      el.innerHTML = '<div class="notice warn">' + esc(m.name) + ' ทำงานยังไม่ครบ ' + S.me.self_service_after_months + ' เดือน บันทึกในแอปไม่ได้ กรุณาส่งใบลาให้ฝ่ายบุคคลบันทึกแทน</div>';
      body.hidden = true; return;
    }
    body.hidden = false;
    el.innerHTML = '<div class="chips small">' + m.balances.map(function (b) {
      return '<div class="chip" style="--c:' + esc(b.color) + '"><div class="chip-swatch"><span class="chip-unit">เหลือ</span><span class="chip-num">' + Math.max(b.available, 0) +
        '</span><span class="chip-unit">จาก ' + b.granted + '</span></div><div class="chip-name">' + esc(b.name_th) + '</div>' +
        (b.pending ? '<div class="chip-meta">รออนุมัติ ' + b.pending + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    var key = m.dept_id, t0 = today();
    if (!S.taken[key]) {
      S.taken[key] = [];
      api('takenDates', { emp_id: m.emp_id, from: addDays(t0, -31), to: addDays(t0, 200) }).then(function (r) { S.taken[key] = r.full; renderCal(); }).catch(function () { });
    }
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
    var m = member(S.form.emp_id), bal = m && m.balances.filter(function (b) { return b.type_id === t.type_id; })[0];
    var bits = [];
    if (bal) bits.push('เหลือ ' + Math.max(bal.available, 0) + ' วัน');
    bits.push(t.notice_days ? 'ต้องแจ้งล่วงหน้า ' + t.notice_days + ' วัน' : 'บันทึกย้อนหลังได้ภายใน 3 วันทำงานหลังกลับมา');
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
    var tk = takenFor();
    if (t && t.blocked_by_slot && tk && tk.indexOf(iso) !== -1) st.taken = true;
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
      var tk = takenFor();
      for (var d = f.start; d <= iso; d = addDays(d, 1)) if (t.blocked_by_slot && tk && tk.indexOf(d) !== -1 && !isOff(d)) blocked = true;
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
      api('preview', { emp_id: f.emp_id, type_id: f.type_id, start_date: f.start, end_date: f.end, reason: f.reason || '-', attachment_count: f.files.length }).then(function (r) {
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
    if (!f.emp_id) problems.push({ msg: 'เลือกพนักงาน' });
    if (!f.type_id) problems.push({ msg: 'เลือกประเภทการลา' });
    if (!f.start) problems.push({ msg: 'เลือกวันที่ลา' });
    if (!f.reason.trim()) problems.push({ msg: 'ระบุเหตุผล' });
    if (problems.length) { err.innerHTML = errorBox(problems); return; }
    btn.disabled = true; btn.textContent = f.files.length ? 'กำลังอัปโหลดไฟล์…' : 'กำลังบันทึก…'; err.innerHTML = '';
    uploadAll(f.files).then(function (ids) {
      btn.textContent = 'กำลังบันทึก…';
      return api('submit', { input: { emp_id: f.emp_id, type_id: f.type_id, start_date: f.start, end_date: f.end, reason: f.reason.trim() }, att_ids: ids });
    }).then(function (r) {
      if (!r.ok) { err.innerHTML = errorBox(r.errors); btn.disabled = false; btn.textContent = 'บันทึกใบลา'; return; }
      S.form = null; S.taken = {};
      toast('บันทึกแล้ว รอฝ่ายบุคคลอนุมัติ');
      refreshMe().then(function () { location.hash = '#req/' + encodeURIComponent(r.req.req_id); });
    }).catch(function (e) { err.innerHTML = errorBox([e]); btn.disabled = false; btn.textContent = 'บันทึกใบลา'; });
  }

  /* ------------------------------------------------------------ department requests */
  var FILTERS = [['open', 'รออนุมัติ', ['PENDING', 'ESCALATED', 'CANCEL_REQUESTED']], ['approved', 'อนุมัติแล้ว', ['APPROVED']],
    ['closed', 'ไม่อนุมัติ / ยกเลิก', ['REJECTED', 'AUTO_REJECTED', 'CANCELLED']], ['all', 'ทั้งหมด', null]];
  function viewList() {
    loading();
    api('teamRequests').then(function (list) {
      var draw = function () {
        var f = FILTERS.filter(function (x) { return x[0] === S.listFilter; })[0] || FILTERS[0];
        var rows = f[2] ? list.filter(function (r) { return f[2].indexOf(r.status) !== -1; }) : list;
        $app.innerHTML = '<h1>ใบลาแผนก</h1><div class="seg" role="tablist">' + FILTERS.map(function (x) {
          var cnt = x[2] ? list.filter(function (r) { return x[2].indexOf(r.status) !== -1; }).length : list.length;
          return '<button type="button" role="tab" aria-selected="' + (x[0] === f[0]) + '" data-f="' + x[0] + '">' + x[1] + ' <span class="muted">' + cnt + '</span></button>';
        }).join('') + '</div>' +
          (rows.length ? reqList(rows, true) : '<div class="empty">ไม่มีใบลาในหมวดนี้</div>');
        $app.querySelectorAll('[data-f]').forEach(function (b) { b.addEventListener('click', function () { S.listFilter = b.getAttribute('data-f'); draw(); }); });
      };
      draw();
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ team calendar */
  function viewTeam() {
    loading();
    api('deptCalendar', { days: 7 }).then(function (depts) {
      $app.innerHTML = '<h1>ตารางแผนก</h1><p class="lead">ใครลาบ้างใน 7 วันทำงานข้างหน้า</p>' + depts.map(function (d) {
        return (depts.length > 1 ? '<h2>' + esc(d.name) + '</h2>' : '') + '<div class="days">' + d.days.map(function (day) {
          return '<div class="dayrow' + (day.slot_full ? ' full' : '') + '"><div class="d1">' + DOW[day.weekday - 1] + ' ' + dmy(day.date).slice(0, 5) + '<small>' + parts(day.date).y + '</small></div>' +
            '<div>' + (day.away.length ? day.away.map(function (a) { return '<span class="person" style="--c:' + esc(a.color) + '">' + esc(a.name) + ' <span class="muted">' + esc(a.type) + '</span></span>'; }).join('') : '<span class="muted">ไม่มีคนลา</span>') + '</div>' +
            '<div class="avail"><b>' + day.available + '/' + day.headcount + '</b>อยู่ทำงาน</div></div>';
        }).join('') + '</div>';
      }).join('');
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ request detail */
  function viewRequest(id) {
    loading();
    api('request', { req_id: id }).then(function (d) {
      var r = d.req;
      var t = typeOf(r.type_id) || {};
      var needsDoc = t.doc_rule === 'REQUIRED' || (t.doc_rule === 'REQUIRED_IF_MIN_DAYS' && Number(r.working_days) >= t.doc_min_days);
      var open = ['PENDING', 'ESCALATED'].indexOf(r.status) !== -1;
      var html = '<a class="linkbtn" href="#list">‹ ใบลาแผนก</a>' +
        '<h1>' + esc(d.employee.name) + '</h1>' +
        '<p><span class="badge st-' + r.status + '">' + STATUS[r.status] + '</span></p>' +
        '<div class="panel"><dl class="kv">' +
        '<dt>ประเภท</dt><dd>' + esc(d.type.name_th) + '</dd>' +
        '<dt>วันที่</dt><dd>' + range(r.start_date, r.end_date) + '</dd>' +
        '<dt>จำนวน</dt><dd>' + r.working_days + ' วันทำงาน</dd>' +
        '<dt>เหตุผล</dt><dd>' + esc(r.reason) + '</dd>' +
        (r.decision_note ? '<dt>หมายเหตุ</dt><dd>' + esc(r.decision_note) + '</dd>' : '') +
        '<dt>บันทึกเมื่อ</dt><dd>' + thaiDate(String(r.created_at).slice(0, 10)) + ' ' + String(r.created_at).slice(11, 16) + ' น.</dd>' +
        '</dl></div>' +
        '<h2>เอกสารแนบ</h2><div class="files" id="atts">' + (d.attachments.length ? d.attachments.map(function (a) {
          return '<button type="button" class="file" data-att="' + esc(a.att_id) + '" data-mime="' + esc(a.mime) + '">' + (a.mime === 'application/pdf' ? 'PDF' : 'รูปภาพ') + '<br>แตะเพื่อดู</button>';
        }).join('') : '<span class="muted">ไม่มี</span>') + '</div>';

      if (open && needsDoc && !d.attachments.length) html += '<div class="notice warn">ยังไม่ได้แนบเอกสาร ฝ่ายบุคคลจะอนุมัติไม่ได้จนกว่าจะแนบ</div>';
      if (open || r.status === 'APPROVED') html += '<button class="btn block" id="adddoc">แนบเอกสาร</button><input type="file" id="docin" accept="image/*,application/pdf" hidden>';
      if (open) html += '<button class="btn danger block" style="margin-top:24px" id="cancel">ยกเลิกใบลา</button><p class="muted">ยังไม่ได้อนุมัติ ยกเลิกได้ทันที</p>';
      if (r.status === 'APPROVED' && r.start_date > today()) html += '<button class="btn danger block" style="margin-top:24px" id="askcancel">ขอยกเลิกใบลา</button><p class="muted">ฝ่ายบุคคลต้องอนุมัติการยกเลิก แล้วระบบจะคืนวันลาให้</p>';
      if (r.status === 'APPROVED' && r.start_date <= today()) html += '<p class="muted" style="margin-top:24px">ใบลาเริ่มแล้ว ถ้าต้องแก้ไขติดต่อฝ่ายบุคคล</p>';
      if (r.status === 'CANCEL_REQUESTED') html += '<div class="notice info" style="margin-top:16px">ส่งคำขอยกเลิกแล้ว รอฝ่ายบุคคลพิจารณา</div>';
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
    on('cancel', function () {
      openSheet('<h3>ยกเลิกใบลานี้?</h3><p>' + range(r.start_date, r.end_date) + '</p><div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn danger" id="go">ยกเลิกใบลา</button></div>', function (el) {
        el.querySelector('#go').addEventListener('click', function () { this.disabled = true; act(api('cancel', { req_id: r.req_id }), 'ยกเลิกใบลาแล้ว', function () { location.hash = '#list'; }); });
      });
    });
    on('askcancel', function () { askReason('ขอยกเลิกใบลา', 'ส่งคำขอยกเลิก', true, function (why) { act(api('cancel', { req_id: r.req_id, reason: why }), 'ส่งคำขอยกเลิกให้ฝ่ายบุคคลแล้ว'); }); });
    on('adddoc', function () { document.getElementById('docin').click(); });
    var docin = document.getElementById('docin');
    if (docin) docin.addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var prep = file.type === 'application/pdf' ? readB64(file).then(function (b) { return { name: file.name, mime: file.type, base64: b }; }) : shrinkImage(file);
      toast('กำลังอัปโหลด…');
      act(prep.then(function (f) { return uploadAll([f]); }).then(function (ids) { return api('addAttachments', { req_id: r.req_id, att_ids: ids }); }), 'แนบเอกสารแล้ว แจ้งฝ่ายบุคคลแล้ว');
    });
  }

  boot();
})();
