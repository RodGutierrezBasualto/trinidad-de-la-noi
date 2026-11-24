/* Modelling portfolio template — behaviour layer (from the Bennett & Clive study replica).
   Own vanilla rewrite of what the site's Nuxt components do (no Vue, no SplitText). The server-rendered markup and
   the site's CSS are kept as-is; window.BC (written by tools/build.py) carries the media the original loads client-side.

   1. core: Lenis smooth scroll + ScrollTrigger, ready promise, resize bus
   2. media: images (Storyblok /m/ resizing) and videos, lazy-loaded like the site's BaseImage / BaseVideo
   3. text splitting into lines / words / chars (the reveal CSS is the site's: .anim-line, .anim-line-scale)
   4. intro + header logo: BENNETT · & · CLIVE shrink to mid-height labels, then grow back over the footer
   5. nav, mobile toggle, contact modal, office clocks, page transitions (blur overlay)
   6. pages: home, work, project, about, legal */
(() => {
  'use strict';
  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power2.out' });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  const BC = window.BC || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const desktop = () => innerWidth >= 1024;
  const FIRST_VISIT = !sessionStorage.getItem('bc-seen');
  const FROM_TRANSITION = sessionStorage.getItem('bc-transition') === '1';
  sessionStorage.removeItem('bc-transition');

  /* ================= 1. core ================= */
  const bus = {};
  const on = (e, f) => (bus[e] = bus[e] || []).push(f);
  const emit = (e, ...a) => (bus[e] || []).forEach(f => f(...a));
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });       // the site's "loader promise"
  const ui = { nav: false, modal: false, loaderDone: false };

  const lenis = new Lenis({ duration: 0.8, easing: t => 1 - Math.pow(1 - t, 4) });
  lenis.on('scroll', e => { ScrollTrigger.update(); emit('scroll', e.scroll); });
  gsap.ticker.add(t => lenis.raf(t * 1000));
  lenis.stop();
  const syncLenis = () => (ui.nav || ui.modal || !ui.loaderDone ? lenis.stop() : lenis.start());

  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { ScrollTrigger.refresh(); emit('resize'); }, 300); });

  /* ================= 2. media ================= */
  const sb = (url, w) => `${url}/m/${w}x0/filters:format(webp)`;
  const isSB = url => /a\.storyblok\.com/.test(url) && !/\.svg$/i.test(url);

  /** Mount an image or video into `fig` (like the site's BaseMedia). o: fit, lazy('force'|'scroll'), threshold,
   *  autoplay, playing, loopTrigger, sound, sizes, alt */
  function mountMedia(fig, m, o = {}) {
    if (!fig || !m || !m.url) return null;
    const fit = !!o.fit;
    let el, load;
    if (m.type === 'video' || /\.mp4/i.test(m.url)) {
      el = document.createElement('div');
      el.className = 'base-video' + (fit ? ' base-video--fit' : '');
      if (!fit) el.style.paddingTop = (m.h / m.w) * 100 + '%';
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: o.loop !== false, playsInline: true, width: m.w, height: m.h });
      ['muted', 'playsinline', 'disablepictureinpicture'].forEach(a => v.setAttribute(a, ''));
      v.setAttribute('controlslist', 'nodownload noplaybackrate');
      el.append(v);
      el.wantsPlay = o.playing !== false && o.autoplay !== false;
      el.play = () => { el.wantsPlay = true; if (el.loaded) v.play().catch(() => {}); };
      el.pause = () => { el.wantsPlay = false; v.pause(); };
      load = () => {
        v.src = m.url;
        v.load();
        v.addEventListener('canplay', () => {
          if (el.loaded) return;
          el.loaded = true;
          el.classList.add('base-video--loaded');
          if (el.wantsPlay) v.play().catch(() => {});
          if (o.sound) armSound(el, v);
        });
      };
      if (o.loopTrigger) ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'bottom top', onEnter: el.play, onEnterBack: el.play, onLeave: el.pause, onLeaveBack: el.pause });
    } else {
      el = document.createElement('picture');
      el.className = 'base-image' + (fit ? ' base-image--fit' : '');
      const img = new Image();
      img.className = 'base-image__img base-image__img--fade';
      img.alt = m.alt || o.alt || '';
      img.decoding = 'async';
      img.width = m.w;
      img.height = m.h;
      el.append(img);
      load = () => {
        img.onload = () => el.classList.add('base-image--loaded');
        if (isSB(m.url)) {
          const ws = [320, 640, 768, 1024, 1280, 1920, 2560].filter(w => w <= Math.max(640, m.w));
          img.sizes = o.sizes || '100vw';
          img.srcset = ws.map(w => `${sb(m.url, w)} ${w}w`).join(', ');
          img.src = sb(m.url, Math.min(1920, m.w));
        } else img.src = m.url;
      };
    }
    fig.append(el);
    if (o.lazy === 'force') load();
    else ScrollTrigger.create({ trigger: el, start: o.threshold || '-200% 100%', once: true, onEnter: load });
    return el;
  }

  // click-to-unmute on videos that carry audio (the site swaps the cursor to sound-on / sound-off icons)
  function armSound(el, v) {
    const hasAudio = () => v.mozHasAudio || Boolean(v.webkitAudioDecodedByteCount) || Boolean(v.audioTracks && v.audioTracks.length);
    const check = () => { if (hasAudio()) { el.classList.add('base-video--sound-off'); v.removeEventListener('timeupdate', check); } };
    v.addEventListener('timeupdate', check);
    v.addEventListener('click', () => {
      if (!el.classList.contains('base-video--sound-off') && !el.classList.contains('base-video--sound-on')) return;
      const unmute = v.muted;
      v.muted = !unmute;
      v.volume = unmute ? 0.5 : 0;
      el.classList.toggle('base-video--sound-on', unmute);
      el.classList.toggle('base-video--sound-off', !unmute);
    });
  }

  /* ================= 3. text splitting ================= */
  /** Split the <p>s inside `box` (or `box` itself) into lines (and optionally words/chars). */
  function split(box, o = {}) {
    if (!box) return { lines: [], words: [], chars: [] };
    const lineClass = o.lineClass || 'anim-line';
    const targets = $$('p', box).length ? $$('p', box) : [box];
    const res = { lines: [], words: [], chars: [] };
    targets.forEach(t => {
      const tokens = [];
      const walk = n => n.childNodes.forEach(c => {
        if (c.nodeType === 3) c.textContent.split(/(\s+)/).forEach(w => { if (w.trim()) tokens.push(w); });
        else if (c.nodeName === 'BR') tokens.push('\n');
        else walk(c);
      });
      walk(t);
      t.textContent = '';
      const prevDisplay = t.style.display;
      t.style.display = 'block';                         // measure as normal text even inside flex parents
      const spans = [];
      tokens.forEach(w => {
        if (w === '\n') { spans.push('\n'); t.append(document.createElement('br')); return; }   // keep forced breaks while measuring
        const s = document.createElement('span');
        s.textContent = w;
        s.style.display = 'inline-block';
        if (o.wordClass) s.className = o.wordClass;
        t.append(s, ' ');
        spans.push(s);
      });
      const rows = [];
      let row = null, top = null;
      spans.forEach(s => {
        if (s === '\n') { row = null; return; }
        if (!row || s.offsetTop !== top) { row = []; rows.push(row); top = s.offsetTop; }
        row.push(s);
      });
      t.textContent = '';
      t.style.display = prevDisplay;
      rows.forEach(r => {
        const line = document.createElement('div');
        line.className = lineClass;
        line.style.position = 'relative';
        r.forEach((s, k) => {
          if (o.chars) {
            const word = s;
            const text = word.textContent;
            word.textContent = '';
            [...text].forEach(ch => {
              const c = document.createElement('span');
              c.textContent = ch;
              c.style.display = 'inline-block';
              if (o.charClass) c.className = o.charClass;
              word.append(c);
              res.chars.push(c);
            });
          }
          line.append(s);
          if (k < r.length - 1) line.append(' ');
          res.words.push(s);
        });
        t.append(line);
        res.lines.push(line);
      });
    });
    if (o.setDelay !== false) res.lines.forEach((l, i) => { l.style.transitionDelay = (o.baseDelay || 0) + i * 0.08 + 's'; });
    box.classList.add('text-splitter--splitted');
    return res;
  }

  /* ================= 4. intro + header logo ================= */
  const logo = {
    el: $('.header-logo'),
    pieces: ['left', 'center', 'right'].map(k => $(`.header-logo__svg--${k}`)),
    holders: ['left', 'center', 'right'].map(k => $(`.header-logo__placeholder--${k}`)),
    tl: null,
    minify: null,
  };
  logo.movers = logo.pieces.map(p => p && $('.header-logo-mover', p));

  // where each full-size piece has to scale (and the & slide) to sit on its small mid-height label
  function logoTargets() {
    const P = logo.pieces.map(p => p.getBoundingClientRect());
    const H = logo.holders.map(h => h.getBoundingClientRect());
    return [
      { scale: H[0].width / P[0].width, transformOrigin: 'left center' },
      { scale: H[1].width / P[1].width, x: H[1].left - P[1].left, transformOrigin: 'left center' },
      { scale: H[2].width / P[2].width, transformOrigin: 'center right' },
    ];
  }
  const setLogoSmall = () => logoTargets().forEach((t, i) => gsap.set(logo.pieces[i], t));

  // over the footer the labels drop to the bottom edge and grow back into the full-width logo
  function initLogoTl() {
    if (!$('.footer')) return;
    logo.tl = gsap.timeline({ scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } })
      .to(logo.pieces, { marginTop: -10, y: '50vh', duration: 1, ease: 'none' }, 0)
      .to(logo.movers, { y: '-50%', duration: 1, ease: 'none' }, 0)
      .to(logo.pieces[0], { scale: 1, ease: 'none' }, 1)
      .to(logo.pieces[1], { scale: 1, x: 0, ease: 'none' }, 1)
      .to(logo.pieces[2], { scale: 1, ease: 'none' }, 1);
    // phones: BENNETT → B and CLIVE → C while scrolling
    logo.minify = ScrollTrigger.create({
      trigger: document.documentElement, start: 'top+=5 top', endTrigger: '.footer', end: 'bottom bottom+=20', invalidateOnRefresh: true,
      onEnter: () => logo.el.classList.add('header-logo--minified'), onEnterBack: () => logo.el.classList.add('header-logo--minified'),
      onLeave: () => logo.el.classList.remove('header-logo--minified'), onLeaveBack: () => logo.el.classList.remove('header-logo--minified'),
    });
  }
  function rebuildLogo() {
    if (logo.tl) { logo.tl.scrollTrigger && logo.tl.scrollTrigger.kill(); logo.tl.kill(); }
    if (logo.minify) logo.minify.kill();
    gsap.set([...logo.pieces, ...logo.movers], { clearProps: 'all' });
    setLogoSmall();
    initLogoTl();
  }

  function intro() {
    const loader = $('.loader');
    const finish = () => {
      ui.loaderDone = true;
      sessionStorage.setItem('bc-seen', '1');
      if (loader) loader.remove();
      syncLenis();
      gsap.delayedCall(0.2, initLogoTl);
    };
    if (!FIRST_VISIT) {                                     // later page loads: straight to the small labels
      if (loader) loader.remove();
      setLogoSmall();
      gsap.delayedCall(0.15, () => { resolveReady(); finish(); });
      return;
    }
    gsap.delayedCall(0.2, () => loader && loader.classList.add('is-visible'));
    const T = logoTargets();
    const tl = gsap.timeline({ delay: 0.5, onComplete: finish }).addLabel('start');
    tl.set('.loader__label:first-child', { yPercent: -130, y: -20 }, 'start+=2');
    tl.set('.loader__label:last-child', { yPercent: 130, y: 20 }, 'start+=2');
    logo.pieces.forEach((p, i) => tl.to(p, { ...T[i], duration: 1.2, ease: 'power2.inOut' }, 'start+=2'));
    tl.add(resolveReady, 'start+=2.8');
  }

  // white logo; mix-blend-mode:difference everywhere except over the home hero video
  function initLogoBlend() {
    const home = $('.home-hero');
    if (!home) return;                                       // other pages stay blended (as server-rendered)
    ScrollTrigger.create({ trigger: home, start: 'top top', end: 'bottom 50%',
      onLeave: () => logo.el.classList.add('header-logo--blended'), onEnterBack: () => logo.el.classList.remove('header-logo--blended') });
  }

  /* ================= 5. nav, toggle, contact modal, clocks, transitions ================= */
  const nav = $('nav.nav');
  const toggle = $('.nav-toggle');
  const contactBtn = nav && $$('button.nav-item__link', nav)[0];
  const modal = $('.contact-modal');

  function setNav(open) {
    ui.nav = open;
    nav.classList.toggle('nav--open', open);
    nav.classList.toggle('is-visible', open || nav.dataset.visible === '1');
    toggle.classList.toggle('nav-toggle--open', open);
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    syncLenis();
  }
  function setModal(open) {
    if (!modal) return;
    ui.modal = open;
    const title = $('.contact-modal__title', modal);
    modal.classList.toggle('contact-modal--visible', open);
    nav.classList.toggle('nav--contact-open', open);
    toggle.classList.toggle('nav-toggle--contact-open', open);
    if (contactBtn) contactBtn.classList.toggle('nuxt-link-exact-active', open);
    gsap.killTweensOf(title);
    if (open) gsap.fromTo(title, { scale: 0, transformOrigin: 'bottom left' }, { scale: 1, duration: 0.5, onStart: () => requestAnimationFrame(() => modal.classList.add('is-visible')) });
    else gsap.to(title, { scale: 0, transformOrigin: 'top left', duration: 0.5, onStart: () => modal.classList.remove('is-visible') });
    syncLenis();
  }
  function initNav() {
    if (!nav) return;
    const home = $('.home-hero');
    nav.classList.toggle('nav--blended', !home);
    if (home) ScrollTrigger.create({ trigger: home, start: 'top top', end: 'bottom 2%',
      onLeave: () => nav.classList.add('nav--blended'), onEnterBack: () => nav.classList.remove('nav--blended') });
    if (contactBtn) contactBtn.addEventListener('click', () => { if (ui.nav) setNav(false); setModal(!ui.modal); });
    toggle.addEventListener('click', () => (ui.modal ? setModal(false) : setNav(!ui.nav)));
    logo.el.addEventListener('click', () => { if (ui.nav) setNav(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (ui.modal) setModal(false); if (ui.nav) setNav(false); } });
    ready.then(() => {
      nav.dataset.visible = '1';
      nav.classList.add('is-visible');
      toggle.classList.add('is-visible');
    });
  }

  // offices: HH:MM in each office's time zone, colon blinking (CSS)
  const ZONES = { 'new york': 'America/New_York', 'los angeles': 'America/Los_Angeles', miami: 'America/New_York', brooklyn: 'America/New_York' };
  function initClocks() {
    const offices = $$('.footer-content__office');
    const render = () => offices.forEach(o => {
      const name = (o.querySelector('p') || o).textContent.trim().toLowerCase();
      const tz = o.dataset.tz || ZONES[name] || 'Europe/Paris';      // content.json sets data-tz per city
      const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).formatToParts(new Date());
      const get = t => (parts.find(p => p.type === t) || {}).value || '';
      const inner = $('.clock__inner', o);
      if (inner) inner.innerHTML = `${get('hour')}<span class="clock__colon">:</span>${get('minute')}`;
    });
    render();
    setInterval(render, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  }

  // page transitions: blur overlay in, old page fades, then load the next page (which starts blurred and clears)
  const overlay = $('.transition-overlay');
  const pageEl = () => $('main > .home, main > .work, main > .project, main > .about, main > .legal');
  function initTransitions() {
    if (FROM_TRANSITION && overlay) {
      overlay.style.transition = 'none';
      overlay.classList.add('transition-overlay--visible');
      requestAnimationFrame(() => requestAnimationFrame(() => { overlay.style.transition = ''; ready.then(() => overlay.classList.remove('transition-overlay--visible')); }));
    }
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /^mailto:|^tel:/.test(a.getAttribute('href'))) return;
      e.preventDefault();
      const same = url.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '');
      if (ui.nav) setNav(false);
      if (ui.modal) setModal(false);
      if (same) { lenis.scrollTo(0); return; }
      if (overlay) overlay.classList.add('transition-overlay--visible');
      if (logo.tl) gsap.to(logo.tl, { progress: 0, duration: 0.8, ease: 'power2.out' });
      const page = pageEl();
      if (page) gsap.to(page, { opacity: 0, duration: 0.2, delay: 0.4, ease: 'none' });
      gsap.delayedCall(0.6, () => { sessionStorage.setItem('bc-transition', '1'); location.href = url.pathname.replace(/\/?$/, '/') + url.search + url.hash; });
    });
    addEventListener('pageshow', e => { if (e.persisted) { overlay && overlay.classList.remove('transition-overlay--visible'); const p = pageEl(); p && gsap.set(p, { opacity: 1 }); } });
  }

  /* ================= 6. pages ================= */
  function homePage() {
    const hero = $('.home-hero');
    const triggers = $$('.home-hero-trigger');
    const titles = $$('.home-hero-titles__title');
    const inactive = $$('.home-hero-inactive-titles__item');
    const assets = $$('.home-hero-asset');
    let current = 0;

    // phones: shrink any hero title that would run into the menu button
    if (innerWidth < 768) {
      const toggle = $('.nav-toggle');
      const max = (toggle ? toggle.getBoundingClientRect().left : innerWidth - 60) - 24;
      titles.forEach(t => {
        const a = $('a', t) || t;
        const left = t.closest('.home-hero-titles').getBoundingClientRect().left;
        const w = t.offsetWidth;
        if (left + w > max) a.style.fontSize = parseFloat(getComputedStyle(a).fontSize) * (max - left) / w + 'px';
      });
    }

    // media: every project video is mounted at once; only the visible one plays
    assets.forEach((a, i) => {
      const d = BC.hero[i] || {};
      const m = innerWidth < 767 && d.mobile ? d.mobile : d.asset;
      const el = mountMedia($('.home-hero-asset__fig', a), m, { fit: true, lazy: 'force', playing: i === 0 });
      if (i === 0) return;
      // the next video opens upwards like a curtain: wrapper slides 100→0 while the figure counter-slides −100→0
      gsap.set(a, { yPercent: 100 });
      gsap.set($('.home-hero-asset__fig', a), { yPercent: -100 });
      ScrollTrigger.create({
        animation: gsap.timeline().to(a, { yPercent: 0, force3D: true, duration: 1, ease: 'none' }, 0).to($('.home-hero-asset__fig', a), { yPercent: 0, force3D: true, duration: 1, ease: 'none' }, 0),
        trigger: triggers[i], start: 'top center', end: 'bottom center', scrub: true,
      });
      if (el && el.play) ScrollTrigger.create({ trigger: triggers[i], start: 'top center', end: i === assets.length - 1 ? 'bottom top-=50%' : 'bottom top',
        onEnter: el.play, onEnterBack: el.play, onLeave: el.pause, onLeaveBack: el.pause });
    });

    ready.then(() => {
      $('.home-hero-assets').classList.add('is-visible');
      // active title (top left): grows from bottom-left, then each scroll step swaps it for the next one
      gsap.fromTo(titles[0], { scale: 0 }, { scale: 1, transformOrigin: 'bottom left', duration: 1, ease: 'power2.out', onComplete: () => {
        triggers.forEach((t, i) => ScrollTrigger.create({
          animation: gsap.timeline()
            .fromTo(titles[i], { scale: 0, transformOrigin: 'bottom left' }, { scale: 1, duration: 0.5, ease: 'none' }, 0)
            .to(titles[i], { yPercent: -110, duration: 0.5, ease: 'none' }, 0.5),
          trigger: t, start: 'top center', end: 'bottom top', scrub: 0,
          onUpdate: s => { if (s.progress > 0.25 && s.progress < 0.75) current = i; },
        }));
      } });
      // the queue (bottom right): grows in, then each name shrinks away to the top right as the list moves up
      gsap.fromTo(inactive, { scale: 0 }, { scale: 1, transformOrigin: 'top right', stagger: 0.15, duration: 1, delay: 0.3, ease: 'power2.out', onComplete: () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true } }).addLabel('start');
        tl.to(inactive, { scale: 0, transformOrigin: 'top right', stagger: { each: 1 }, duration: 1, ease: 'none' }, 'start');
        let rest = inactive;
        inactive.forEach((_, o) => {
          if (o === inactive.length - 1) return;
          rest = rest.slice(1);
          tl.to(rest, { yPercent: -100 * (o + 1), duration: 1, ease: 'none' }, `start+=${o}`);
        });
      } });
    });

    // snap: half a second after scrolling stops inside the hero, glide to the current project's step
    let inView = true, snap = null, tops = [];
    const measure = () => { tops = triggers.map(t => t.getBoundingClientRect().top + scrollY); };
    measure();
    on('resize', measure);
    ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom bottom', onEnterBack: () => { inView = true; }, onLeave: () => { inView = false; } });
    on('scroll', () => {
      if (snap) snap.kill();
      snap = gsap.delayedCall(0.5, () => {
        if (!inView || !ui.loaderDone || Math.abs(tops[current] - lenis.scroll) < 2) return;
        lenis.scrollTo(triggers[current]);
      });
    });

    // about: "Let's / raise / your / idea." — the last word rises 45vh into place (desktop)
    const aboutTitle = $('.home-about__title .text-splitter');
    if (aboutTitle) {
      const sp = split(aboutTitle, { lineClass: 'home-about__title-line', wordClass: 'home-about__title-word', setDelay: false });
      const last = sp.lines[sp.lines.length - 1];
      if (last) gsap.set(last, { display: 'flex' });
      gsap.matchMedia().add('(min-width: 1024px)', () => {
        const word = sp.words[sp.words.length - 1];
        gsap.timeline({ scrollTrigger: { trigger: '.home-about__title', start: 'top 65%', end: 'bottom top', scrub: true } })
          .fromTo(word, { y: '45vh' }, { y: '0vh', duration: 1, ease: 'power1.out' }, 0);
      });
    }

    // services: the sticky right list hands each name to the fixed left list, over the reel
    mountMedia($('.home-services__reel'), BC.reel, { fit: true });
    const left = $$('.home-services__list--left .home-services__list-item');
    const clones = $$('.home-services__list--right .home-services__list-item').filter(li => !li.classList.contains('home-services__list-item-spacer'));
    clones.forEach((clone, i) => {
      const trig = $('.home-services__list-item-trigger', clone) || clone;
      ScrollTrigger.create({
        animation: gsap.timeline()
          .fromTo($('.home-services__list-item-inner', clone), { scale: 1, transformOrigin: 'top right' }, { scale: 0, ease: 'none', duration: 0.5 }, 0)
          .fromTo(left[i], { scale: 0, transformOrigin: 'bottom left' }, { scale: 1, ease: 'none', duration: 0.5 }, 0),
        trigger: trig, start: 'top 52%', end: 'bottom 52%', scrub: true,
      });
      ScrollTrigger.create({ animation: gsap.timeline().fromTo(left[i], { y: 0 }, { y: '-52vh', ease: 'none', duration: 1 }), trigger: trig, start: 'bottom 52%', end: 'bottom top', scrub: true });
    });

    // clients: logos, then the pairs push apart and close again as they cross the screen (desktop)
    $$('.home-clients__item').forEach((item, i) => {
      const d = BC.clients[i] || {};
      ['left', 'right'].forEach(side => {
        const fig = $(`.home-clients__label--${side} .home-clients__label-fig`, item);
        const url = d[side + 'Logo'];
        if (fig && url) fig.innerHTML = `<picture class="base-image base-image--loaded"><img class="base-image__img" src="${url}" alt=""></picture>`;
      });
    });
    gsap.matchMedia().add('(min-width: 1024px)', () => {
      const L = $$('.home-clients__label--left'), R = $$('.home-clients__label--right');
      gsap.timeline({ scrollTrigger: { trigger: '.home-clients__list', start: 'top 55%', end: 'bottom 40%', scrub: true } }).addLabel('start')
        .to(L, { x: -100, stagger: 0.2, duration: 0.6, ease: 'sine.out' }, 'start')
        .to(R, { x: 100, stagger: 0.2, duration: 0.6, ease: 'sine.out' }, 'start')
        .to(L, { x: 0, stagger: 0.2, duration: 0.6, ease: 'sine.out' }, 'start+=0.6')
        .to(R, { x: 0, stagger: 0.2, duration: 0.6, ease: 'sine.out' }, 'start+=0.6');
    });
  }

  function workPage() {
    const work = $('.work');
    const list = $('.work-list');
    const items = $$('.work-list-item');
    const hoverTitles = $$('.work-hover-title');
    const title = $('.work-title');
    let introDone = false, hovered = -1, fadeCall = null, overlayOn = false;

    // media: the first eight load straight away, the rest as they reach the screen once the intro is done
    const lazy = [];
    items.forEach((item, i) => {
      const d = BC.items[i];
      const fig = $('.work-list-item__fig', item);
      if (!d || !d.media || !fig) return;
      fig.style.aspectRatio = `${d.media.w} / ${d.media.h}`;
      if (i <= 7) mountMedia(fig, d.media, { fit: true, lazy: 'force', loopTrigger: true, sizes: '(max-width: 1023px) 50vw, 25vw', alt: d.title });
      else lazy.push(() => mountMedia(fig, d.media, { fit: true, threshold: 'top bottom', loopTrigger: true, sizes: '(max-width: 1023px) 50vw, 25vw', alt: d.title }));
    });

    // "Work" title + one giant hover title per project
    const titleTl = gsap.timeline({ paused: true }).to(title, { scale: 1, transformOrigin: 'bottom left', duration: 0.8 });
    const tls = hoverTitles.map(h => {
      const sp = split($('.text-splitter', h) || h, { lineClass: 'work-hero__line', setDelay: false });
      gsap.set(sp.lines, { scale: 0, transformOrigin: 'bottom left' });
      gsap.set(h, { opacity: 1 });
      return { lines: sp.lines, tl: gsap.timeline({ paused: true }).to(sp.lines, { scale: 1, transformOrigin: 'bottom left', duration: 0.8 }) };
    });
    const setOverlay = v => {
      overlayOn = v;
      list.classList.toggle('work-list--hovering', v);
      if (v) { titleTl.pause(); gsap.set(title, { scale: 0 }); } else titleTl.play(0);
    };
    const setHovered = id => {
      hovered = id;
      items.forEach((it, k) => it.classList.toggle('work-list-item--faded', id >= 0 && k !== id));
    };
    items.forEach((item, i) => {
      item.addEventListener('mouseenter', () => {
        if (fadeCall) fadeCall.kill();
        setOverlay(true);
        setHovered(i);
        if (tls[i]) tls[i].tl.play(0);
      });
      item.addEventListener('mouseleave', () => {
        if (fadeCall) fadeCall.kill();
        if (tls[i]) { tls[i].tl.pause(); gsap.set(tls[i].lines, { scale: 0 }); }
        setOverlay(false);
        fadeCall = gsap.delayedCall(0.6, () => setHovered(-1));
      });
    });

    ready.then(() => {
      gsap.delayedCall(0.1, () => work.classList.add('is-visible'));
      gsap.delayedCall(0.2, () => { if (!overlayOn) titleTl.play(0); });
      gsap.delayedCall(0.4, () => { introDone = true; lazy.forEach(f => f()); ScrollTrigger.refresh(); });
    });
  }

  function projectPage() {
    const hero = $('.project-hero');
    const mc = $('.modular-content');
    split($('.project-hero__title .text-splitter'), { lineClass: 'anim-line-scale' });
    split($('.project-hero__subtitle .text-splitter'), { baseDelay: 0.4 });
    split($('.project-hero__copy .text-splitter'), { baseDelay: 0.6 });

    if (mc) {
      if (BC.offset) mc.classList.add('modular-content--offset');
      [...mc.children].forEach((block, k) => {
        const media = BC.blocks[k] || [];
        $$('figure', block).forEach((fig, j) => mountMedia(fig, media[j], { loopTrigger: true, sound: true, sizes: block.classList.contains('full-bleed') ? '80vw' : '(max-width: 1023px) 100vw, 50vw' }));
      });
    }
    // prev / next project: hovering a link pops its media up
    const figs = $$('.project-recirc__fig');
    figs.forEach((fig, i) => {
      const m = (BC.recirc || [])[i];
      if (!m) return;
      fig.style.aspectRatio = `${m.w} / ${m.h}`;
      mountMedia(fig, m, { fit: true, sizes: '(max-width: 1023px) 50vw, 25vw' });
    });
    [['.project-recirc__prev', 0], ['.project-recirc__next', 1]].forEach(([sel, i]) => {
      const link = $(`${sel} .project-recirc__link`);
      if (!link || !figs[i]) return;
      link.addEventListener('mouseenter', () => figs[i].classList.add('project-recirc__fig--visible'));
      link.addEventListener('mouseleave', () => figs[i].classList.remove('project-recirc__fig--visible'));
    });

    ready.then(() => {
      hero && hero.classList.add('is-visible');
      mc && mc.classList.add('modular-content--visible');
    });
  }

  function aboutPage() {
    const titles = $$('.about-titles__item');
    const scrub = (trigger, start, end, build, extra = {}) => ScrollTrigger.create({ trigger, start, end, scrub: true, animation: build(gsap.timeline()), ...extra });

    // fixed side titles: WHY US → About → Sustainability → Hu(e)mans
    ready.then(() => gsap.fromTo(titles[0], { scale: 0 }, { scale: 1, transformOrigin: 'bottom left', duration: 0.8 }));
    scrub('.about-history', 'top center', 'top top', tl => tl
      .to(titles[0], { yPercent: -110, y: -2, duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo(titles[1], { scale: 0 }, { scale: 1, transformOrigin: 'bottom left', duration: 1, ease: 'power2.inOut' }, 0));
    scrub('.about-sustainability', 'top 90%', 'top 40%', tl => tl
      .fromTo(titles[2], { scale: 0 }, { scale: 1, transformOrigin: 'bottom left', duration: 1, ease: 'power2.inOut' }, 0));
    scrub('.about-sustainability', 'bottom 30%', 'bottom -20%', tl => tl
      .to(titles[2], { yPercent: -110, y: -2, duration: 1, ease: 'power2.inOut' }, 0)
      .fromTo(titles[3], { scale: 0 }, { scale: 1, transformOrigin: 'bottom left', duration: 1, ease: 'power2.inOut' }, 0));
    scrub('.footer', 'top bottom', 'top center', tl => tl.to(titles[3], { yPercent: -130, y: -2, duration: 1 }, 0));

    // hero copy: each line splits from its centre by 100px and closes again as it crosses the middle (desktop)
    const heroBox = $('.about-hero__copy .text-splitter');
    const sp = split(heroBox, { lineClass: 'about-hero__line', chars: true, charClass: 'about-hero__char', setDelay: false });
    ready.then(() => $('.about-hero').classList.add('is-visible'));
    gsap.matchMedia().add('(min-width: 1024px)', () => {
      sp.lines.forEach(line => {
        const chars = $$('.about-hero__char', line);
        if (!chars.length) return;
        const lr = line.getBoundingClientRect();
        let f = Math.ceil(chars.length / 2) - 1;
        const c = chars[f].getBoundingClientRect();
        if (c.left + c.width / 2 > lr.left + lr.width / 2) f -= 1;
        const L = chars.slice(0, f + 1), R = chars.slice(f + 1);
        gsap.timeline({ scrollTrigger: { trigger: line, start: 'top 55%', end: 'bottom 40%', scrub: true } }).addLabel('start')
          .to(L, { x: -100, duration: 0.6, ease: 'sine.out' }, 'start').to(R, { x: 100, duration: 0.6, ease: 'sine.out' }, 'start')
          .to(L, { x: 0, duration: 0.6, ease: 'sine.out' }, 'start+=0.6').to(R, { x: 0, duration: 0.6, ease: 'sine.out' }, 'start+=0.6');
      });
    });

    aboutHistory();

    // diversity: three portraits open like curtains
    const divFigs = $$('.about-diversity__fig');
    divFigs.forEach((fig, i) => mountMedia(fig, (BC.diversity || [])[i], { sizes: '25vw' }));
    const wraps = $$('.about-diversity__fig-wrapper');
    if (wraps.length) gsap.timeline({ scrollTrigger: { trigger: '.about-diversity', start: 'top 80%', end: 'top 20%', scrub: true } }).addLabel('start')
      .fromTo(wraps, { yPercent: 101 }, { yPercent: 0, stagger: 0.35, duration: 1, ease: 'power2.inOut' }, 'start')
      .fromTo(divFigs, { yPercent: -101 }, { yPercent: 0, stagger: 0.35, duration: 1, ease: 'power2.inOut' }, 'start');
  }

  // About history: a sticky frame where four pictures rise in, slide together, the first grows to fill the frame,
  // giant "ABOUT" lines stream sideways behind, and the history copy scrolls up through a slanting clip.
  function aboutHistory() {
    const root = $('.about-history');
    if (!root) return;
    const figs = $$('.about-history__fig');
    const wrappers = $$('.about-history__fig-wrapper');
    const inners = $$('.about-history__fig-inner');
    const placeholder = $('.about-history__fig-placeholder');
    const overlay = $('.about-history__overlay');
    const content = $('.about-history__content-wrapper');
    const H = BC.history || [];
    figs.forEach((fig, i) => mountMedia(fig, H[i], { fit: true, lazy: 'force' }));
    const contentFig = content && $('.about-history__content-fig figure, figure.about-history__content-fig', content);
    mountMedia(contentFig, H[0], { fit: true, lazy: 'force' });

    // marquee lines: enough clones to fill the screen
    const box = $('.about-history__titles-container');
    const ref = box && $('.about-history__title-line:not(.about-history__title-line--clone)', box);
    const buildClones = () => {
      if (!ref) return;
      $$('.about-history__title-line--clone', box).forEach(c => c.remove());
      const n = Math.floor(innerHeight / Math.max(1, ref.offsetHeight)) + 4;
      const words = $$('.about-history__title-line-span', ref).map(s => s.textContent);
      for (let i = 0; i < n; i++) {
        const line = document.createElement('div');
        line.className = 'about-history__title-line about-history__title-line--clone';
        line.innerHTML = [...words, words[0]].slice(0, 7).map(w => `<span class="about-history__title-line-span">${w}</span>`).join(' ');
        box.append(line);
      }
    };

    let tls = [];
    const build = () => {
      tls.forEach(t => { t.scrollTrigger && t.scrollTrigger.kill(); t.kill(); });
      tls = [];
      gsap.set([...wrappers, ...inners, ...figs, placeholder, overlay].filter(Boolean), { clearProps: 'all' });
      buildClones();
      if (!overlay || !wrappers.length) return;
      const D = desktop();
      const o = overlay.getBoundingClientRect();
      if (placeholder && wrappers[1]) placeholder.style.width = wrappers[1].getBoundingClientRect().width + 'px';
      if (D) gsap.set([...wrappers, placeholder].filter(Boolean), { aspectRatio: `${o.width} / ${o.height}` });
      const W = wrappers.map(w => w.getBoundingClientRect());
      const p = placeholder ? placeholder.getBoundingClientRect() : W[0];

      // 1) pictures rise in (counter-sliding masks), then slide together into the centre
      const t1 = gsap.timeline({ scrollTrigger: { trigger: '.about-history__scroller--figs', start: D ? 'top 60%' : 'top 80%', end: 'bottom bottom', scrub: true } });
      t1.fromTo(inners, { yPercent: 101 }, { yPercent: 0, stagger: D ? 0.35 : -0.5, duration: 3, ease: 'power2.inOut' }, 0)
        .fromTo(figs, { yPercent: -101 }, { yPercent: 0, stagger: D ? 0.35 : -0.35, duration: 3, ease: 'power2.inOut' }, 0);
      wrappers.forEach((w, i) => {
        t1.to(w, { x: p.left - W[i].left, duration: D ? 3 : 1, ease: 'power1.inOut' }, 4.2);
        if (!D) t1.to(w, { y: p.top - W[i].top - W[i].height / 2, duration: 1, ease: 'power1.inOut' }, 5.2);
      });
      tls.push(t1);

      // 2) the top picture grows to the frame, the white frame fades in over it
      const t2 = gsap.timeline({ scrollTrigger: { trigger: '.about-history__scroller--scaling', start: 'top bottom', end: 'bottom bottom', scrub: true } });
      if (D) t2.to(wrappers[0], { scale: o.width / W[0].width + 0.01, duration: 3, ease: 'power3.inOut' }, 0);
      else {
        t2.set(wrappers[0], { overflow: 'inherit' }, 0)
          .to(wrappers[0], { x: 0, y: -(W[0].top - o.top), duration: 3, ease: 'power1.inOut' }, 0)
          .to(inners[0], { width: o.width, height: o.height, duration: 3, ease: 'power1.inOut' }, 0);
      }
      t2.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'none' }, 3).to(wrappers[0], { opacity: 0, duration: 0.1, ease: 'none' }, 3.4);
      tls.push(t2);

      // 3) giant ABOUT lines: words pop in at random and the lines stream left / right
      if (box && ref) {
        const clones = $$('.about-history__title-line--clone', box);
        const t3 = gsap.timeline({ scrollTrigger: { trigger: '.about-history__scroller--scaling', start: 'top 80%', endTrigger: '.about-history__scroller--content', end: 'bottom bottom', scrub: true } });
        t3.to('.about-titles__item:nth-child(2)', { opacity: 0, duration: 0.1 }, 0)
          .to(box, { opacity: 1, duration: D ? 0.1 : 1 }, 0)
          .set($$('.about-history__title-line-span', box), { opacity: 1, stagger: { each: 0.08, from: 'random' } }, 0.1)
          .to(ref, { xPercent: -50, duration: 24, ease: 'power1.out' }, 0.1);
        if (D) {
          t3.to(clones.filter((_, i) => i % 2 === 0), { xPercent: -50, duration: 24, ease: 'power1.out' }, 0.1)
            .to(clones.filter((_, i) => i % 2 === 1), { xPercent: 50, duration: 24, ease: 'power1.out' }, 0.1);
        } else {
          clones.forEach((c, i) => t3.to(c, { xPercent: (i % 2 ? 1 : -1) * gsap.utils.random(40, 60, 1), duration: 24, ease: 'power1.out' }, 0.1));
        }
        tls.push(t3);
      }

      // 4) the copy scrolls up through the frame; at the end the frame opens with a slanted clip
      if (content) {
        const sub = $('.about-history__content-subtitle--animated', content) || $('.about-history__content-subtitle', content);
        const fig = $('.about-history__content-fig--animated', content) || $('.about-history__content-fig', content);
        const copy = $('.about-history__content-copy', content);
        const t4 = gsap.timeline({ scrollTrigger: { trigger: '.about-history__scroller--content', start: 'top bottom', end: 'bottom 75%', scrub: true } });
        if (D) {
          t4.to(sub, { yPercent: -100, duration: 6, ease: 'power2.out' }, 0)
            .to(fig, { yPercent: -100, duration: 7, ease: 'power2.out' }, 0.6)
            .to(copy, { y: -innerHeight, yPercent: -100, duration: 30, ease: 'none' }, 0.8)
            .to(overlay, { scaleX: 1.25, scaleY: 1.25, duration: 6, ease: 'none' }, 20)
            .to(content, { '--leftY': '-12%', '--rightY': '-12%', duration: 6, ease: 'none' }, 20)
            .to(sub, { yPercent: -200, duration: 10, ease: 'power2.in' }, 22)
            .to(fig, { yPercent: -200, duration: 10, ease: 'power2.in' }, 22.6);
        } else {
          t4.to($('.about-history__content', content), { y: -innerHeight, yPercent: -100, duration: 28, ease: 'none' }, 0)
            .to(overlay, { scaleX: 1.25, scaleY: 1.25, duration: 1, ease: 'none' }, 23)
            .to(content, { '--leftY': '-12%', '--rightY': '-12%', duration: 1, ease: 'none' }, 23);
        }
        tls.push(t4);
      }
    };
    gsap.delayedCall(0.1, build);
    on('resize', () => gsap.delayedCall(0.1, build));
  }

  function legalPage() {
    split($('.legal-hero .text-splitter'), { lineClass: 'anim-line-scale' });
    ready.then(() => { $('.legal-hero') && $('.legal-hero').classList.add('is-visible'); $('.legal-content') && $('.legal-content').classList.add('is-visible'); });
  }

  /* ================= boot ================= */
  const start = () => {
    initNav();
    initClocks();
    initTransitions();
    ready.then(initLogoBlend);                           // during the intro the logo stays blended (black on the white loader)
    ({ home: homePage, work: workPage, project: projectPage, about: aboutPage, legal: legalPage }[BC.page] || (() => {}))();
    intro();
    on('resize', () => { if (ui.loaderDone) rebuildLogo(); });
    ScrollTrigger.refresh();
    addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  };
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
})();
