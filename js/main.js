(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var cfg = window.APP_CONFIG || {};
  /* Вариант первого экрана: config.js → HERO_STYLE или ?hero=light для предпросмотра */
  (function () {
    var q = ''; try { q = new URLSearchParams(location.search).get('hero') || ''; } catch (e) {}
    if ((q || cfg.HERO_STYLE) === 'light') document.body.classList.add('hl');
  })();
  var fmt = function (n) { return Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + ' руб.'; };

  /* ---------- NAV ---------- */
  var nav = $('.nav'), burger = $('.burger');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var o = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    $$('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); });
    });
  }

  /* ---------- SCROLL: progress, nav hide, mobile CTA ---------- */
  var bar = $('.progress'), mcta = $('#mcta'), lastY = 0, ticking = false;
  function onScroll() {
    var y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? y / h : 0) + ')';
    if (nav && !nav.classList.contains('open')) nav.classList.toggle('hide', y > lastY && y > 500);
    var hero = $('.hero'); if (nav && hero) nav.classList.toggle('on-light', document.body.classList.contains('hl') && y < hero.offsetHeight - 80);
    lastY = y;
    if (mcta) {
      var near = function (id) { var s = $(id); if (!s) return false; var r = s.getBoundingClientRect(); return r.top < window.innerHeight * .6 && r.bottom > 0; }; var nearPrice = near('#pricing') || near('#join') || near('.foot');
      mcta.classList.toggle('show', y > window.innerHeight * .8 && !nearPrice);
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(); ticking = false; }); }
  }, { passive: true });
  onScroll();

  /* ---------- REVEAL ---------- */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  $$('.rv,[data-mask]').forEach(function (el) { io.observe(el); });

  /* ---------- ACTIVE LINK ---------- */
  var links = $$('.nav-links a[href^="#"]');
  var secIO = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) {
        links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id); });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  links.forEach(function (a) { var s = $(a.getAttribute('href')); if (s) secIO.observe(s); });

  /* ---------- COUNTERS ---------- */
  var cio = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      cio.unobserve(e.target);
      var el = e.target, to = +el.dataset.count, suf = el.dataset.suffix || '', t0 = null;
      if (reduce) { el.textContent = to + suf; return; }
      (function step(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / 1600), v = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(to * v) + suf;
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    });
  }, { threshold: .6 });
  $$('[data-count]').forEach(function (el) { cio.observe(el); });

  /* ---------- ФОТО ТЕЙМУРА и ЛОГО: показываем, только если файл добавлен ---------- */
  var heroMe = $('#hero-me');
  if (heroMe) { var hv = heroMe.parentElement; var bad = function () { hv.classList.add('no-photo'); heroMe.style.display = 'none'; }; heroMe.addEventListener('error', bad); if (heroMe.complete && heroMe.naturalWidth === 0) bad(); }
  var lm = $('#logo-mark');
  if (lm) { var lg = new Image(); lg.onload = function () { lm.innerHTML = ''; lg.alt = ''; lm.appendChild(lg); }; lg.src = (document.body.dataset.root || './') + 'assets/img/logo.png'; }

  /* ---------- FAQ ---------- */
  $$('.faq-item').forEach(function (item) {
    var q = $('.faq-q', item);
    q.addEventListener('click', function () {
      var was = item.classList.contains('open');
      $$('.faq-item').forEach(function (i) { i.classList.remove('open'); $('.faq-q', i).setAttribute('aria-expanded', 'false'); });
      if (!was) { item.classList.add('open'); q.setAttribute('aria-expanded', 'true'); }
    });
  });

  /* ---------- 3D TILT + MAGNET (только на устройствах с мышью) ---------- */
  if (canHover && !reduce) {
    $$('[data-tilt]').forEach(function (el) {
      var max = +el.dataset.tilt || 6;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transition = 'transform .08s linear, border-color .3s, box-shadow .4s';
        el.style.transform = 'perspective(1000px) rotateX(' + ((.5 - y) * max) + 'deg) rotateY(' + ((x - .5) * max) + 'deg) translateZ(0)';
        el.style.setProperty('--mx', (x * 100) + '%'); el.style.setProperty('--my', (y * 100) + '%');
      });
      el.addEventListener('mouseleave', function () {
        el.style.transition = 'transform .7s cubic-bezier(.22,1,.36,1), border-color .3s, box-shadow .4s';
        el.style.transform = '';
      });
    });
    $$('[data-magnet]').forEach(function (b) {
      b.addEventListener('mousemove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .18) + 'px,' + ((e.clientY - r.top - r.height / 2) * .28) + 'px)';
      });
      b.addEventListener('mouseleave', function () { b.style.transform = ''; });
    });
    var glow = $('.cursor-glow');
    if (glow) {
      var gx = 0, gy = 0, gtx = 0, gty = 0;
      window.addEventListener('mousemove', function (e) { gtx = e.clientX; gty = e.clientY; glow.classList.add('on'); }, { passive: true });
      (function loop() { gx += (gtx - gx) * .12; gy += (gty - gy) * .12; glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)'; requestAnimationFrame(loop); })();
    }
  }

  /* ---------- 3D MODELS: параллакс от мыши и скролла ---------- */
  var models = $$('.m3d[data-depth]'), mx = 0, my = 0, cmx = 0, cmy = 0;
  if (models.length && !reduce) {
    if (canHover) window.addEventListener('mousemove', function (e) {
      mx = e.clientX / window.innerWidth - .5; my = e.clientY / window.innerHeight - .5;
    }, { passive: true });
    (function tick() {
      cmx += (mx - cmx) * .07; cmy += (my - cmy) * .07;
      var vh = window.innerHeight;
      models.forEach(function (m) {
        var r = m.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var d = +m.dataset.depth, off = (r.top + r.height / 2 - vh / 2);
        var ty = -off * d * 1.6 + cmy * d * 600, tx = cmx * d * 700;
        var rot = m.hasAttribute('data-spin') ? (window.scrollY * .02) : off * d * .02;
        m.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg)';
      });
      requestAnimationFrame(tick);
    })();
  }

  /* ---------- PHONE: 3D-наклон + переписка ---------- */
  var phone = $('[data-phone]');
  if (phone && canHover && !reduce) {
    phone.addEventListener('mousemove', function (e) {
      var r = phone.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      phone.style.transform = 'perspective(1100px) rotateY(' + (x * 16) + 'deg) rotateX(' + (-y * 12) + 'deg)';
    });
    phone.addEventListener('mouseleave', function () { phone.style.transform = ''; });
  }
  /* ---------- ГАЛЕРЕЯ СКРИНШОТОВ ЧАТА (файлы перечислены в js/config.js) ---------- */
  var shotsBox = $('#chat-shots'), shotList = cfg.CHAT_SHOTS || [];
  if (shotsBox && shotList.length) {
    var strack = $('#shots-track'), scount = $('#shots-count');
    shotList.forEach(function (src, i) {
      var im = document.createElement('img');
      im.src = src; im.alt = 'Скриншот из закрытого чата Клуба, ' + (i + 1) + ' из ' + shotList.length;
      im.decoding = 'async'; if (i > 0) im.loading = 'lazy'; im.draggable = false;
      strack.appendChild(im);
    });
    shotsBox.hidden = false;
    var scr = shotsBox.closest('.phone-scr'); if (scr) scr.classList.add('has-shots');
    var demo = $('#chat-body'); if (demo) demo.hidden = true;
    var note = $('#chat-note'); if (note) note.textContent = 'Скриншоты из закрытого чата Клуба — листайте';
    var cur = function () { return Math.round(strack.scrollLeft / strack.clientWidth); };
    var go = function (n) { n = Math.max(0, Math.min(shotList.length - 1, n)); strack.scrollTo({ left: n * strack.clientWidth, behavior: reduce ? 'auto' : 'smooth' }); };
    var upc = function () { scount.textContent = (cur() + 1) + ' / ' + shotList.length; };
    strack.addEventListener('scroll', upc, { passive: true }); upc();
    $('#shots-prev').addEventListener('click', function () { go(cur() - 1); });
    $('#shots-next').addEventListener('click', function () { go(cur() + 1 >= shotList.length ? 0 : cur() + 1); });
    strack.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') go(cur() + 1); if (e.key === 'ArrowLeft') go(cur() - 1); });
  }

  var bubs = $$('#chat-body .bub');
  if (bubs.length && !(shotList && shotList.length)) {
    var playing = false;
    function play() {
      if (playing) return; playing = true;
      bubs.forEach(function (b) { b.classList.remove('show'); });
      bubs.forEach(function (b, i) { setTimeout(function () { b.classList.add('show'); }, 500 + i * 1300); });
      setTimeout(function () { playing = false; if (visible) play(); }, 500 + bubs.length * 1300 + 4000);
    }
    var visible = false;
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) play(); }, { threshold: .4 }).observe($('.phone'));
  }

  /* ---------- CALCULATOR ---------- */
  var cp = $('#c-price');
  if (cp) {
    var cf = $('#c-fill'), cm = $('#c-max'), cd = $('#c-days');
    var paint = function (i) { i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%'); };
    var calc = function () {
      var price = +cp.value, fill = +cf.value, max = +cm.value, days = +cd.value;
      if (fill > max) { fill = max; cf.value = fill; }
      cf.max = Math.max(max, 1);
      [cp, cf, cm, cd].forEach(paint);
      $('#o-price').textContent = price + ' руб.'; $('#o-fill').textContent = fill; $('#o-max').textContent = max; $('#o-days').textContent = days;
      var now = price * fill * days, full = price * max * days;
      $('#r-now').textContent = fmt(now); $('#r-full').textContent = fmt(full); $('#r-gap').textContent = fmt(full - now);
      var club = +cfg.CLUB_PRICE || 3690, n = Math.max(1, Math.ceil(club / price));
      $('#r-club').textContent = club.toLocaleString('ru-RU').replace(/\u00a0/g, '\u00a0') + '\u00a0₽';
      $('#r-pay').textContent = n;
      $('#r-word').textContent = (n % 10 === 1 && n % 100 !== 11) ? 'дополнительной записи' : 'дополнительных записей';
    };
    [cp, cf, cm, cd].forEach(function (i) { i.addEventListener('input', calc); });
    calc();
  }

  /* ---------- REVIEWS: горизонтальная прокрутка при скролле ---------- */
  var pin = $('.reviews'), view = $('.reviews-view'), track = $('#r-track'), fill = $('#r-fill'), cnt = $('#r-count'), cards = $$('.rcard');
  if (pin && view && track && cards.length) {
    var dist = 0, vhFn = function () { return (window.visualViewport && window.visualViewport.height) || window.innerHeight; };
    var measure = function () {
      var cs = getComputedStyle(view), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      dist = Math.max(0, track.scrollWidth - (view.clientWidth - pad));
      pin.style.height = (vhFn() + dist) + 'px';
    };
    var upd = function () {
      var r = pin.getBoundingClientRect(), max = pin.offsetHeight - vhFn();
      var p = max > 0 ? Math.min(1, Math.max(0, -r.top / max)) : 0;
      track.style.transform = 'translate3d(' + (-p * dist) + 'px,0,0)';
      if (fill) fill.style.width = (p * 100) + '%';
      var idx = Math.min(cards.length - 1, Math.round(p * (cards.length - 1)));
      cards.forEach(function (c, i) { c.classList.toggle('on', i === idx); });
      if (cnt) cnt.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
    };
    measure(); upd();
    window.addEventListener('resize', function () { measure(); upd(); });
    window.addEventListener('load', function () { measure(); upd(); });
    window.addEventListener('scroll', upd, { passive: true });
    $$('img', pin).forEach(function (i) { if (!i.complete) i.addEventListener('load', function () { measure(); upd(); }); });
  }

  /* ---------- ЗАЯВКА С ФОРМЫ → api.php ---------- */
  var form = $('#lead-form'), msg = $('#form-msg');
  if (form) {
    var say = function (t, cls) { msg.textContent = t; msg.className = 'form-msg ' + (cls || ''); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(form), name = (d.get('name') || '').trim(), contact = (d.get('contact') || '').trim();
      if (d.get('website')) return; // защита от ботов
      if (name.length < 2) return say('Введите имя.', 'err');
      if (contact.length < 5) return say('Укажите Telegram или телефон.', 'err');
      if (!d.get('agree')) return say('Нужно согласие на обработку данных.', 'err');
      var last = +localStorage.getItem('kb_lead_ts') || 0;
      if (Date.now() - last < 60000) return say('Заявка уже отправлена. Подождите минуту.', 'err');
      var btn = $('button[type=submit]', form); btn.disabled = true; say('Отправляем…');
      fetch((cfg.API_URL || './api.php') + '?action=lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KB': '1' },
        body: JSON.stringify(Object.assign({ name: name, contact: contact, source: location.pathname }, window.KB ? KB.leadFields() : {}))
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        localStorage.setItem('kb_lead_ts', String(Date.now()));
        if (window.KB) KB.track('lead_submit', { target: 'form' });
        form.reset(); say('Заявка отправлена. Мы скоро свяжемся с вами.', 'ok');
      }).catch(function () {
        say('Не удалось отправить. Попробуйте ещё раз или напишите в Telegram.', 'err');
      }).then(function () { btn.disabled = false; });
    });
  }
})();
