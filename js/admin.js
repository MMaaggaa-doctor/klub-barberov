(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var cfg = window.APP_CONFIG || {};
  var BASE = (cfg.SUPABASE_URL || '').replace(/\/$/, '');
  var KEY = cfg.SUPABASE_ANON_KEY || '';
  var SKEY = 'kb_admin_session';
  var state = { days: 30, partners: [], stats: {}, daily: {} };

  /* ---------- вспомогательное ---------- */
  var RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function slugify(s) {
    var out = String(s).toLowerCase().split('').map(function (c) { return RU[c] !== undefined ? RU[c] : c; }).join('');
    return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  }
  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') e.textContent = props[k];
      else if (k === 'class') e.className = props[k];
      else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  function linkFor(slug) { return location.origin + '/?ref=' + slug; }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(t);
    }
  }

  /* ---------- сессия ---------- */
  function getSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function setSession(s) { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); }
  function auth(path, body) {
    return fetch(BASE + '/auth/v1/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Ошибка входа'); return j; }); });
  }
  function store(j) { setSession({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 30000 }); }
  function refresh() {
    var s = getSession(); if (!s || !s.refresh) return Promise.reject(new Error('no session'));
    return auth('token?grant_type=refresh_token', { refresh_token: s.refresh }).then(function (j) { store(j); return getSession(); });
  }
  function api(path, opts, retry) {
    var s = getSession();
    var run = function (sess) {
      opts = opts || {};
      var headers = Object.assign({ 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + sess.access }, opts.headers || {});
      return fetch(BASE + '/rest/v1/' + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
        .then(function (r) {
          if (r.status === 401 && !retry) return refresh().then(function () { return api(path, opts, true); });
          if (!r.ok) return r.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.message || ('Ошибка ' + r.status)); e.status = r.status; e.code = j.code; throw e; });
          return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
        });
    };
    if (!s) return Promise.reject(new Error('Нет входа'));
    if (s.exp < Date.now()) return refresh().then(run);
    return run(s);
  }

  /* ---------- экраны ---------- */
  function show(id, on) { $(id).hidden = !on; }
  function showLogin(msg) {
    show('#app', false); show('#login-box', true); show('#logout', false);
    if (msg) { var m = $('#login-msg'); m.textContent = msg; m.className = 'form-msg err'; }
  }
  function showApp() { show('#login-box', false); show('#app', true); show('#logout', true); load(); }

  /* ---------- данные ---------- */
  function load() {
    var days = state.days === 'all' ? null : state.days;
    Promise.all([
      api('rpc/is_admin', { method: 'POST', body: {} }),
      api('partners?select=*&order=created_at.desc'),
      api('rpc/partner_stats', { method: 'POST', body: { p_days: days } }),
      api('rpc/partner_daily', { method: 'POST', body: { p_days: 30 } })
    ]).then(function (r) {
      show('#not-admin', r[0] !== true);
      state.partners = r[1] || [];
      state.stats = {}; (r[2] || []).forEach(function (x) { state.stats[x.slug] = x; });
      state.daily = {}; (r[3] || []).forEach(function (x) { (state.daily[x.slug] = state.daily[x.slug] || {})[x.day] = Number(x.visits); });
      render();
    }).catch(function (e) {
      if (/Нет входа|no session|JWT|expired/i.test(e.message)) { setSession(null); showLogin('Войдите заново'); return; }
      var m = $('#new-msg'); m.textContent = 'Не удалось загрузить данные: ' + e.message; m.className = 'form-msg err';
    });
  }

  function spark(slug) {
    var d = state.daily[slug] || {}, vals = [], max = 1, i, now = new Date();
    for (i = 29; i >= 0; i--) {
      var dt = new Date(now.getTime() - i * 864e5), k = dt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
      var v = d[k] || 0; vals.push(v); if (v > max) max = v;
    }
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', '0 0 120 32'); svg.setAttribute('aria-hidden', 'true');
    vals.forEach(function (v, idx) {
      var h = v ? Math.max(2, v / max * 30) : 1, r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', idx * 4); r.setAttribute('y', 32 - h); r.setAttribute('width', 3); r.setAttribute('height', h);
      r.setAttribute('opacity', v ? 1 : .25); svg.appendChild(r);
    });
    return svg;
  }

  function render() {
    var rows = $('#rows'); rows.textContent = '';
    var tot = { v: 0, u: 0, l: 0 };
    var list = state.partners.slice().sort(function (a, b) { return ((state.stats[b.slug] || {}).visits || 0) - ((state.stats[a.slug] || {}).visits || 0); });
    list.forEach(function (p) {
      var s = state.stats[p.slug] || {}; tot.v += +s.visits || 0; tot.u += +s.uniques || 0; tot.l += +s.leads || 0;
      var url = linkFor(p.slug);
      var cb = el('button', { type: 'button', class: 'copy-b', text: 'Копировать' }); cb.addEventListener('click', function () { copy(url, cb); });
      var st = el('button', { type: 'button', class: 'st' + (p.active ? ' on' : ''), 'aria-pressed': p.active ? 'true' : 'false' }, [el('i'), el('span', { text: p.active ? 'Включена' : 'Отключена' })]);
      st.addEventListener('click', function () {
        api('partners?id=eq.' + p.id, { method: 'PATCH', body: { active: !p.active } }).then(load).catch(function (e) { alert('Ошибка: ' + e.message); });
      });
      var db = el('button', { type: 'button', class: 'del-b', 'aria-label': 'Удалить партнёра ' + p.name, text: 'Удалить' });
      db.addEventListener('click', function () {
        if (!confirm('Удалить «' + p.name + '»? Ссылка перестанет считаться, история переходов останется в базе.')) return;
        api('partners?id=eq.' + p.id, { method: 'DELETE' }).then(load).catch(function (e) { alert('Ошибка: ' + e.message); });
      });
      var tr = el('tr', {}, [
        el('td', {}, [el('span', { class: 'p-name', text: p.name }), el('div', { class: 'p-link' }, [el('code', { text: url }), cb])]),
        el('td', { class: 'num', text: fmt(s.visits) }), el('td', { class: 'num', text: fmt(s.uniques) }), el('td', { class: 'num', text: fmt(s.leads) }),
        el('td', {}, [spark(p.slug)]), el('td', {}, [st]), el('td', {}, [db])
      ]);
      rows.appendChild(tr);
    });
    show('#empty', !list.length); $('#tbl').hidden = !list.length;
    var sum = $('#sum'); sum.textContent = '';
    [['Переходы', tot.v], ['Уникальные', tot.u], ['Заявки', tot.l]].forEach(function (x) {
      sum.appendChild(el('div', {}, [el('small', { text: x[0] }), el('b', { text: fmt(x[1]) })]));
    });
  }

  /* ---------- события ---------- */
  function init() {
    if (!BASE || !KEY) { show('#no-cfg', true); return; }

    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var m = $('#login-msg'), email = $('#l-email').value.trim(), pass = $('#l-pass').value;
      if (!email || !pass) { m.textContent = 'Введите почту и пароль.'; m.className = 'form-msg err'; return; }
      m.textContent = 'Входим…'; m.className = 'form-msg';
      auth('token?grant_type=password', { email: email, password: pass }).then(function (j) { store(j); $('#l-pass').value = ''; m.textContent = ''; showApp(); })
        .catch(function () { m.textContent = 'Неверная почта или пароль.'; m.className = 'form-msg err'; });
    });
    $('#logout').addEventListener('click', function () { setSession(null); showLogin(); });

    var nName = $('#n-name'), nSlug = $('#n-slug'), slugTouched = false;
    nSlug.addEventListener('input', function () { slugTouched = true; });
    nName.addEventListener('input', function () { if (!slugTouched) nSlug.value = slugify(nName.value); });
    $('#new-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var m = $('#new-msg'), name = nName.value.trim(), slug = slugify(nSlug.value);
      if (!name) { m.textContent = 'Введите имя партнёра.'; m.className = 'form-msg err'; return; }
      if (slug.length < 2) { m.textContent = 'Метка в ссылке: минимум 2 латинские буквы или цифры.'; m.className = 'form-msg err'; return; }
      m.textContent = 'Создаём…'; m.className = 'form-msg';
      api('partners', { method: 'POST', body: { name: name, slug: slug }, headers: { Prefer: 'return=representation' } }).then(function () {
        m.textContent = 'Готово.'; m.className = 'form-msg ok';
        var url = linkFor(slug); $('#fresh-url').textContent = url; show('#fresh', true);
        nName.value = ''; nSlug.value = ''; slugTouched = false; load();
      }).catch(function (err) {
        m.textContent = (err.status === 409 || err.code === '23505') ? 'Такая метка уже есть. Выберите другую.' : 'Не удалось создать: ' + err.message;
        m.className = 'form-msg err';
      });
    });
    $('#fresh-copy').addEventListener('click', function () { copy($('#fresh-url').textContent, this); });

    document.querySelectorAll('.adm-range button').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.adm-range button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
        state.days = b.dataset.days === 'all' ? 'all' : +b.dataset.days; load();
      });
    });

    var s = getSession();
    if (s) showApp(); else showLogin();
  }
  init();
})();
