/* ============================================================
   Аналитика и отслеживание источников.
   - UTM-метки и партнёрская метка ?ref= запоминаются на 30 дней;
   - каждое ключевое действие уходит в Supabase (таблица events в MySQL) и в Яндекс Метрику;
   - ссылки на Telegram-бота получают ?start=источник-идентификатор.
   Цели и их названия описаны в README.
   ============================================================ */
(function () {
  'use strict';
  var cfg = window.APP_CONFIG || {};
  var KB = window.KB = {};
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var REF_RE = /^[a-z0-9_-]{2,40}$/;
  var DAY = 864e5;
  var isBot = !!navigator.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|headless/i.test(navigator.userAgent);
  var API = cfg.API_URL || './api.php';
  var hasDb = true;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) {}
    return null;
  }
  function rnd(n) {
    var s = '', c = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
    return s;
  }

  /* ---------- посетитель и сессия ---------- */
  KB.visitorId = function () {
    var id = ls('kb_vid');
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : rnd(24);
      ls('kb_vid', id);
    }
    return id;
  };
  function sessionId() {
    var id = ss('kb_sid');
    if (!id) { id = rnd(16); ss('kb_sid', id); }
    return id;
  }

  /* ---------- источник: ref + UTM, последний заход, 30 дней ---------- */
  function fromUrl() {
    var q, a = {}, has = false;
    try { q = new URLSearchParams(location.search); } catch (e) { return null; }
    var r = (q.get('ref') || '').toLowerCase();
    if (REF_RE.test(r)) { a.ref = r; has = true; }
    UTM.forEach(function (k) { var v = q.get(k); if (v) { a[k] = String(v).slice(0, 80); has = true; } });
    return has ? a : null;
  }
  (function remember() {
    var a = fromUrl();
    if (!a) return;
    ls('kb_attr', JSON.stringify({ a: a, t: Date.now() }));
    if (!ls('kb_first')) ls('kb_first', JSON.stringify({ a: a, t: Date.now() }));
  })();
  KB.attr = function () {
    try {
      var o = JSON.parse(ls('kb_attr') || 'null');
      if (o && o.a && Date.now() - o.t < 30 * DAY) return o.a;
    } catch (e) {}
    return {};
  };
  KB.source = function () { var a = KB.attr(); return a.ref || a.utm_source || null; };

  /* ---------- отправка событий ---------- */
  function post(action, body) {
    if (!hasDb) return;
    try {
      fetch(API + '?action=' + action, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', 'X-KB': '1' },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) {}
  }
  KB.track = function (event, extra) {
    if (isBot) return;
    extra = extra || {};
    var a = KB.attr();
    var row = {
      visitor_id: KB.visitorId(), session_id: sessionId(), event: event,
      plan: extra.plan || null, click_id: extra.cid || null,
      ref: a.ref || null, utm_source: a.utm_source || null, utm_medium: a.utm_medium || null,
      utm_campaign: a.utm_campaign || null, utm_content: a.utm_content || null, utm_term: a.utm_term || null,
      path: location.pathname.slice(0, 200), referrer: extra.referrer || null,
      meta: extra.target ? { target: String(extra.target).slice(0, 80) } : null
    };
    post('event', row);
    try {
      if (window.ym && cfg.METRIKA_ID) ym(+cfg.METRIKA_ID, 'reachGoal', event, { plan: extra.plan || '', target: extra.target || '', source: a.ref || a.utm_source || '' });
    } catch (e) {}
    try { (window.dataLayer = window.dataLayer || []).push({ event: 'kb_' + event, plan: extra.plan || null, target: extra.target || null }); } catch (e) {}
  };
  /* Поля для заявки с формы: источник и идентификаторы */
  KB.leadFields = function () {
    var a = KB.attr();
    return {
      visitor_id: KB.visitorId(), ref: a.ref || null, utm_source: a.utm_source || null, utm_medium: a.utm_medium || null,
      utm_campaign: a.utm_campaign || null, utm_content: a.utm_content || null, utm_term: a.utm_term || null
    };
  };

  /* ---------- Яндекс Метрика ---------- */
  if (cfg.METRIKA_ID && !isBot && !/\/admin\.html$/.test(location.pathname)) {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    ym(+cfg.METRIKA_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
    try {
      var at = KB.attr();
      if (Object.keys(at).length) { ym(+cfg.METRIKA_ID, 'params', at); ym(+cfg.METRIKA_ID, 'userParams', { ref: at.ref || '', utm_source: at.utm_source || '' }); }
    } catch (e) {}
  }

  /* ---------- ссылки кнопок ---------- */
  function resolve(key, fallback) {
    var u = key && cfg.LINKS && cfg.LINKS[key];
    return u || cfg.DEFAULT_LINK || fallback;
  }
  function payload(src, cid) {
    var s = String(src || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'site';
    return (s + '-' + cid).slice(0, 64);
  }
  /* Добавляет к ссылке источник: для бота — ?start=, для обычных внешних ссылок — UTM и cid. */
  KB.decorate = function (url, cid) {
    try {
      var u = new URL(url, location.href), a = KB.attr(), src = a.ref || a.utm_source || 'site';
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return url;
      if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
        var seg = u.pathname.split('/').filter(Boolean);
        if (cfg.START_PARAM !== false && seg.length === 1 && /bot$/i.test(seg[0]) && !u.searchParams.has('start')) u.searchParams.set('start', payload(src, cid));
        return u.toString();
      }
      if (u.origin !== location.origin) {
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', a.utm_source || a.ref || 'site');
        if (!u.searchParams.has('utm_medium') && a.utm_medium) u.searchParams.set('utm_medium', a.utm_medium);
        if (!u.searchParams.has('utm_campaign') && a.utm_campaign) u.searchParams.set('utm_campaign', a.utm_campaign);
        if (a.ref && !u.searchParams.has('ref')) u.searchParams.set('ref', a.ref);
        if (!u.searchParams.has('cid')) u.searchParams.set('cid', cid);
      }
      return u.toString();
    } catch (e) { return url; }
  };

  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-goal]') : null;
    if (!a) return;
    var goal = a.getAttribute('data-goal'), plan = a.getAttribute('data-plan'), key = a.getAttribute('data-link');
    var cid = rnd(6);
    a.href = KB.decorate(resolve(key, a.getAttribute('href')), cid);
    KB.track(goal, { plan: plan, cid: cid, target: key || a.textContent.trim() });
    if (plan) KB.track('pay_click', { plan: plan, cid: cid, target: key });
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    /* ссылки на кнопках берём из config.js */
    Array.prototype.forEach.call(document.querySelectorAll('a[data-link]'), function (a) { a.href = resolve(a.getAttribute('data-link'), a.getAttribute('href')); });

    /* просмотр страницы: один раз за сессию на каждый адрес */
    var key = 'kb_pv_' + location.pathname;
    if (!ss(key)) {
      ss(key, '1');
      var ref = '';
      try { if (document.referrer && new URL(document.referrer).hostname !== location.hostname) ref = document.referrer.slice(0, 200); } catch (e) {}
      KB.track('pageview', { referrer: ref });
    }

    /* показали тарифы / кейсы */
    if ('IntersectionObserver' in window) {
      [['#pricing', 'view_pricing'], ['#cases', 'view_cases']].forEach(function (p) {
        var el = document.querySelector(p[0]); if (!el) return;
        var k = 'kb_v_' + p[1];
        if (ss(k)) return;
        new IntersectionObserver(function (es, o) {
          if (es[0].isIntersecting) { o.disconnect(); ss(k, '1'); KB.track(p[1]); }
        }, { threshold: .3 }).observe(el);
      });
    }
  });
})();
