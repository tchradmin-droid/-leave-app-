/* ระบบลา — admin page for Super-admin / Admin / Owner (username login). Vanilla JS. */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  if (new URLSearchParams(location.search).has('preview')) CFG.MOCK = true;
  var $app = document.getElementById('app');
  var A = { session: null, user: null, setup: null };
  try { A.session = sessionStorage.getItem('adm_session'); A.user = JSON.parse(sessionStorage.getItem('adm_user') || 'null'); } catch (e) { }

  /* ------------------------------------------------------------ helpers (same conventions as app.js) */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var DOW = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
  var STATUS = { PENDING: 'รออนุมัติ', ESCALATED: 'ค้างเกินกำหนด', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ',
    AUTO_REJECTED: 'ไม่ผ่าน (แผนกเต็ม)', CANCEL_REQUESTED: 'ขอยกเลิก', CANCELLED: 'ยกเลิกแล้ว' };
  var ROLE = { ADMIN: 'Admin', SUPER_ADMIN: 'Super-admin', OWNER: 'Owner (ดูอย่างเดียว)' };
  var DOC = { NONE: 'ไม่ต้องมี', OPTIONAL: 'แนบได้ถ้ามี', REQUIRED: 'บังคับทุกครั้ง', REQUIRED_IF_MIN_DAYS: 'บังคับเมื่อลาตั้งแต่ N วัน' };
  function parts(iso) { var p = iso.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function weekday(iso) { var w = new Date(iso + 'T00:00:00Z').getUTCDay(); return w === 0 ? 7 : w; }
  function thaiDate(iso, dow) { if (!iso) return ''; var p = parts(iso); return (dow ? DOW[weekday(iso) - 1] + ' ' : '') + p.d + ' ' + MONTHS[p.m - 1] + ' ' + String(p.y + 543).slice(2); }
  function range(a, b) { return a === b ? thaiDate(a, true) : thaiDate(a, true) + ' – ' + thaiDate(b, true); }
  function stamp(s) { return s ? thaiDate(String(s).slice(0, 10)) + ' ' + String(s).slice(11, 16) : ''; }
  function canEdit() { return A.user && (A.user.role === 'ADMIN' || A.user.role === 'SUPER_ADMIN'); }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3500); }
  function errorBox(errs, kind) {
    if (!errs || !errs.length) return '';
    return '<div class="notice ' + (kind || 'bad') + '">' + (errs.length === 1 ? esc(errs[0].msg || errs[0].message || errs[0]) :
      '<ul>' + errs.map(function (e) { return '<li>' + esc(e.msg || e.message || e) + '</li>'; }).join('') + '</ul>') + '</div>';
  }
  function loading() { $app.innerHTML = '<div class="splash"><div class="spinner"></div><p>กำลังโหลด…</p></div>'; }
  function openSheet(html, onMount) {
    var root = document.getElementById('sheet-root');
    root.innerHTML = '<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    var bg = root.firstChild;
    bg.addEventListener('click', function (e) { if (e.target === bg || e.target.hasAttribute('data-close-btn')) closeSheet(); });
    if (onMount) onMount(bg.firstChild);
  }
  function closeSheet() { document.getElementById('sheet-root').innerHTML = ''; }
  function failSheet(e) { openSheet('<h3>ทำรายการไม่ได้</h3>' + errorBox(e.errors || [e]) + '<button class="btn block" data-close-btn>ปิด</button>'); }
  function formData(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return o;
  }
  function downloadCsv(name, header, rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var csv = '﻿' + [header].concat(rows).map(function (r) { return r.map(q).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ------------------------------------------------------------ API */
  function api(action, data) {
    var p = CFG.MOCK ? window.MockApi.call(action, data || {}, { session: A.session }) :
      fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, session: A.session, data: data || {} }) })
        .then(function (r) { return r.json(); }, function () { throw Object.assign(new Error('เชื่อมต่อระบบไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'), { code: 'NETWORK' }); })
        .then(function (j) { if (j.ok) return j.data; throw Object.assign(new Error(j.error.msg), { code: j.error.code, msg: j.error.msg }); });
    return p.catch(function (e) {
      if (e.code === 'AUTH') { logoutLocal(); viewLogin('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่'); }
      if (e.code === 'MUST_CHANGE_PASSWORD') viewChangePassword(true);
      throw e;
    });
  }
  function logoutLocal() { A.session = null; A.user = null; try { sessionStorage.removeItem('adm_session'); sessionStorage.removeItem('adm_user'); } catch (e) { } }

  /* ------------------------------------------------------------ boot, login, password */
  function boot() {
    if (CFG.MOCK && !window.MockApi) { var s = document.createElement('script'); s.src = 'mock.js'; s.onload = boot; document.head.appendChild(s); return; }
    if (!A.session) return viewLogin();
    if (A.user && A.user.must_change) return viewChangePassword(true);
    start();
  }
  function viewLogin(msg) {
    document.getElementById('side').hidden = true; document.getElementById('who').textContent = '';
    $app.innerHTML = '<div class="login"><h1>เข้าสู่ระบบผู้ดูแล</h1><p class="lead">สำหรับ Super-admin, Admin และ Owner · พนักงานและหัวหน้าใช้แอปใน LINE</p>' +
      (msg ? '<div class="notice warn">' + esc(msg) + '</div>' : '') +
      '<form class="panel" id="f"><label class="field"><span>ชื่อผู้ใช้</span><input type="text" name="username" autocomplete="username" required></label>' +
      '<label class="field"><span>รหัสผ่าน</span><input type="password" name="password" autocomplete="current-password" required style="width:100%;min-height:48px;padding:10px 12px;border:1px solid #AEB7C1;border-radius:6px"></label>' +
      '<div id="err"></div><button class="btn primary block">เข้าสู่ระบบ</button></form>' +
      (CFG.MOCK ? '<p class="muted">โหมดตัวอย่าง: super_admin / demo-pass-123 หรือ owner / demo-pass-123</p>' : '') + '</div>';
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(e.target), b = e.target.querySelector('button'); b.disabled = true;
      api('login', { username: d.username, password: d.password }).then(function (r) {
        A.session = r.session; A.user = r.user;
        try { sessionStorage.setItem('adm_session', r.session); sessionStorage.setItem('adm_user', JSON.stringify(r.user)); } catch (x) { }
        if (r.user.must_change) viewChangePassword(true); else start();
      }).catch(function (x) { document.getElementById('err').innerHTML = errorBox([x]); b.disabled = false; });
    });
  }
  function viewChangePassword(forced) {
    if (forced) document.getElementById('side').hidden = true;
    var html = '<div class="login"><h1>' + (forced ? 'ตั้งรหัสผ่านใหม่' : 'เปลี่ยนรหัสผ่าน') + '</h1>' +
      (forced ? '<p class="lead">เข้าครั้งแรกด้วยรหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านของคุณเอง (อย่างน้อย 10 ตัวอักษร)</p>' : '') +
      '<form class="panel" id="pf">' +
      ['old_password|รหัสผ่านเดิม', 'new_password|รหัสผ่านใหม่', 'new2|ยืนยันรหัสผ่านใหม่'].map(function (x) {
        var p = x.split('|'); return '<label class="field"><span>' + p[1] + '</span><input type="password" name="' + p[0] + '" required minlength="' + (p[0] === 'old_password' ? 1 : 10) + '" style="width:100%;min-height:48px;padding:10px 12px;border:1px solid #AEB7C1;border-radius:6px"></label>';
      }).join('') + '<div id="err"></div><button class="btn primary block">บันทึกรหัสผ่าน</button></form></div>';
    if (forced) $app.innerHTML = html; else return html;
    bindPassword();
  }
  function bindPassword() {
    var f = document.getElementById('pf'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(f), err = document.getElementById('err');
      if (d.new_password !== d.new2) { err.innerHTML = errorBox([{ msg: 'รหัสผ่านใหม่สองช่องไม่ตรงกัน' }]); return; }
      api('changePassword', { old_password: d.old_password, new_password: d.new_password }).then(function () {
        A.user.must_change = false; try { sessionStorage.setItem('adm_user', JSON.stringify(A.user)); } catch (x) { }
        toast('เปลี่ยนรหัสผ่านแล้ว'); start();
      }).catch(function (x) { err.innerHTML = errorBox([x]); });
    });
  }

  function start() {
    document.getElementById('who').textContent = A.user.full_name + ' · ' + ROLE[A.user.role];
    api('setup').then(function (s) {
      A.setup = s;
      if (s.settings.company_name) document.getElementById('brand').textContent = 'ระบบลา · ' + s.settings.company_name;
      window.onhashchange = route; route();
    }).catch(function (e) { if (e.code !== 'AUTH' && e.code !== 'MUST_CHANGE_PASSWORD') $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ nav */
  function nav(counts) {
    var items = [['dash', 'ภาพรวม'], ['inbox', 'รออนุมัติ', counts], ['file', 'บันทึกการลาแทน', null, true], ['requests', 'ใบลาทั้งหมด'], ['cal', 'ตารางงาน 7 วัน'],
      ['sep'], ['emps', 'พนักงาน', null, false], ['setup', 'ตั้งค่าการลา', null, true], ['users', 'ผู้ใช้ระบบ', null, true], ['reports', 'รายงาน'], ['audit', 'บันทึกการแก้ไข'], ['sep'], ['me', 'บัญชีของฉัน'], ['logout', 'ออกจากระบบ']];
    var cur = (location.hash.replace('#', '').split('/')[0]) || 'dash';
    if (cur === 'req') cur = 'inbox'; if (cur === 'emp') cur = 'emps';
    var side = document.getElementById('side');
    side.innerHTML = '<div class="role">' + esc(ROLE[A.user.role]) + '</div>' + items.map(function (i) {
      if (i[0] === 'sep') return '<div class="sep"></div>';
      if (i[3] && !canEdit()) return '';
      if (i[0] === 'inbox' && !canEdit()) return '';
      return '<a href="#' + i[0] + '"' + (cur === i[0] ? ' aria-current="page"' : '') + '>' + i[1] + (i[2] ? '<span class="count">' + i[2] + '</span>' : '') + '</a>';
    }).join('');
    side.hidden = false;
  }
  var lastCount = 0;
  function route() {
    closeSheet();
    var h = location.hash.replace('#', '') || 'dash', p = h.split('/');
    nav(lastCount); window.scrollTo(0, 0);
    if (canEdit()) api('inbox').then(function (l) { lastCount = l.length; nav(lastCount); }).catch(function () { });
    var views = { dash: viewDash, inbox: viewInbox, file: viewFile, requests: viewRequests, cal: viewCal, emps: viewEmployees, setup: viewSetup,
      users: viewUsers, reports: viewReports, audit: viewAudit, me: viewMe };
    if (p[0] === 'logout') { api('logout').catch(function () { }); logoutLocal(); return viewLogin(); }
    if (p[0] === 'req' && p[1]) return viewRequest(decodeURIComponent(p[1]));
    if (p[0] === 'emp' && p[1]) return viewEmployee(decodeURIComponent(p[1]));
    (views[p[0]] || viewDash)(p[1]);
  }

  function reqTable(list, opts) {
    opts = opts || {};
    if (!list.length) return '<div class="empty">' + (opts.empty || 'ไม่มีรายการ') + '</div>';
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>พนักงาน</th><th>แผนก</th><th>ประเภท</th><th>วันที่</th><th class="num">วัน</th><th>สถานะ</th>' +
      (opts.waiting ? '<th class="num">รอ (ชม.)</th>' : '') + '</tr></thead><tbody>' + list.map(function (r) {
        return '<tr class="click" data-href="#req/' + encodeURIComponent(r.req_id) + '"><td>' + esc(r.name) + '<br><span class="muted">' + esc(r.emp_id) + '</span></td><td>' + esc(deptName(r.dept_id)) +
          '</td><td><span class="swatch" style="--c:' + esc(r.color) + '"></span>' + esc(r.type_name) + '</td><td>' + range(r.start_date, r.end_date) + '</td><td class="num">' + r.working_days +
          '</td><td><span class="badge st-' + r.status + '">' + STATUS[r.status] + '</span>' + (r.for_super_admin ? '<br><span class="muted">รอ Super-admin</span>' : '') + '</td>' +
          (opts.waiting ? '<td class="num">' + r.waiting_hours + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function bindRows() { document.querySelectorAll('tr[data-href]').forEach(function (tr) { tr.addEventListener('click', function () { location.hash = tr.getAttribute('data-href'); }); }); }
  function deptName(id) { var d = (A.setup.departments || []).filter(function (x) { return x.dept_id === id; })[0]; return d ? d.name : id; }

  /* ------------------------------------------------------------ dashboard */
  function viewDash() {
    loading();
    api('dashboard').then(function (d) {
      $app.innerHTML = '<div class="page-head"><div><h1>ภาพรวมวันนี้</h1><p class="lead" style="margin:0">' + thaiDate(d.today, true) + (d.data_mode === 'TEST' ? ' · <b>ข้อมูลทดสอบ</b>' : '') + '</p></div></div>' +
        '<div class="kpis">' +
        kpi(d.away_today.length + '/' + d.headcount, 'ลาวันนี้ / พนักงานทั้งหมด', '#cal') +
        kpi(d.pending + d.escalated, 'รออนุมัติ', '#inbox', d.pending + d.escalated ? 'attn' : '') +
        kpi(d.escalated, 'ค้างเกิน 24 ชม.', '#inbox', d.escalated ? 'alert' : '') +
        kpi(d.for_super_admin, 'รอ Super-admin (ใบลาหัวหน้า)', '#inbox', d.for_super_admin ? 'attn' : '') +
        kpi(d.cancel_requests, 'ขอยกเลิก', '#inbox') +
        kpi(d.missing_cert, 'ยังไม่แนบใบรับรองแพทย์', '#requests') +
        kpi(d.linked + '/' + d.headcount, 'ผูก LINE แล้ว', '#emps', d.linked < d.headcount ? 'attn' : '') + '</div>' +
        '<div class="grid2"><div><h2>ลาวันนี้</h2>' + reqTable(d.away_today, { empty: 'วันนี้ไม่มีใครลา' }) + '</div>' +
        '<div><h2>แผนกที่มีคนลาซ้อน (14 วันข้างหน้า)</h2>' + (d.double_absences.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>แผนก</th><th class="num">คนลา</th></tr></thead><tbody>' +
          d.double_absences.map(function (x) { return '<tr><td>' + thaiDate(x.date, true) + '</td><td>' + esc(x.name) + '</td><td class="num">' + x.count + '</td></tr>'; }).join('') + '</tbody></table></div>' :
          '<div class="empty">ไม่มี</div>') + '</div></div>';
      bindRows();
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }
  function kpi(v, label, href, cls) { return '<a class="kpi ' + (cls || '') + '" href="' + href + '"><b>' + v + '</b><span>' + label + '</span></a>'; }

  /* ------------------------------------------------------------ approvals */
  function viewInbox() {
    loading();
    api('inbox').then(function (list) {
      lastCount = list.length; nav(lastCount);
      var sa = list.filter(function (r) { return r.for_super_admin || r.status === 'ESCALATED'; }), rest = list.filter(function (r) { return sa.indexOf(r) === -1; });
      $app.innerHTML = '<div class="page-head"><h1>รออนุมัติ</h1></div>' +
        '<h2>ต้องให้ Super-admin พิจารณา (ใบลาหัวหน้า / ค้างเกินกำหนด)</h2>' + reqTable(sa, { waiting: true, empty: 'ไม่มี' }) +
        '<h2>รอหัวหน้าแผนก (Admin เข้าไปตัดสินแทนได้)</h2>' + reqTable(rest, { waiting: true, empty: 'ไม่มี' });
      bindRows();
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  function viewRequest(id) {
    loading();
    api('request', { req_id: id }).then(function (d) {
      var r = d.req, active = ['PENDING', 'ESCALATED', 'APPROVED', 'CANCEL_REQUESTED'].indexOf(r.status) !== -1;
      var html = '<a class="linkbtn" href="javascript:history.back()">‹ กลับ</a><div class="page-head"><h1>' + esc(d.employee.name) + '</h1></div>' +
        '<p><span class="badge st-' + r.status + '">' + STATUS[r.status] + '</span></p><div class="grid2"><div class="panel"><dl class="kv">' +
        '<dt>รหัส</dt><dd>' + esc(d.employee.emp_id) + ' · ' + esc(deptName(d.employee.dept_id)) + '</dd><dt>ประเภท</dt><dd>' + esc(d.type.name_th) + '</dd>' +
        '<dt>วันที่</dt><dd>' + range(r.start_date, r.end_date) + '</dd><dt>จำนวน</dt><dd>' + r.working_days + ' วันทำงาน</dd><dt>เหตุผล</dt><dd>' + esc(r.reason) + '</dd>' +
        '<dt>ผู้อนุมัติ</dt><dd>' + (r.approver_emp_id === 'SUPER_ADMIN' ? 'Super-admin' : esc(r.approver_emp_id)) + '</dd>' +
        (r.decided_by ? '<dt>ตัดสินโดย</dt><dd>' + esc(r.decided_by) + ' · ' + stamp(r.decided_at) + '</dd>' : '') +
        (r.decision_note ? '<dt>หมายเหตุ</dt><dd>' + esc(r.decision_note) + '</dd>' : '') +
        '<dt>ยื่นโดย</dt><dd>' + esc(r.filed_by) + ' · ' + stamp(r.created_at) + '</dd><dt>รหัสใบลา</dt><dd>' + esc(r.req_id) + '</dd></dl></div><div>' +
        '<h2 style="margin-top:0">เอกสารแนบ</h2><div class="files">' + (d.attachments.length ? d.attachments.map(function (a) {
          return '<button type="button" class="file" data-att="' + esc(a.att_id) + '">' + (a.mime === 'application/pdf' ? 'PDF' : 'รูปภาพ') + '<br>' + a.size_kb + ' KB</button>';
        }).join('') : '<span class="muted">ไม่มี</span>') + '</div>';
      if (d.can_decide) {
        html += '<h2>ก่อนอนุมัติ</h2>' + (d.check.ok ? '<div class="notice ok">ผ่านการตรวจทุกข้อ' + (d.balance_after != null ? ' · หลังอนุมัติเหลือ ' + d.balance_after + ' วัน' : '') + '</div>' : errorBox(d.check.errors)) +
          (d.check.will_auto_reject ? '<div class="notice warn">ถ้าอนุมัติ ใบลาอื่นในแผนกวันเดียวกัน ' + d.check.will_auto_reject + ' ใบจะถูกปฏิเสธอัตโนมัติ</div>' : '') +
          (d.check.double_absence && d.check.double_absence.length ? '<div class="notice warn">แผนกมีคนลาอยู่แล้ววันที่ ' + d.check.double_absence.map(function (x) { return thaiDate(x); }).join(', ') + '</div>' : '') +
          '<div class="btn-row"><button class="btn danger" id="rej">ไม่อนุมัติ</button><button class="btn dark" id="apv"' + (d.check.ok ? '' : ' disabled') + '>อนุมัติ</button></div>';
      }
      if (canEdit() && r.status === 'CANCEL_REQUESTED') html += '<h2>พนักงานขอยกเลิก</h2><div class="btn-row"><button class="btn" id="cno">ไม่ให้ยกเลิก</button><button class="btn dark" id="cyes">อนุมัติให้ยกเลิก</button></div>';
      if (canEdit() && active) html += '<h2>ผู้ดูแลระบบ</h2><button class="btn danger" id="acancel">ยกเลิกใบลานี้ (คืนวันลา)</button>';
      html += '</div></div>';
      $app.innerHTML = html;
      document.querySelectorAll('[data-att]').forEach(function (b) {
        b.addEventListener('click', function () {
          openSheet('<h3>เอกสารแนบ</h3><div class="viewer"><div class="spinner"></div></div><button class="btn block" data-close-btn style="margin-top:12px">ปิด</button>');
          api('attachment', { att_id: b.getAttribute('data-att') }).then(function (f) {
            var src = 'data:' + f.mime + ';base64,' + f.base64, v = document.querySelector('.viewer');
            if (v) v.innerHTML = f.mime === 'application/pdf' ? '<iframe src="' + src + '" title="PDF"></iframe>' : '<img src="' + src + '" alt="เอกสารแนบ">';
          }).catch(function (e) { var v = document.querySelector('.viewer'); if (v) v.innerHTML = errorBox([e]); });
        });
      });
      var on = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      var done = function (msg) { return function (res) { if (res && res.ok === false) return failSheet(res); closeSheet(); toast(msg); viewRequest(id); }; };
      on('apv', function () { api('approve', { req_id: id }).then(done('อนุมัติแล้ว แจ้งพนักงานทาง LINE แล้ว')).catch(failSheet); });
      on('rej', function () { askReason('ไม่อนุมัติใบลา', 'ไม่อนุมัติ', function (why) { api('reject', { req_id: id, reason: why }).then(done('ไม่อนุมัติแล้ว')).catch(failSheet); }); });
      on('cyes', function () { api('decideCancel', { req_id: id, approve: true }).then(done('อนุมัติให้ยกเลิกแล้ว')).catch(failSheet); });
      on('cno', function () { api('decideCancel', { req_id: id, approve: false }).then(done('ใบลายังมีผล')).catch(failSheet); });
      on('acancel', function () { askReason('ยกเลิกใบลาโดยผู้ดูแล', 'ยกเลิกใบลา', function (why) { api('cancel', { req_id: id, reason: why }).then(done('ยกเลิกแล้ว คืนวันลาแล้ว')).catch(failSheet); }); });
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }
  function askReason(title, label, cb) {
    openSheet('<h3>' + esc(title) + '</h3><label class="field"><span>เหตุผล (บันทึกไว้และแจ้งพนักงาน)</span><textarea id="why" maxlength="300"></textarea></label>' +
      '<div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn danger" id="go">' + esc(label) + '</button></div>', function (el) {
        el.querySelector('#go').addEventListener('click', function () { var w = el.querySelector('#why').value.trim(); if (!w) return toast('กรุณาระบุเหตุผล'); this.disabled = true; cb(w); });
        el.querySelector('#why').focus();
      });
  }

  /* ------------------------------------------------------------ file on behalf */
  function viewFile() {
    var s = A.setup;
    $app.innerHTML = '<div class="page-head"><h1>บันทึกการลาแทนพนักงาน</h1></div>' +
      '<div class="notice info">ใช้กับพนักงานที่ทำงานยังไม่ครบ 1 ปี การลาฉุกเฉินที่แจ้งล่วงหน้าไม่ทัน หรือพนักงานที่ใช้แอปไม่ได้ ระบบจะ<b>ข้ามกติกาทั้งหมด</b>และอนุมัติทันที พร้อมบันทึกชื่อคุณและเหตุผล</div>' +
      '<form class="panel" id="ff"><div class="form-grid">' +
      '<label class="field"><span>พนักงาน</span><input name="emp_id" list="emplist" required placeholder="พิมพ์รหัสหรือชื่อ"><datalist id="emplist">' +
      s.employees.map(function (e) { return '<option value="' + esc(e.emp_id) + '">' + esc(e.name) + '</option>'; }).join('') + '</datalist></label>' +
      '<label class="field"><span>ประเภทการลา</span><select name="type_id" required>' + s.types.filter(function (t) { return t.active === true || t.active === 'TRUE'; })
        .map(function (t) { return '<option value="' + esc(t.type_id) + '">' + esc(t.name_th) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>วันเริ่มลา</span><input type="date" name="start_date" required></label>' +
      '<label class="field"><span>วันสุดท้ายที่ลา</span><input type="date" name="end_date" required></label></div>' +
      '<label class="field"><span>เหตุผล / ช่องทางที่พนักงานแจ้ง</span><textarea name="reason" required placeholder="เช่น โทรแจ้งป่วย 08:10 น."></textarea></label>' +
      '<label class="field"><span>เอกสารแนบ (ถ้ามี)</span><input type="file" id="fin" accept="image/*,application/pdf" multiple></label>' +
      '<div id="pv"></div><div id="err"></div><button class="btn primary">บันทึกและอนุมัติ</button></form>';
    var f = document.getElementById('ff');
    var preview = function () {
      var d = formData(f); if (!d.emp_id || !d.start_date || !d.end_date) return;
      api('previewOnBehalf', { emp_id: d.emp_id, type_id: d.type_id, start_date: d.start_date, end_date: d.end_date, reason: d.reason || '-' }).then(function (r) {
        document.getElementById('pv').innerHTML = r.ok ? '<div class="notice ok">' + r.dates.length + ' วันทำงาน</div>' + errorBox(r.warnings, 'warn') : errorBox(r.errors);
      }).catch(function (e) { document.getElementById('pv').innerHTML = errorBox([e]); });
    };
    f.addEventListener('change', preview);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = formData(f), btn = f.querySelector('button.primary'); btn.disabled = true;
      readFiles(document.getElementById('fin').files).then(function (files) {
        return files.reduce(function (p, x) { return p.then(function (ids) { return api('upload', x).then(function (r) { ids.push(r.att_id); return ids; }); }); }, Promise.resolve([]));
      }).then(function (ids) {
        return api('fileOnBehalf', { input: { emp_id: d.emp_id, type_id: d.type_id, start_date: d.start_date, end_date: d.end_date, reason: d.reason }, att_ids: ids });
      }).then(function (r) {
        if (!r.ok) { document.getElementById('err').innerHTML = errorBox(r.errors); btn.disabled = false; return; }
        toast('บันทึกการลาแล้ว แจ้งพนักงานทาง LINE แล้ว'); location.hash = '#req/' + encodeURIComponent(r.req.req_id);
      }).catch(function (x) { document.getElementById('err').innerHTML = errorBox([x]); btn.disabled = false; });
    });
  }
  function readFiles(list) {
    return Promise.all(Array.prototype.map.call(list || [], function (file) {
      return new Promise(function (res, rej) {
        if (file.size > 8 * 1024 * 1024) return rej(new Error('ไฟล์ ' + file.name + ' ใหญ่เกิน 8 MB'));
        var r = new FileReader(); r.onload = function () { res({ name: file.name, mime: file.type === 'image/jpg' ? 'image/jpeg' : file.type, base64: String(r.result).split(',')[1] }); };
        r.onerror = rej; r.readAsDataURL(file);
      });
    }));
  }

  /* ------------------------------------------------------------ all requests */
  function viewRequests() {
    var s = A.setup;
    $app.innerHTML = '<div class="page-head"><h1>ใบลาทั้งหมด</h1></div><form class="toolbar" id="flt">' +
      '<select name="dept_id"><option value="">ทุกแผนก</option>' + s.departments.map(function (d) { return '<option value="' + esc(d.dept_id) + '">' + esc(d.name) + '</option>'; }).join('') + '</select>' +
      '<select name="status"><option value="">ทุกสถานะ</option>' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k] + '</option>'; }).join('') + '</select>' +
      '<input type="date" name="from" title="ตั้งแต่"><input type="date" name="to" title="ถึง"><input name="q" placeholder="ค้นหาชื่อ/รหัส">' +
      '<button class="btn sm dark">ค้นหา</button><button type="button" class="btn sm" id="csv">ส่งออก Excel (CSV)</button></form><div id="res"></div>';
    var f = document.getElementById('flt'), last = [];
    var run = function () {
      var d = formData(f);
      document.getElementById('res').innerHTML = '<div class="spinner"></div>';
      api('requests', { dept_id: d.dept_id, status: d.status, from: d.from, to: d.to }).then(function (list) {
        var q = d.q.trim().toLowerCase();
        last = q ? list.filter(function (r) { return (r.name + ' ' + r.emp_id).toLowerCase().indexOf(q) !== -1; }) : list;
        document.getElementById('res').innerHTML = '<p class="muted">' + last.length + ' รายการ</p>' + reqTable(last);
        bindRows();
      }).catch(function (e) { document.getElementById('res').innerHTML = errorBox([e]); });
    };
    f.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    document.getElementById('csv').addEventListener('click', function () {
      downloadCsv('leave-requests.csv', ['รหัสใบลา', 'รหัสพนักงาน', 'ชื่อ', 'แผนก', 'ประเภท', 'วันเริ่ม', 'วันสุดท้าย', 'วันทำงาน', 'สถานะ', 'เหตุผล', 'หมายเหตุ', 'ยื่นเมื่อ', 'แนบไฟล์'],
        last.map(function (r) { return [r.req_id, r.emp_id, r.name, deptName(r.dept_id), r.type_name, r.start_date, r.end_date, r.working_days, STATUS[r.status], r.reason, r.decision_note, r.created_at, r.attachments]; }));
    });
    run();
  }

  /* ------------------------------------------------------------ 7-day schedule, all departments */
  function viewCal() {
    loading();
    api('deptCalendar', { days: 7 }).then(function (depts) {
      var days = depts.length ? depts[0].days : [];
      $app.innerHTML = '<div class="page-head"><h1>ตารางงาน 7 วันทำงานข้างหน้า</h1><button class="btn sm" onclick="window.print()">พิมพ์ / PDF</button></div>' +
        '<div class="tbl-wrap"><table class="tbl sched"><thead><tr><th>แผนก</th>' + days.map(function (d) { return '<th>' + thaiDate(d.date, true) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        depts.map(function (dp) {
          return '<tr><td><b>' + esc(dp.name) + '</b></td>' + dp.days.map(function (d) {
            return '<td class="' + (d.slot_full ? 'full' : '') + '">' + (d.away.length ? d.away.map(function (a) { return '<span class="nm"><span class="swatch" style="--c:' + esc(a.color) + '"></span>' + esc(a.name) + '</span>'; }).join('') : '') +
              '<span class="muted">' + d.available + '/' + d.headcount + ' อยู่</span></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="muted">ช่องสีแดง = แผนกมีคนลาครบโควตาแล้ว</p>';
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ employees */
  function viewEmployees() {
    loading();
    api('employees').then(function (list) {
      $app.innerHTML = '<div class="page-head"><h1>พนักงาน</h1>' + (canEdit() ? '<a class="btn sm primary" href="#emp/new">เพิ่มพนักงาน</a>' : '') + '</div>' +
        '<div class="toolbar"><input id="q" placeholder="ค้นหาชื่อ/รหัส"><select id="dp"><option value="">ทุกแผนก</option>' +
        A.setup.departments.map(function (d) { return '<option value="' + esc(d.dept_id) + '">' + esc(d.name) + '</option>'; }).join('') +
        '</select><select id="st"><option value="ACTIVE">ทำงานอยู่</option><option value="RESIGNED">ลาออก</option><option value="">ทั้งหมด</option></select>' +
        '<select id="ln"><option value="">LINE ทั้งหมด</option><option value="no">ยังไม่ผูก LINE</option></select>' +
        '<button class="btn sm" id="csv">ส่งออก CSV</button></div><div id="res"></div>';
      var draw = function () {
        var q = document.getElementById('q').value.trim().toLowerCase(), dp = document.getElementById('dp').value, st = document.getElementById('st').value, ln = document.getElementById('ln').value;
        var rows = list.filter(function (e) {
          return (!q || (e.name + ' ' + e.emp_id).toLowerCase().indexOf(q) !== -1) && (!dp || e.dept_id === dp) && (!st || e.status === st) && (!ln || !e.line_linked);
        });
        document.getElementById('res').innerHTML = '<p class="muted">' + rows.length + ' คน</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>แผนก</th><th>ตำแหน่ง</th><th>เริ่มงาน</th><th>LINE</th><th>สถานะ</th></tr></thead><tbody>' +
          rows.map(function (e) {
            return '<tr class="click" data-href="#emp/' + encodeURIComponent(e.emp_id) + '"><td>' + esc(e.emp_id) + '</td><td>' + esc(e.name) + (e.is_head ? ' <span class="badge st-APPROVED">หัวหน้า</span>' : '') + '</td><td>' + esc(e.dept_name) +
              '</td><td>' + esc(e.position) + '</td><td>' + thaiDate(e.hire_date) + '</td><td>' + (e.line_linked ? '✓' : '<span class="muted">ยังไม่ผูก</span>') + '</td><td>' + (e.status === 'ACTIVE' ? 'ทำงาน' : 'ลาออก') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        bindRows();
        document.getElementById('csv').onclick = function () {
          downloadCsv('employees.csv', ['รหัส', 'ชื่อ', 'แผนก', 'ตำแหน่ง', 'วันเริ่มงาน', 'ผูก LINE', 'สถานะ'], rows.map(function (e) { return [e.emp_id, e.name, e.dept_name, e.position, e.hire_date, e.line_linked ? 'ใช่' : 'ไม่', e.status]; }));
        };
      };
      ['q', 'dp', 'st', 'ln'].forEach(function (id) { document.getElementById(id).addEventListener('input', draw); });
      draw();
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  function viewEmployee(id) {
    var isNew = id === 'new';
    var load = isNew ? Promise.resolve([null, null]) : Promise.all([api('employees'), api('employeeBalances', { emp_id: id })]);
    loading();
    load.then(function (res) {
      var b = res[1];
      var e = isNew ? { status: 'ACTIVE', title: 'นาย' } : b && b.employee;
      if (e && !isNew) { var li = res[0].filter(function (x) { return x.emp_id === id; })[0]; e.name = li ? li.name : b.name; }
      if (!e) { $app.innerHTML = errorBox([{ msg: 'ไม่พบพนักงาน' }]); return; }
      var dis = canEdit() ? '' : ' disabled';
      var f = function (name, label, type, val, extra) {
        return '<label class="field"><span>' + label + '</span><input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(val || '') + '"' + (extra || '') + dis + '></label>';
      };
      $app.innerHTML = '<a class="linkbtn" href="#emps">‹ พนักงาน</a><div class="page-head"><h1>' + (isNew ? 'เพิ่มพนักงาน' : esc(e.name)) + '</h1></div>' +
        '<div class="grid2"><form class="panel" id="ef"><h2 style="margin-top:0">ข้อมูลพนักงาน</h2><div class="form-grid">' +
        f('emp_id', 'รหัสพนักงาน', 'text', e.emp_id, isNew ? ' required' : ' readonly') +
        '<label class="field"><span>คำนำหน้า</span><select name="title"' + dis + '>' + ['นาย', 'นาง', 'นางสาว'].map(function (t) { return '<option' + (e.title === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></label>' +
        f('first_name', 'ชื่อ', 'text', e.first_name) + f('last_name', 'นามสกุล', 'text', e.last_name) + f('nickname', 'ชื่อเล่น', 'text', e.nickname) +
        '<label class="field"><span>แผนก</span><select name="dept_id"' + dis + '>' + A.setup.departments.map(function (d) { return '<option value="' + esc(d.dept_id) + '"' + (d.dept_id === e.dept_id ? ' selected' : '') + '>' + esc(d.name) + '</option>'; }).join('') + '</select></label>' +
        f('position', 'ตำแหน่ง', 'text', e.position) + f('hire_date', 'วันเริ่มงาน', 'date', e.hire_date) + f('birth_date', 'วันเกิด (ใช้ยืนยันตอนผูก LINE)', 'date', e.birth_date) +
        f('phone', 'เบอร์มือถือ', 'text', e.phone) + f('email', 'อีเมล', 'email', e.email) +
        '<label class="field"><span>สถานะ</span><select name="status"' + dis + '><option value="ACTIVE"' + (e.status === 'ACTIVE' ? ' selected' : '') + '>ทำงาน</option><option value="RESIGNED"' + (e.status === 'RESIGNED' ? ' selected' : '') + '>ลาออก</option></select></label>' +
        f('resign_date', 'วันที่ลาออก', 'date', e.resign_date) + '</div>' +
        (isNew ? '' : '<p class="muted">เปลี่ยนวันเริ่มงานแล้ว ปีการลาจะคำนวณใหม่</p>') +
        '<div id="err"></div>' + (canEdit() ? '<button class="btn primary">บันทึก</button>' : '') +
        (!isNew && canEdit() && e.line_linked ? ' <button type="button" class="btn" id="unlink">ยกเลิกการผูก LINE</button>' : '') + '</form>' +
        (isNew ? '' : '<div><h2 style="margin-top:0">ยอดวันลาปีนี้</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ประเภท</th><th class="num">สิทธิ์</th><th class="num">ใช้แล้ว</th><th class="num">รออนุมัติ</th><th class="num">คงเหลือ</th></tr></thead><tbody>' +
          b.balances.map(function (x) { return '<tr><td>' + esc(x.name_th) + '</td><td class="num">' + x.granted + '</td><td class="num">' + x.used + '</td><td class="num">' + x.pending + '</td><td class="num' + (x.available < 0 ? ' neg' : '') + '">' + x.available + '</td></tr>'; }).join('') +
          '</tbody></table></div><p class="muted">ปีการลา ' + (b.balances[0] ? thaiDate(b.balances[0].leave_year_start) + ' – ' + thaiDate(b.balances[0].leave_year_end) : '') + '</p>' +
          (canEdit() ? '<h2>ปรับยอดวันลา</h2><form class="panel" id="adj"><div class="form-grid"><label class="field"><span>ประเภท</span><select name="type_id">' +
            b.balances.map(function (x) { return '<option value="' + x.type_id + '">' + esc(x.name_th) + '</option>'; }).join('') + '</select></label>' +
            '<label class="field"><span>จำนวนวัน (+ เพิ่ม / − ลด)</span><input type="number" name="delta" step="1" required></label></div>' +
            '<label class="field"><span>เหตุผล</span><input name="reason" required></label><button class="btn dark">บันทึกการปรับ</button></form>' : '') +
          '<h2>ประวัติยอดวันลา</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>เมื่อ</th><th>ประเภท</th><th>รายการ</th><th class="num">วัน</th><th>หมายเหตุ</th></tr></thead><tbody>' +
          b.ledger.slice().reverse().slice(0, 60).map(function (l) {
            var k = { GRANT: 'ได้รับสิทธิ์', TAKE: 'ลา', OPENING_USED: 'ใช้ไปก่อนเริ่มระบบ', REVERSE: 'คืนวันลา', ADJUST: 'ปรับยอด' }[l.kind] || l.kind;
            return '<tr><td>' + stamp(l.at) + '</td><td>' + esc(l.type_id) + '</td><td>' + k + (l.req_id ? ' <a href="#req/' + encodeURIComponent(l.req_id) + '">ใบลา</a>' : '') + '</td><td class="num' + (l.delta_days < 0 ? ' neg' : '') + '">' + (l.delta_days > 0 ? '+' : '') + l.delta_days + '</td><td>' + esc(l.note) + '</td></tr>';
          }).join('') + '</tbody></table></div></div>') + '</div>';
      var ef = document.getElementById('ef');
      if (canEdit()) ef.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var d = formData(ef);
        api('saveEmployee', d).then(function () { toast('บันทึกแล้ว'); api('setup').then(function (s) { A.setup = s; }); location.hash = '#emp/' + encodeURIComponent(d.emp_id); if (!isNew) viewEmployee(d.emp_id); })
          .catch(function (x) { document.getElementById('err').innerHTML = errorBox([x]); });
      });
      var ul = document.getElementById('unlink');
      if (ul) ul.addEventListener('click', function () {
        openSheet('<h3>ยกเลิกการผูก LINE?</h3><p>ใช้เมื่อพนักงานเปลี่ยนบัญชี LINE หรือผูกผิดคน พนักงานต้องยืนยันตัวตนใหม่ในแอป</p><div class="btn-row"><button class="btn" data-close-btn>กลับ</button><button class="btn danger" id="go">ยกเลิกการผูก</button></div>', function (el) {
          el.querySelector('#go').addEventListener('click', function () { api('unlinkLine', { emp_id: id }).then(function () { closeSheet(); toast('ยกเลิกการผูก LINE แล้ว'); viewEmployee(id); }).catch(failSheet); });
        });
      });
      var adj = document.getElementById('adj');
      if (adj) adj.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var d = formData(adj);
        api('adjustBalance', { emp_id: id, type_id: d.type_id, delta: Number(d.delta), reason: d.reason }).then(function () { toast('ปรับยอดแล้ว แจ้งพนักงานทาง LINE แล้ว'); viewEmployee(id); }).catch(failSheet);
      });
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ setup: departments, holidays, leave types, settings */
  function viewSetup(tab) {
    tab = tab || 'depts';
    var tabs = [['depts', 'แผนก'], ['holidays', 'วันหยุด'], ['types', 'ประเภทการลา'], ['settings', 'การตั้งค่าทั่วไป']];
    api('setup').then(function (s) {
      A.setup = s;
      var html = '<div class="page-head"><h1>ตั้งค่าการลา</h1></div><div class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" aria-selected="' + (t[0] === tab) + '" onclick="location.hash=\'#setup/' + t[0] + '\'">' + t[1] + '</button>';
      }).join('') + '</div>';
      var empName = function (id) { var e = s.employees.filter(function (x) { return x.emp_id === id; })[0]; return e ? e.name : id; };
      if (tab === 'depts') {
        html += '<button class="btn sm primary" id="add">เพิ่มแผนก</button><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อแผนก</th><th>หัวหน้า</th><th class="num">ลาพร้อมกันได้</th><th>ใช้งาน</th></tr></thead><tbody>' +
          s.departments.map(function (d) { return '<tr class="click" data-dept="' + esc(d.dept_id) + '"><td>' + esc(d.dept_id) + '</td><td>' + esc(d.name) + '</td><td>' + esc(empName(d.head_emp_id)) + '</td><td class="num">' + d.max_concurrent + '</td><td>' + (d.active === false || d.active === 'FALSE' ? 'ปิด' : '✓') + '</td></tr>'; }).join('') +
          '</tbody></table></div>';
      } else if (tab === 'holidays') {
        html += '<form class="toolbar" id="hf"><input type="date" name="date" required><input name="name_th" placeholder="ชื่อวันหยุด" required><button class="btn sm primary">เพิ่มวันหยุด</button></form>' +
          '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th></th></tr></thead><tbody>' +
          s.holidays.map(function (h) { return '<tr><td>' + thaiDate(h.date, true) + '</td><td>' + esc(h.name_th) + '</td><td class="num"><button class="btn sm danger" data-del="' + h.date + '">ลบ</button></td></tr>'; }).join('') +
          '</tbody></table></div>' + (s.holidays.length ? '' : '<div class="empty">ยังไม่มีวันหยุด ระบบจะนับวันนักขัตฤกษ์เป็นวันทำงาน</div>');
      } else if (tab === 'types') {
        html += '<button class="btn sm primary" id="addt">เพิ่มประเภทการลา</button><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>ประเภท</th><th class="num">โควตา/ปี</th><th class="num">สิทธิ์หลัง (เดือน)</th><th class="num">แจ้งล่วงหน้า</th><th>นับโควตาแผนก</th><th>บล็อกเมื่อแผนกเต็ม</th><th>เอกสาร</th><th>ใช้งาน</th></tr></thead><tbody>' +
          s.types.map(function (t) {
            var yes = function (v) { return v === true || v === 'TRUE' ? '✓' : '–'; };
            return '<tr class="click" data-type="' + esc(t.type_id) + '"><td><span class="swatch" style="--c:' + esc(t.color) + '"></span>' + esc(t.name_th) + ' <span class="muted">' + esc(t.type_id) + '</span></td><td class="num">' + (t.annual_quota === '' ? 'ไม่จำกัด' : t.annual_quota) +
              '</td><td class="num">' + t.eligible_after_months + '</td><td class="num">' + t.notice_days + ' วัน</td><td>' + yes(t.takes_slot) + '</td><td>' + yes(t.blocked_by_slot) + '</td><td>' + esc(DOC[t.doc_rule] || t.doc_rule) + (t.doc_rule === 'REQUIRED_IF_MIN_DAYS' ? ' (' + t.doc_min_days + ')' : '') + '</td><td>' + yes(t.active) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      } else {
        var st = s.settings, days = String(st.work_days).split(',');
        html += '<form class="panel" id="sf" style="max-width:640px"><label class="field"><span>ชื่อบริษัท (แสดงบนหัวแอป)</span><input name="company_name" value="' + esc(st.company_name) + '"></label>' +
          '<div class="field"><span style="font-weight:600;display:block;margin-bottom:6px">วันทำงาน</span>' + ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(function (n, i) {
            return '<label class="chk" style="display:inline-flex;margin-right:14px"><input type="checkbox" name="wd' + (i + 1) + '"' + (days.indexOf(String(i + 1)) !== -1 ? ' checked' : '') + '>' + n + '</label>';
          }).join('') + '</div><div class="form-grid">' +
          [['self_service_after_months', 'ยื่นลาเองได้หลังทำงาน (เดือน)'], ['escalation_hours', 'ส่งต่อ Super-admin เมื่อค้าง (ชม.)'], ['dept_max_concurrent', 'ค่าเริ่มต้นลาพร้อมกันต่อแผนก'],
            ['cert_reminder_max', 'เตือนแนบใบรับรองแพทย์สูงสุด (ครั้ง)'], ['attachment_retention_months', 'เก็บไฟล์แนบ (เดือน)'], ['session_minutes', 'อายุการเข้าระบบผู้ดูแล (นาที)']].map(function (x) {
              return '<label class="field"><span>' + x[1] + '</span><input type="number" min="0" name="' + x[0] + '" value="' + esc(st[x[0]]) + '"></label>';
            }).join('') + '</div><div id="err"></div><button class="btn primary">บันทึกการตั้งค่า</button></form>';
      }
      $app.innerHTML = html;
      if (!canEdit()) return;
      var on = function (id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      on('add', function () { deptForm({ active: true, max_concurrent: s.settings.dept_max_concurrent || 1 }, true, s); });
      document.querySelectorAll('[data-dept]').forEach(function (tr) { tr.addEventListener('click', function () { deptForm(s.departments.filter(function (d) { return d.dept_id === tr.getAttribute('data-dept'); })[0], false, s); }); });
      on('addt', function () { typeForm({ active: true, doc_rule: 'OPTIONAL', notice_days: 7, eligible_after_months: 0, takes_slot: true, blocked_by_slot: true, color: '#78909C' }, true); });
      document.querySelectorAll('[data-type]').forEach(function (tr) { tr.addEventListener('click', function () { typeForm(s.types.filter(function (t) { return t.type_id === tr.getAttribute('data-type'); })[0], false); }); });
      var hf = document.getElementById('hf');
      if (hf) hf.addEventListener('submit', function (e) { e.preventDefault(); api('saveHoliday', formData(hf)).then(function () { toast('เพิ่มวันหยุดแล้ว'); viewSetup('holidays'); }).catch(failSheet); });
      document.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { api('deleteHoliday', { date: b.getAttribute('data-del') }).then(function () { toast('ลบแล้ว'); viewSetup('holidays'); }).catch(failSheet); }); });
      var sf = document.getElementById('sf');
      if (sf) sf.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = formData(sf), wd = [];
        for (var i = 1; i <= 7; i++) { if (d['wd' + i]) wd.push(i); delete d['wd' + i]; }
        if (!wd.length) return toast('เลือกวันทำงานอย่างน้อย 1 วัน');
        d.work_days = wd.join(',');
        api('saveSettings', d).then(function () { toast('บันทึกการตั้งค่าแล้ว'); viewSetup('settings'); }).catch(function (x) { document.getElementById('err').innerHTML = errorBox([x]); });
      });
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }
  function deptForm(d, isNew, s) {
    openSheet('<h3>' + (isNew ? 'เพิ่มแผนก' : 'แก้ไขแผนก') + '</h3><form id="df"><div class="form-grid">' +
      '<label class="field"><span>รหัสแผนก</span><input name="dept_id" value="' + esc(d.dept_id || '') + '"' + (isNew ? ' required' : ' readonly') + '></label>' +
      '<label class="field"><span>ชื่อแผนก</span><input name="name" value="' + esc(d.name || '') + '" required></label>' +
      '<label class="field"><span>หัวหน้าแผนก</span><select name="head_emp_id"><option value="">— ยังไม่มี —</option>' + s.employees.map(function (e) { return '<option value="' + esc(e.emp_id) + '"' + (e.emp_id === d.head_emp_id ? ' selected' : '') + '>' + esc(e.emp_id + ' ' + e.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>ลาพร้อมกันได้ (คน/วัน)</span><input type="number" min="1" name="max_concurrent" value="' + esc(d.max_concurrent) + '"></label></div>' +
      '<label class="chk"><input type="checkbox" name="active"' + (d.active === false || d.active === 'FALSE' ? '' : ' checked') + '>ใช้งาน</label>' +
      '<div class="btn-row"><button type="button" class="btn" data-close-btn>ยกเลิก</button><button class="btn primary">บันทึก</button></div></form>', function (el) {
        el.querySelector('#df').addEventListener('submit', function (e) { e.preventDefault(); api('saveDepartment', formData(e.target)).then(function () { closeSheet(); toast('บันทึกแล้ว'); viewSetup('depts'); }).catch(failSheet); });
      });
  }
  function typeForm(t, isNew) {
    var yes = function (v) { return v === true || v === 'TRUE'; };
    openSheet('<h3>' + (isNew ? 'เพิ่มประเภทการลา' : 'แก้ไข ' + esc(t.name_th)) + '</h3><form id="tf"><div class="form-grid">' +
      '<label class="field"><span>รหัส (อังกฤษ)</span><input name="type_id" value="' + esc(t.type_id || '') + '"' + (isNew ? ' required placeholder="เช่น FUNERAL"' : ' readonly') + '></label>' +
      '<label class="field"><span>ชื่อประเภท</span><input name="name_th" value="' + esc(t.name_th || '') + '" required></label>' +
      '<label class="field"><span>โควตาต่อปี (ว่าง = ไม่จำกัด)</span><input type="number" min="0" name="annual_quota" value="' + esc(t.annual_quota) + '"></label>' +
      '<label class="field"><span>สูงสุดต่อครั้ง (วัน)</span><input type="number" min="0" name="max_days_per_request" value="' + esc(t.max_days_per_request) + '"></label>' +
      '<label class="field"><span>มีสิทธิ์หลังทำงาน (เดือน)</span><input type="number" min="0" name="eligible_after_months" value="' + esc(t.eligible_after_months) + '"></label>' +
      '<label class="field"><span>แจ้งล่วงหน้า (วัน, 0 = ยื่นย้อนหลังได้)</span><input type="number" min="0" name="notice_days" value="' + esc(t.notice_days) + '"></label>' +
      '<label class="field"><span>ยื่นย้อนหลังได้ภายใน (วันทำงาน)</span><input type="number" min="0" name="filing_window_days" value="' + esc(t.filing_window_days) + '"></label>' +
      '<label class="field"><span>เอกสาร</span><select name="doc_rule">' + Object.keys(DOC).map(function (k) { return '<option value="' + k + '"' + (t.doc_rule === k ? ' selected' : '') + '>' + DOC[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span>N วัน (ถ้าบังคับเมื่อลาตั้งแต่ N วัน)</span><input type="number" min="0" name="doc_min_days" value="' + esc(t.doc_min_days) + '"></label>' +
      '<label class="field"><span>การจ่ายค่าจ้าง (บันทึก)</span><input name="paid_note" value="' + esc(t.paid_note || '') + '"></label>' +
      '<label class="field"><span>สี</span><input type="color" name="color" value="' + esc(t.color || '#78909C') + '" style="min-height:48px"></label></div>' +
      '<label class="chk"><input type="checkbox" name="takes_slot"' + (yes(t.takes_slot) ? ' checked' : '') + '>นับเป็นคนลาของแผนก (คนอื่นลาวันเดียวกันไม่ได้)</label>' +
      '<label class="chk"><input type="checkbox" name="blocked_by_slot"' + (yes(t.blocked_by_slot) ? ' checked' : '') + '>บล็อกเมื่อแผนกมีคนลาแล้ว</label>' +
      '<label class="chk"><input type="checkbox" name="active"' + (yes(t.active) ? ' checked' : '') + '>เปิดใช้งาน</label>' +
      '<div class="btn-row"><button type="button" class="btn" data-close-btn>ยกเลิก</button><button class="btn primary">บันทึก</button></div></form>', function (el) {
        el.querySelector('#tf').addEventListener('submit', function (e) { e.preventDefault(); api('saveLeaveType', formData(e.target)).then(function () { closeSheet(); toast('บันทึกแล้ว'); viewSetup('types'); }).catch(failSheet); });
      });
  }

  /* ------------------------------------------------------------ users */
  function viewUsers() {
    loading();
    api('adminUsers').then(function (list) {
      $app.innerHTML = '<div class="page-head"><h1>ผู้ใช้ระบบ (username)</h1><button class="btn sm primary" id="add">เพิ่มผู้ใช้</button></div>' +
        '<p class="lead">พนักงานและหัวหน้าเข้าด้วย LINE ไม่ต้องสร้างที่นี่</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>บทบาท</th><th>LINE แจ้งเตือน</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
        list.map(function (u) {
          return '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.full_name) + '</td><td>' + esc(ROLE[u.role]) + '</td><td>' + (u.line_linked ? '✓' : '<span class="muted">ยังไม่ผูก</span>') + '</td><td>' +
            (!u.active ? 'ปิดใช้งาน' : u.locked ? 'ล็อกชั่วคราว' : u.must_change ? 'รอตั้งรหัสผ่าน' : 'ใช้งาน') + '</td><td class="num"><button class="btn sm" data-reset="' + esc(u.username) + '">รีเซ็ตรหัสผ่าน</button> ' +
            '<button class="btn sm" data-toggle="' + esc(u.username) + '" data-role="' + u.role + '" data-active="' + u.active + '">' + (u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      var showPw = function (title, pw) {
        openSheet('<h3>' + esc(title) + '</h3><p>รหัสผ่านชั่วคราว (แสดงครั้งเดียว) — แจ้งเจ้าของบัญชีแบบส่วนตัว ระบบจะให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก</p><div class="pw">' + esc(pw) + '</div><button class="btn block" data-close-btn style="margin-top:16px">ปิด</button>');
      };
      document.getElementById('add').addEventListener('click', function () {
        openSheet('<h3>เพิ่มผู้ใช้</h3><form id="uf"><label class="field"><span>ชื่อผู้ใช้ (อังกฤษ/ตัวเลข อย่างน้อย 4 ตัว)</span><input name="username" required></label>' +
          '<label class="field"><span>ชื่อ-นามสกุล</span><input name="full_name" required></label><label class="field"><span>บทบาท</span><select name="role"><option value="ADMIN">Admin</option><option value="OWNER">Owner (ดูอย่างเดียว)</option>' +
          (A.user.role === 'SUPER_ADMIN' ? '<option value="SUPER_ADMIN">Super-admin</option>' : '') + '</select></label><label class="field"><span>อีเมล (ถ้ามี)</span><input name="email" type="email"></label>' +
          '<div class="btn-row"><button type="button" class="btn" data-close-btn>ยกเลิก</button><button class="btn primary">สร้างบัญชี</button></div></form>', function (el) {
            el.querySelector('#uf').addEventListener('submit', function (e) {
              e.preventDefault(); var d = formData(e.target);
              api('saveAdminUser', d).then(function (r) { viewUsers(); showPw('สร้างบัญชี ' + d.username + ' แล้ว', r.temp_password); }).catch(failSheet);
            });
          });
      });
      document.querySelectorAll('[data-reset]').forEach(function (b) { b.addEventListener('click', function () { var u = b.getAttribute('data-reset'); api('resetAdminPassword', { username: u }).then(function (r) { viewUsers(); showPw('รีเซ็ตรหัสผ่าน ' + u, r.temp_password); }).catch(failSheet); }); });
      document.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.addEventListener('click', function () {
          api('saveAdminUser', { username: b.getAttribute('data-toggle'), role: b.getAttribute('data-role'), active: b.getAttribute('data-active') !== 'true' }).then(function () { toast('บันทึกแล้ว'); viewUsers(); }).catch(failSheet);
        });
      });
    }).catch(function (e) { $app.innerHTML = errorBox([e]); });
  }

  /* ------------------------------------------------------------ reports */
  function viewReports(tab) {
    tab = tab || 'overview';
    var tabs = [['overview', 'ภาพรวม'], ['balances', 'ยอดวันลาคงเหลือ'], ['payroll', 'สรุปสำหรับเงินเดือน'], ['history', 'ประวัติการลา']];
    $app.innerHTML = '<div class="page-head"><h1>รายงาน</h1><button class="btn sm" onclick="window.print()">พิมพ์ / PDF</button></div><div class="tabs">' + tabs.map(function (t) {
      return '<button aria-selected="' + (t[0] === tab) + '" onclick="location.hash=\'#reports/' + t[0] + '\'">' + t[1] + '</button>';
    }).join('') + '</div><div id="rep"><div class="spinner"></div></div>';
    var $r = document.getElementById('rep');
    if (tab === 'history') { location.hash = '#requests'; return; }
    if (tab === 'overview') api('reportStats', {}).then(function (s) {
      var max = Math.max.apply(null, s.months.map(function (m) { return m.days; }).concat([1]));
      var bars = function (rows, label, val) {
        var mx = Math.max.apply(null, rows.map(val).concat([1]));
        return rows.length ? '<div class="bars">' + rows.map(function (x) {
          return '<div class="bar-row"><span>' + esc(label(x)) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + (val(x) / mx * 100) + '%"></div></div><span class="v">' + val(x) + '</span></div>';
        }).join('') + '</div>' : '<div class="empty">ยังไม่มีข้อมูล</div>';
      };
      $r.innerHTML = '<p class="lead">วันลาที่อนุมัติแล้ว ' + thaiDate(s.from) + ' – ' + thaiDate(s.to) + ' (นับวันทำงาน)</p>' +
        '<div class="panel"><h2 style="margin-top:0">วันลารวมต่อเดือน</h2><div class="cols" role="img" aria-label="วันลารวมต่อเดือน">' + s.months.map(function (m) {
          var p = parts(m.month + '-01');
          return '<div class="col" tabindex="0"><span class="tip">' + MONTHS[p.m - 1] + ' ' + String(p.y + 543).slice(2) + ': ' + m.days + ' วัน</span><div class="fill" style="height:' + (m.days / max * 100) + '%"></div></div>';
        }).join('') + '</div><div class="col-labels">' + s.months.map(function (m) { return '<span>' + MONTHS[parts(m.month + '-01').m - 1] + '</span>'; }).join('') + '</div></div>' +
        '<div class="grid2"><div class="panel"><h2 style="margin-top:0">ตามประเภทการลา (วัน)</h2>' + bars(s.by_type, function (x) { return x.name; }, function (x) { return x.days; }) + '</div>' +
        '<div class="panel"><h2 style="margin-top:0">ตามแผนก (วัน)</h2>' + bars(s.by_dept, function (x) { return x.name; }, function (x) { return x.days; }) + '</div>' +
        '<div class="panel"><h2 style="margin-top:0">ลาป่วยตามวันในสัปดาห์</h2><p class="muted" style="margin-top:-6px">ลาป่วยวันจันทร์/ศุกร์สูงผิดปกติ ควรพูดคุยกับพนักงาน</p>' +
        bars(s.sick_by_weekday.map(function (v, i) { return { d: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'][i], v: v }; }).filter(function (x, i) { return i < 6 || x.v; }), function (x) { return x.d; }, function (x) { return x.v; }) + '</div>' +
        '<div class="panel"><h2 style="margin-top:0">ความเร็วในการอนุมัติ</h2>' + (s.approval_speed.length ? '<table class="tbl"><thead><tr><th>ผู้อนุมัติ</th><th class="num">จำนวน</th><th class="num">เฉลี่ย (ชม.)</th></tr></thead><tbody>' +
          s.approval_speed.map(function (a) { return '<tr><td>' + esc(a.approver) + '</td><td class="num">' + a.decisions + '</td><td class="num">' + a.avg_hours + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty">ยังไม่มีข้อมูล</div>') +
        '<p class="muted">ถูกปฏิเสธอัตโนมัติ (แผนกเต็ม) ' + s.auto_rejected + ' ใบ · ส่งต่อเพราะค้าง ' + s.escalations + ' ครั้ง</p></div></div>';
    }).catch(function (e) { $r.innerHTML = errorBox([e]); });
    if (tab === 'balances') api('reportBalances').then(function (rows) {
      var T = [['SICK', 'ลาป่วย'], ['PERS', 'ลากิจ'], ['VAC', 'พักร้อน']];
      $r.innerHTML = '<div class="toolbar"><button class="btn sm" id="csv">ส่งออก Excel (CSV)</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>แผนก</th><th>ปีการลา</th>' +
        T.map(function (t) { return '<th class="num">' + t[1] + ' คงเหลือ</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
          return '<tr><td>' + esc(r.emp_id) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.dept_name) + '</td><td>' + thaiDate(r.leave_year_start) + ' – ' + thaiDate(r.leave_year_end) + '</td>' +
            T.map(function (t) { var v = r[t[0] + '_available']; return '<td class="num' + (v < 0 ? ' neg' : '') + '">' + (v == null ? '–' : v + ' / ' + r[t[0] + '_granted']) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      document.getElementById('csv').onclick = function () {
        var h = ['รหัส', 'ชื่อ', 'แผนก', 'ปีการลาเริ่ม', 'ปีการลาสิ้นสุด'], cols = [];
        T.forEach(function (t) { ['granted|สิทธิ์', 'used|ใช้แล้ว', 'pending|รออนุมัติ', 'available|คงเหลือ'].forEach(function (k) { var p = k.split('|'); h.push(t[1] + ' ' + p[1]); cols.push(t[0] + '_' + p[0]); }); });
        downloadCsv('leave-balances.csv', h, rows.map(function (r) { return [r.emp_id, r.name, r.dept_name, r.leave_year_start, r.leave_year_end].concat(cols.map(function (c) { return r[c]; })); }));
      };
    }).catch(function (e) { $r.innerHTML = errorBox([e]); });
    if (tab === 'payroll') {
      var m0 = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
      $r.innerHTML = '<form class="toolbar" id="pf2"><label>เดือน <input type="month" name="month" value="' + m0 + '"></label><button class="btn sm dark">แสดง</button><button type="button" class="btn sm" id="csv">ส่งออก Excel (CSV)</button></form><div id="pres"></div>' +
        '<p class="muted">นับเฉพาะใบลาที่อนุมัติแล้ว · ไม่รับค่าจ้าง = ลาไม่รับค่าจ้าง + ลาป่วยส่วนที่เกิน 30 วันในปีการลา · ลาคลอด/บวช/ทหาร ให้ฝ่ายบุคคลตรวจตามนโยบาย</p>';
      var rowsP = [], month = m0;
      var run = function () {
        month = document.querySelector('#pf2 [name=month]').value;
        api('reportPayroll', { month: month }).then(function (rows) {
          rowsP = rows;
          var typeIds = A.setup.types.map(function (t) { return t.type_id; });
          document.getElementById('pres').innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>แผนก</th><th>รายละเอียด</th><th class="num">วันลาที่จ่าย</th><th class="num">ไม่รับค่าจ้าง</th></tr></thead><tbody>' +
            rows.map(function (r) {
              return '<tr><td>' + esc(r.emp_id) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.dept_name) + '</td><td>' + Object.keys(r.by_type).map(function (k) {
                var t = A.setup.types.filter(function (x) { return x.type_id === k; })[0]; return esc(t ? t.name_th : k) + ' ' + r.by_type[k];
              }).join(', ') + '</td><td class="num">' + r.paid_days + '</td><td class="num' + (r.unpaid_days ? ' neg' : '') + '">' + r.unpaid_days + '</td></tr>';
            }).join('') + '</tbody></table></div>' : '<div class="empty">ไม่มีวันลาในเดือนนี้</div>';
          document.getElementById('csv').onclick = function () {
            downloadCsv('payroll-' + month + '.csv', ['รหัส', 'ชื่อ', 'แผนก'].concat(typeIds).concat(['วันลาที่จ่าย', 'ไม่รับค่าจ้าง']),
              rowsP.map(function (r) { return [r.emp_id, r.name, r.dept_name].concat(typeIds.map(function (k) { return r.by_type[k] || 0; })).concat([r.paid_days, r.unpaid_days]); }));
          };
        }).catch(function (e) { document.getElementById('pres').innerHTML = errorBox([e]); });
      };
      document.getElementById('pf2').addEventListener('submit', function (e) { e.preventDefault(); run(); });
      run();
    }
  }

  /* ------------------------------------------------------------ audit log */
  function viewAudit() {
    $app.innerHTML = '<div class="page-head"><h1>บันทึกการแก้ไข</h1></div><form class="toolbar" id="af"><input name="q" placeholder="ค้นหา: ชื่อผู้ใช้ การกระทำ รหัส"><button class="btn sm dark">ค้นหา</button></form><div id="ares"></div>';
    var run = function () {
      api('audit', { q: document.querySelector('#af [name=q]').value }).then(function (rows) {
        document.getElementById('ares').innerHTML = '<p class="muted">ล่าสุด ' + rows.length + ' รายการ</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>เมื่อ</th><th>ผู้ทำ</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td style="white-space:nowrap">' + stamp(r.at) + '</td><td>' + esc(r.actor) + '<br><span class="muted">' + esc(r.role) + '</span></td><td>' + esc(r.action) + '</td><td>' + esc(r.entity) + ' ' + esc(r.entity_id) +
              '</td><td class="muted" style="max-width:420px;word-break:break-word">' + esc(String(r.after_json || '').slice(0, 220)) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }).catch(function (e) { document.getElementById('ares').innerHTML = errorBox([e]); });
    };
    document.getElementById('af').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    run();
  }

  /* ------------------------------------------------------------ my account */
  function viewMe() {
    $app.innerHTML = '<div class="page-head"><h1>บัญชีของฉัน</h1></div><div class="grid2"><div>' + viewChangePassword(false) + '</div>' +
      '<div class="panel"><h2 style="margin-top:0">รับแจ้งเตือนทาง LINE</h2><p>ผูก LINE ของคุณกับบัญชีนี้ เพื่อรับแจ้งเตือน เช่น ใบลาหัวหน้าแผนก ใบลาค้าง และแผนกที่มีคนลาซ้อน</p>' +
      '<button class="btn dark" id="lnk">สร้างรหัสผูก LINE</button><div id="lres"></div></div></div>';
    bindPassword();
    document.getElementById('lnk').addEventListener('click', function () {
      api('adminLinkCode').then(function (r) {
        var box = document.getElementById('lres');
        box.innerHTML = '<p style="margin-top:16px">สแกน QR นี้ด้วยกล้องของแอป LINE บนมือถือ ภายใน 10 นาที</p><div id="qr"></div><p class="muted">หรือส่งลิงก์นี้เข้าแชท LINE ของตัวเองแล้วแตะ:<br><span style="word-break:break-all">' + esc(r.liff_url) + '</span></p>';
        if (window.QRCode && r.liff_url) new QRCode(document.getElementById('qr'), { text: r.liff_url, width: 200, height: 200 });
      }).catch(failSheet);
    });
  }

  boot();
})();
