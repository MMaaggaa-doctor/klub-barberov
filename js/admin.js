(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var cfg = window.APP_CONFIG || {};
  var API = cfg.API_URL || './api.php';
  var PCT = +cfg.REWARD_PERCENT || 25;
  var S = { days: 30, tab: 'partners', partners: [], stats: {}, daily: {}, funnel: [], leads: [], payments: [] };
  var PLAN = { month: 'Месяц', year: 'Год', trial: 'Пробная неделя', other: 'Другое' };

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
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  function rub(n) { return fmt(Math.round(n || 0)) + '\u00a0₽'; }
  function pct(a, b) { return b ? (a / b * 100).toFixed(a / b * 100 >= 10 ? 0 : 1).replace('.', ',') + '%' : '—'; }
  function show(id, on) { var e = $(id); if (e) e.hidden = !on; }
  function msg(id, text, cls) { var m = $(id); m.textContent = text || ''; m.className = 'form-msg ' + (cls || ''); }
  function linkFor(slug) { return location.origin + '/?ref=' + slug; }
  function dateRu(iso) { try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(function () { btn.textContent = t; }, 1400); };
    var fallback = function () {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) {} document.body.removeChild(t);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function days() { return S.days === 'all' ? null : S.days; }
  function since() { return S.days === 'all' ? null : new Date(Date.now() - S.days * 864e5); }
  function sourceLabel(s) { return (!s || s === 'direct') ? 'прямой / не определён' : s; }

  /* ---------- запросы к api.php ---------- */
  function call(action, method, query, body) {
    var url = API + '?action=' + encodeURIComponent(action);
    Object.keys(query || {}).forEach(function (k) { url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
    var opts = { method: method, headers: { 'X-KB': '1' }, credentials: 'same-origin' };
    if (method !== 'GET' && method !== 'HEAD') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var e = new Error((j && j.error) || ('Ошибка ' + r.status)); e.status = r.status; e.code = j && j.code; throw e; }
        return j;
      });
    });
  }
  /* Привычные адреса вида partners?id=eq.5 переводятся в запросы к api.php */
  function api(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase(), parts = path.split('?'), head = parts[0], q = new URLSearchParams(parts[1] || ''), query = {};
    if (head.indexOf('rpc/') === 0) { query.name = head.slice(4); return call('stats', 'POST', query, opts.body); }
    var id = q.get('id'); if (id) query.id = id.replace(/^eq\./, '');
    var since = q.get('created_at') || q.get('paid_at'); if (since) query.since = since.replace(/^gte\./, '');
    if (q.get('limit')) query.limit = q.get('limit');
    return call(head, method, query, opts.body);
  }
  function fail(e) {
    if (e.status === 401) { showAuth('Войдите заново'); return; }
    msg('#global-msg', 'Ошибка: ' + e.message, 'err');
  }

  /* ---------- экраны ---------- */
  function hideAuth() { show('#login-box', false); show('#signup-box', false); }
  function showLogin(text, cls) {
    show('#app', false); hideAuth(); show('#login-box', true); show('#logout', false);
    if (text) msg('#login-msg', text, cls || 'err');
  }
  function showSignup() { show('#app', false); hideAuth(); show('#signup-box', true); show('#logout', false); }
  function showApp() { hideAuth(); show('#app', true); show('#logout', true); show('#not-admin', false); loadTab(); }
  /* Если администратора ещё нет — предлагаем зарегистрироваться первым, иначе обычный вход */
  function showAuth(note) {
    call('status', 'GET').then(function (s) {
      if (s && s.logged) showApp();
      else if (s && s.first) showSignup();
      else showLogin(note);
    }).catch(function (e) { showLogin('Сервер недоступен: ' + e.message + '. Проверьте config.php и импорт database.sql.'); });
  }
  function setTab(t) {
    S.tab = t;
    $$('.adm-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    $$('.adm-pane').forEach(function (p) { p.hidden = p.id !== 'pane-' + t; });
    show('#range', t !== 'utm');
    loadTab();
  }
  function loadTab() {
    msg('#global-msg', '');
    ({ partners: loadPartners, funnel: loadFunnel, leads: loadLeads, payments: loadPayments, utm: buildUtm })[S.tab]();
  }

  /* ---------- ПАРТНЁРЫ ---------- */
  function loadPartners() {
    Promise.all([
      api('partners?select=*&order=created_at.desc'),
      api('rpc/partner_stats', { method: 'POST', body: { p_days: days() } }),
      api('rpc/partner_daily', { method: 'POST', body: { p_days: 30 } })
    ]).then(function (r) {
      S.partners = r[0] || [];
      S.stats = {}; (r[1] || []).forEach(function (x) { S.stats[x.slug] = x; });
      S.daily = {}; (r[2] || []).forEach(function (x) { (S.daily[x.slug] = S.daily[x.slug] || {})[x.day] = Number(x.visits); });
      renderPartners();
    }).catch(fail);
  }
  function spark(slug) {
    var d = S.daily[slug] || {}, vals = [], max = 1, i, now = new Date();
    for (i = 29; i >= 0; i--) {
      var k = new Date(now.getTime() - i * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
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
  function renderPartners() {
    var rows = $('#rows'); rows.textContent = '';
    var tot = { v: 0, l: 0, b: 0, r: 0 };
    var list = S.partners.slice().sort(function (a, b) { return ((S.stats[b.slug] || {}).visitors || 0) - ((S.stats[a.slug] || {}).visitors || 0); });
    list.forEach(function (p) {
      var s = S.stats[p.slug] || {}, rev = Number(s.revenue || 0);
      tot.v += +s.visitors || 0; tot.l += +s.leads || 0; tot.b += +s.buyers || 0; tot.r += rev;
      var url = linkFor(p.slug);
      var cb = el('button', { type: 'button', class: 'copy-b', text: 'Копировать' }); cb.addEventListener('click', function () { copy(url, cb); });
      var st = el('button', { type: 'button', class: 'st' + (p.active ? ' on' : ''), 'aria-pressed': p.active ? 'true' : 'false' }, [el('i'), el('span', { text: p.active ? 'Включена' : 'Отключена' })]);
      st.addEventListener('click', function () { api('partners?id=eq.' + p.id, { method: 'PATCH', body: { active: !p.active } }).then(loadPartners).catch(fail); });
      var db = el('button', { type: 'button', class: 'del-b', 'aria-label': 'Удалить партнёра ' + p.name, text: 'Удалить' });
      db.addEventListener('click', function () {
        if (!confirm('Удалить «' + p.name + '»? Ссылка перестанет считаться, история останется в базе.')) return;
        api('partners?id=eq.' + p.id, { method: 'DELETE' }).then(loadPartners).catch(fail);
      });
      rows.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'p-name', text: p.name }), el('div', { class: 'p-link' }, [el('code', { text: url }), cb])]),
        el('td', { class: 'num', text: fmt(s.visitors) }), el('td', { class: 'num', text: fmt(s.leads) }), el('td', { class: 'num', text: fmt(s.buyers) }),
        el('td', { class: 'num', text: rub(rev) }), el('td', { class: 'num', text: rub(rev * PCT / 100) }),
        el('td', {}, [spark(p.slug)]), el('td', {}, [st]), el('td', {}, [db])
      ]));
    });
    show('#empty', !list.length); $('#tbl').hidden = !list.length;
    var sum = $('#sum'); sum.textContent = '';
    [['Посетители', fmt(tot.v)], ['Заявки', fmt(tot.l)], ['Оплаты', fmt(tot.b)], ['К выплате (' + PCT + '%)', rub(tot.r * PCT / 100)]].forEach(function (x) {
      sum.appendChild(el('div', {}, [el('small', { text: x[0] }), el('b', { text: x[1] })]));
    });
  }
  function uniqueSlug(base, taken) {
    var s = base || 'partner', n = 2, cand = s;
    while (taken[cand]) cand = s + '-' + (n++);
    taken[cand] = 1; return cand;
  }
  function createPartners(items) {
    return api('partners', { method: 'POST', body: items, headers: { Prefer: 'return=representation' } });
  }

  /* ---------- ВОРОНКА ---------- */
  function loadFunnel() {
    api('rpc/funnel_by_source', { method: 'POST', body: { p_days: days() } }).then(function (r) { S.funnel = r || []; renderFunnel(); }).catch(fail);
  }
  function renderFunnel() {
    var t = { visitors: 0, clickers: 0, payclickers: 0, leads: 0, buyers: 0, revenue: 0 };
    S.funnel.forEach(function (x) { Object.keys(t).forEach(function (k) { t[k] += Number(x[k] || 0); }); });
    var steps = [['Зашли на сайт', t.visitors], ['Нажали кнопку (вступить, тариф, разбор)', t.clickers], ['Перешли к оплате', t.payclickers], ['Оплатили', t.buyers]];
    var box = $('#funnel-steps'); box.textContent = '';
    steps.forEach(function (s, i) {
      var w = t.visitors ? Math.max(1, s[1] / t.visitors * 100) : 0;
      var bar = el('div', { class: 'fbar' }, [el('i')]); bar.firstChild.style.width = Math.min(100, w) + '%';
      var b = el('b', { text: fmt(s[1]) }, [el('small', { text: i === 0 ? '' : pct(s[1], steps[i - 1][1]) + ' от прошлого шага' })]);
      box.appendChild(el('div', { class: 'fstep' }, [el('span', { text: s[0] }), bar, b]));
    });
    $('#funnel-note').textContent = 'Заявок с формы за период: ' + fmt(t.leads) + '. Выручка по внесённым оплатам: ' + rub(t.revenue) + '.';
    var rows = $('#frows'); rows.textContent = '';
    S.funnel.forEach(function (x) {
      rows.appendChild(el('tr', {}, [
        el('td', { class: 'src' }, [el('span', { class: 'tag-s', text: sourceLabel(x.src) })]),
        el('td', { class: 'num', text: fmt(x.visitors) }), el('td', { class: 'num', text: fmt(x.clickers) }), el('td', { class: 'num', text: fmt(x.payclickers) }),
        el('td', { class: 'num', text: fmt(x.leads) }), el('td', { class: 'num', text: fmt(x.buyers) }), el('td', { class: 'num', text: rub(x.revenue) }),
        el('td', { class: 'num', text: pct(+x.buyers, +x.visitors) })
      ]));
    });
    show('#fempty', !S.funnel.length); $('#ftbl').hidden = !S.funnel.length;
  }

  /* ---------- ЗАЯВКИ ---------- */
  function loadLeads() {
    var q = 'leads?select=*&order=created_at.desc&limit=300', d = since();
    if (d) q += '&created_at=gte.' + encodeURIComponent(d.toISOString());
    Promise.all([api(q), api('partners?select=*&order=created_at.desc')]).then(function (r) { S.leads = r[0] || []; S.partners = r[1] || []; renderLeads(); }).catch(fail);
  }
  function renderLeads() {
    var rows = $('#lrows'); rows.textContent = '';
    S.leads.forEach(function (l) {
      var src = l.ref || l.utm_source || 'direct';
      var b = el('button', { type: 'button', class: 'pay-b', text: 'Оплатил' });
      b.addEventListener('click', function () {
        setTab('payments');
        setTimeout(function () {
          selectSource(src === 'direct' ? '' : src);
          $('#p-comment').value = ((l.name || '') + ' ' + (l.contact || '')).trim(); $('#pay-form').dataset.lead = l.id;
          $('#p-amount').focus();
        }, 400);
      });
      rows.appendChild(el('tr', {}, [
        el('td', { text: dateRu(l.created_at) }), el('td', { text: l.name || '' }), el('td', { text: l.contact || '' }),
        el('td', { class: 'src' }, [el('span', { class: 'tag-s', text: sourceLabel(src) })]),
        el('td', { text: [l.utm_medium, l.utm_campaign].filter(Boolean).join(' / ') || '—' }), el('td', {}, [b])
      ]));
    });
    show('#lempty', !S.leads.length); $('#ltbl').hidden = !S.leads.length;
  }

  /* ---------- ОПЛАТЫ ---------- */
  function fillSources() {
    var sel = $('#p-source'), cur = sel.value; sel.textContent = '';
    sel.appendChild(el('option', { value: '', text: 'Прямой / не определён' }));
    S.partners.forEach(function (p) { sel.appendChild(el('option', { value: p.slug, text: 'Партнёр: ' + p.name })); });
    sel.appendChild(el('option', { value: '__custom', text: 'Другой источник (utm)…' }));
    sel.value = cur || '';
  }
  function selectSource(slug) {
    var sel = $('#p-source');
    var has = Array.prototype.some.call(sel.options, function (o) { return o.value === slug; });
    if (has) { sel.value = slug; show('#p-custom-box', false); }
    else { sel.value = '__custom'; show('#p-custom-box', true); $('#p-custom').value = slug; }
  }
  function loadPayments() {
    var q = 'payments?select=*&order=paid_at.desc,id.desc&limit=300', d = since();
    if (d) q += '&paid_at=gte.' + d.toISOString().slice(0, 10);
    Promise.all([api(q), api('partners?select=*&order=created_at.desc')]).then(function (r) {
      S.payments = r[0] || []; S.partners = r[1] || []; fillSources();
      if (!$('#p-date').value) $('#p-date').value = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
      renderPayments();
    }).catch(fail);
  }
  function renderPayments() {
    var rows = $('#prows'); rows.textContent = ''; var total = 0, partnerSum = 0;
    S.payments.forEach(function (p) {
      total += Number(p.amount);
      if (S.partners.some(function (x) { return x.slug === p.source; })) partnerSum += Number(p.amount);
      var db = el('button', { type: 'button', class: 'del-b', text: 'Удалить' });
      db.addEventListener('click', function () { if (confirm('Удалить эту оплату?')) api('payments?id=eq.' + p.id, { method: 'DELETE' }).then(loadPayments).catch(fail); });
      rows.appendChild(el('tr', {}, [
        el('td', { text: new Date(p.paid_at + 'T00:00:00').toLocaleDateString('ru-RU') }),
        el('td', { class: 'src' }, [el('span', { class: 'tag-s', text: sourceLabel(p.source) })]),
        el('td', { text: PLAN[p.plan] || '' }), el('td', { class: 'num', text: rub(p.amount) }), el('td', { text: p.comment || '' }), el('td', {}, [db])
      ]));
    });
    show('#pempty', !S.payments.length); $('#ptbl').hidden = !S.payments.length;
    var sum = $('#psum'); sum.textContent = '';
    [['Оплат', fmt(S.payments.length)], ['Выручка', rub(total)], ['Вознаграждения партнёрам (' + PCT + '%)', rub(partnerSum * PCT / 100)]].forEach(function (x) {
      sum.appendChild(el('div', {}, [el('small', { text: x[0] }), el('b', { text: x[1] })]));
    });
  }

  /* ---------- UTM ---------- */
  function buildUtm() {
    var base = $('#u-base'); if (!base.value) base.value = location.origin + '/';
    var u; try { u = new URL(base.value, location.origin); } catch (e) { $('#u-out').textContent = 'Проверьте адрес'; return; }
    [['utm_source', '#u-source'], ['utm_medium', '#u-medium'], ['utm_campaign', '#u-campaign'], ['utm_content', '#u-content']].forEach(function (p) {
      var v = slugify($(p[1]).value); if (v) u.searchParams.set(p[0], v); else u.searchParams.delete(p[0]);
    });
    $('#u-out').textContent = u.toString();
  }

  /* ---------- события ---------- */
  function init() {
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#l-email').value.trim(), pass = $('#l-pass').value;
      if (!email || !pass) return msg('#login-msg', 'Введите почту и пароль.', 'err');
      msg('#login-msg', 'Входим…');
      call('login', 'POST', {}, { email: email, password: pass }).then(function () { $('#l-pass').value = ''; msg('#login-msg', ''); showApp(); })
        .catch(function (err) { msg('#login-msg', err.status === 429 ? err.message : 'Неверная почта или пароль.', 'err'); });
    });
    $('#signup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('#s-email').value.trim(), p1 = $('#s-pass').value, p2 = $('#s-pass2').value;
      if (!email) return msg('#signup-msg', 'Введите почту.', 'err');
      if (p1.length < 10) return msg('#signup-msg', 'Пароль: минимум 10 символов.', 'err');
      if (p1 !== p2) return msg('#signup-msg', 'Пароли не совпадают.', 'err');
      msg('#signup-msg', 'Создаём доступ…');
      call('register', 'POST', {}, { email: email, password: p1 }).then(function () { msg('#signup-msg', ''); showApp(); })
        .catch(function (err) {
          if (err.status === 403) { showLogin('Администратор уже создан, регистрация закрыта. Войдите.'); }
          else msg('#signup-msg', 'Не удалось зарегистрироваться: ' + err.message, 'err');
        });
    });
    $('#logout').addEventListener('click', function () { call('logout', 'POST').catch(function () {}).then(function () { showAuth(); }); });
    $('#pw-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var o = $('#pw-old').value, n1 = $('#pw-new').value, n2 = $('#pw-new2').value;
      if (n1.length < 10) return msg('#pw-msg', 'Новый пароль: минимум 10 символов.', 'err');
      if (n1 !== n2) return msg('#pw-msg', 'Пароли не совпадают.', 'err');
      call('change_password', 'POST', {}, { old: o, new: n1 }).then(function () { msg('#pw-msg', 'Пароль изменён.', 'ok'); $('#pw-old').value = $('#pw-new').value = $('#pw-new2').value = ''; })
        .catch(function (err) { msg('#pw-msg', err.message, 'err'); });
    });
    $$('.adm-tabs button').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
    $$('#range button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#range button').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
        S.days = b.dataset.days === 'all' ? 'all' : +b.dataset.days; loadTab();
      });
    });

    var nName = $('#n-name'), nSlug = $('#n-slug'), touched = false;
    nSlug.addEventListener('input', function () { touched = true; });
    nName.addEventListener('input', function () { if (!touched) nSlug.value = slugify(nName.value); });
    function fresh(rows) {
      $('#fresh-list').textContent = rows.map(function (p) { return p.name + ' — ' + linkFor(p.slug); }).join('\n'); show('#fresh', true);
    }
    $('#new-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = nName.value.trim(), slug = slugify(nSlug.value);
      if (!name) return msg('#new-msg', 'Введите имя партнёра.', 'err');
      if (slug.length < 2) return msg('#new-msg', 'Метка в ссылке: минимум 2 латинские буквы или цифры.', 'err');
      msg('#new-msg', 'Создаём…');
      createPartners({ name: name, slug: slug }).then(function (r) {
        msg('#new-msg', 'Готово.', 'ok'); fresh(r || [{ name: name, slug: slug }]);
        nName.value = ''; nSlug.value = ''; touched = false; loadPartners();
      }).catch(function (err) {
        if (err.status === 401) return fail(err);
        msg('#new-msg', (err.status === 409 || err.code === '23505') ? 'Такая метка уже есть. Выберите другую.' : 'Не удалось создать: ' + err.message, 'err');
      });
    });
    $('#b-go').addEventListener('click', function () {
      var names = $('#b-names').value.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!names.length) return msg('#new-msg', 'Впишите хотя бы одно имя.', 'err');
      var taken = {}; S.partners.forEach(function (p) { taken[p.slug] = 1; });
      var items = names.map(function (n) { var b = slugify(n); return { name: n.slice(0, 80), slug: uniqueSlug(b.length >= 2 ? b : 'partner', taken) }; });
      msg('#new-msg', 'Создаём…');
      createPartners(items).then(function (r) { msg('#new-msg', 'Создано ссылок: ' + (r || items).length, 'ok'); fresh(r || items); $('#b-names').value = ''; loadPartners(); })
        .catch(function (err) { msg('#new-msg', 'Не удалось создать: ' + err.message, 'err'); });
    });
    $('#fresh-copy').addEventListener('click', function () { copy($('#fresh-list').textContent, this); });

    $('#p-source').addEventListener('change', function () { show('#p-custom-box', this.value === '__custom'); });
    $('#pay-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var sel = $('#p-source').value, source = sel === '__custom' ? slugify($('#p-custom').value) : sel;
      var amount = parseFloat($('#p-amount').value);
      if (!(amount >= 0)) return msg('#pay-msg', 'Введите сумму.', 'err');
      var row = { source: source || '', plan: $('#p-plan').value, amount: amount, comment: $('#p-comment').value.trim() };
      if ($('#p-date').value) row.paid_at = $('#p-date').value;
      if (this.dataset.lead) row.lead_id = +this.dataset.lead;
      msg('#pay-msg', 'Сохраняем…');
      api('payments', { method: 'POST', body: row }).then(function () {
        msg('#pay-msg', 'Оплата добавлена.', 'ok'); $('#p-amount').value = ''; $('#p-comment').value = ''; delete $('#pay-form').dataset.lead; loadPayments();
      }).catch(function (err) { msg('#pay-msg', 'Не удалось сохранить: ' + err.message, 'err'); });
    });

    ['#u-base', '#u-source', '#u-medium', '#u-campaign', '#u-content'].forEach(function (id) { $(id).addEventListener('input', buildUtm); });
    $('#u-copy').addEventListener('click', function () { copy($('#u-out').textContent, this); });

    showAuth();
  }
  init();
})();
