/* ---------- Shared utilities ---------- */
  const lerp = (a, b, n) => a + (b - a) * n;

  /* ---------- Disable browser scroll restoration (fixes Safari opening page
     at a random scroll position from the previous session) ---------- */
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  // If the URL has no hash, force top on load — prevents Safari auto-scroll
  if (!window.location.hash) {
    window.scrollTo(0, 0);
    // Also run on pageshow to cover the back/forward cache
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && !window.location.hash) window.scrollTo(0, 0);
    });
  }

  /* ---------- Feature detection ---------- */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const dialogs = Array.from(document.querySelectorAll('.mobile-menu, .lightbox, .cases-modal, .egg-modal'));
  const openDialogs = new Set();
  const dialogFocus = new WeakMap();
  const focusableElements = dialog => Array.from(dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  const syncModalScrollLock = () => {
    let opened = false;
    let returnFocus;
    dialogs.forEach(dialog => {
      const isOpen = dialog.classList.contains('open');
      const wasOpen = openDialogs.has(dialog);
      dialog.toggleAttribute('inert', !isOpen);
      dialog.setAttribute('aria-hidden', String(!isOpen));
      if (isOpen && !wasOpen) {
        dialog.scrollTop = 0;
        const card = dialog.querySelector('.cases-card, .egg-card');
        if (card) card.scrollTop = 0;
        dialogFocus.set(dialog, document.activeElement);
        openDialogs.add(dialog);
        opened = true;
      } else if (!isOpen && wasOpen) {
        returnFocus = dialogFocus.get(dialog);
        openDialogs.delete(dialog);
      }
    });
    const activeDialog = dialogs.filter(dialog => openDialogs.has(dialog)).at(-1);
    if (activeDialog && (opened || returnFocus && !activeDialog.contains(returnFocus))) {
      focusableElements(activeDialog)[0]?.focus({ preventScroll: true });
    } else if (returnFocus?.isConnected) {
      returnFocus.focus({ preventScroll: true });
    }
    const locked = openDialogs.size > 0;
    document.body.style.overflow = locked ? 'hidden' : '';
    document.documentElement.style.overflow = locked ? 'hidden' : '';
  };
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const activeDialog = dialogs.filter(dialog => openDialogs.has(dialog)).at(-1);
    if (!activeDialog) return;
    const controls = focusableElements(activeDialog);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) return;
    if (!activeDialog.contains(document.activeElement) || !event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus({ preventScroll: true });
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus({ preventScroll: true });
    }
  });

  /* ---------- INTRO overlay (first visit per session) — WAAPI ---------- */
  (function () {
    const intro = document.getElementById('intro');
    const stage = intro?.querySelector('.intro-stage');
    const eyes  = intro?.querySelectorAll('.eye');
    const seenKey = 'kl_intro_seen_v1';
    let alreadySeen = false;
    try { alreadySeen = sessionStorage.getItem(seenKey); } catch { /* Storage may be unavailable for local files. */ }
    const releaseGate = () => {
      clearTimeout(window.__introBoot?.timer);
      document.documentElement.classList.remove('intro-pending');
    };

    if (!intro || !stage) { releaseGate(); return; }
    if (prefersReducedMotion || alreadySeen || typeof stage.animate !== 'function' || window.__introBoot?.expired) {
      intro.style.display = 'none';
      releaseGate();
      return;
    }

    let fallbackTimer;
    const finishIntro = () => {
      clearTimeout(fallbackTimer);
      intro.classList.remove('is-running');
      intro.style.display = 'none';
      document.body.classList.remove('intro-active', 'intro-settled');
      releaseGate();
      intro.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel());
    };
    fallbackTimer = setTimeout(finishIntro, 5000);
    intro.classList.add('is-running');
    document.body.classList.add('intro-active');
    releaseGate();

    const animate = (el, keyframes, options) =>
      el.animate(keyframes, { fill: 'forwards', ...options }).finished;

    // Helper: freeze current computed transform as a new baseline
    // (so the next animation starts exactly where the previous one ended).
    const commitTransform = (el, transform, opacity) => {
      el.style.transform = transform;
      if (opacity !== undefined) el.style.opacity = opacity;
    };
    const INTRO_SPEED = 0.7;
    const ms = (value) => Math.round(value * INTRO_SPEED);

    // === RUN SEQUENCE ===
    (async () => {
      /* 1. FALL (630ms): from -120vh (rotated 180°) down to y=0.
         ease-in simulates gravity acceleration. */
      await animate(stage, [
        { transform: 'translateY(-120vh) rotate(180deg) scale(1, 1)', opacity: 0 },
        { transform: 'translateY(-90vh)  rotate(180deg) scale(1, 1)', opacity: 1, offset: 0.1 },
        { transform: 'translateY(0)      rotate(180deg) scale(1, 1)', opacity: 1 }
      ], { duration: ms(630), easing: 'cubic-bezier(.55, 0, .85, .3)' });
      commitTransform(stage, 'translateY(0) rotate(180deg) scale(1, 1)', 1);

      /* 2. HEAD SQUAT (155ms): hard compression after head impact */
      await animate(stage, [
        { transform: 'translateY(0)    rotate(180deg) scale(1, 1)' },
        { transform: 'translateY(23px) rotate(180deg) scale(1.29, 0.60)' }
      ], { duration: ms(155), easing: 'cubic-bezier(.28, 0, .35, 1)' });
      commitTransform(stage, 'translateY(23px) rotate(180deg) scale(1.29, 0.60)');

      /* 2b. PRE-JUMP STRETCH (90ms): squash-and-stretch windup */
      await animate(stage, [
        { transform: 'translateY(23px) rotate(180deg) scale(1.29, 0.60)' },
        { transform: 'translateY(14px) rotate(180deg) scale(0.85, 1.20)' }
      ], { duration: ms(90), easing: 'cubic-bezier(.34, 1.1, .65, 1)' });
      commitTransform(stage, 'translateY(14px) rotate(180deg) scale(0.85, 1.20)');

      /* 3. JUMP + FLIP (640ms): dense WAAPI arc.
         The apex is spread over several close keyframes, so the invader can
         soften at the top without freezing or visually snapping into descent. */
      await animate(stage, [
        { transform: 'translateY(14px)   rotate(180deg) scale(0.85, 1.20)', offset: 0 },
        { transform: 'translateY(-18px)  rotate(214deg) scale(0.92, 1.10)', offset: 0.16 },
        { transform: 'translateY(-68px)  rotate(250deg) scale(0.98, 1.02)', offset: 0.33 },
        { transform: 'translateY(-102px) rotate(286deg) scale(1, 1)',       offset: 0.48 },
        { transform: 'translateY(-110px) rotate(304deg) scale(1, 1)',       offset: 0.56 },
        { transform: 'translateY(-96px)  rotate(324deg) scale(1.01, 0.99)', offset: 0.66 },
        { transform: 'translateY(-46px)  rotate(348deg) scale(1.03, 0.97)', offset: 0.84 },
        { transform: 'translateY(0)      rotate(360deg) scale(1.05, 0.95)', offset: 1 }
      ], { duration: ms(640), easing: 'linear' });
      commitTransform(stage, 'translateY(0) rotate(360deg) scale(1.05, 0.95)');

      /* 4. LAND SQUAT (140ms): absorb landing on legs */
      await animate(stage, [
        { transform: 'translateY(0)   rotate(360deg) scale(1.05, 0.95)' },
        { transform: 'translateY(14px) rotate(360deg) scale(1.29, 0.60)' }
      ], { duration: ms(140), easing: 'cubic-bezier(.28, 0, .3, 1)' });
      commitTransform(stage, 'translateY(14px) rotate(360deg) scale(1.29, 0.60)');

      /* 5. RECOVER (225ms): springs back to full height with overshoot */
      await animate(stage, [
        { transform: 'translateY(14px) rotate(360deg) scale(1.29, 0.60)' },
        { transform: 'translateY(-7px) rotate(360deg) scale(0.94, 1.08)', offset: 0.55 },
        { transform: 'translateY(0)    rotate(360deg) scale(1, 1)' }
      ], { duration: ms(225), easing: 'cubic-bezier(.34, 1.45, .64, 1)' });
      commitTransform(stage, 'translateY(0) rotate(360deg) scale(1, 1)');

      /* 6. SHAKE (280ms): mild wiggles */
      await animate(stage, [
        { transform: 'translateY(0) rotate(360deg)' },
        { transform: 'translateY(0) rotate(372deg)', offset: 0.2 },
        { transform: 'translateY(0) rotate(350deg)', offset: 0.4 },
        { transform: 'translateY(0) rotate(368deg)', offset: 0.6 },
        { transform: 'translateY(0) rotate(355deg)', offset: 0.8 },
        { transform: 'translateY(0) rotate(360deg)' }
      ], { duration: ms(280), easing: 'linear' });
      commitTransform(stage, 'translateY(0) rotate(360deg) scale(1, 1)');

      /* 7. BLINK + BLINK on eyes, parallel. */
      const blink = (eye) =>
        eye.animate([
          { transform: 'scaleY(1)' },
          { transform: 'scaleY(0.05)', offset: 0.5 },
          { transform: 'scaleY(1)' }
        ], { duration: ms(150), easing: 'ease-in-out', fill: 'forwards' }).finished;
      const wait = (ms) => new Promise(r => setTimeout(r, ms));

      await wait(ms(200));
      await Promise.all([...eyes].map(e => blink(e)));
      await wait(ms(260));
      await Promise.all([...eyes].map(e => blink(e)));

      /* 8. Fade out overlay */
      await wait(ms(350));
      document.body.classList.add('intro-settled');
      try { sessionStorage.setItem(seenKey, '1'); } catch { /* The animation can still finish without storage. */ }

      await animate(intro, [
        { opacity: 1 },
        { opacity: 0 }
      ], { duration: ms(500), easing: 'cubic-bezier(.4, 0, .2, 1)' });

    })().catch(error => {
      console.warn('Intro animation skipped; page remains available.', error);
    }).finally(finishIntro);
  })();

  /* ---------- TOPBAR / SCROLL-SPY / PARALLAX ---------- */
  const topbar = document.getElementById('topbar');
  const invaderLive = document.getElementById('invader-live');
  const invaderSlot = document.querySelector('.brand-invader-slot');
  const heroMark = document.querySelector('.hero-mark');

  // Scroll-spy setup
  const navAnchors = document.querySelectorAll('.nav-links a[href^="#"], .mobile-menu a[href^="#"]');
  const sectionMap = new Map();
  navAnchors.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const section = document.getElementById(id);
    if (section) sectionMap.set(id, section);
  });

  const darkSections = Array.from(document.querySelectorAll('.manifesto, .contact, footer'));
  const lastCase = document.getElementById('case-03');
  let scrollTicking = false;
  const onScroll = () => {
    const y = window.scrollY;
    topbar.classList.toggle('scrolled', y > 20);
    const headerCenter = topbar.offsetHeight / 2;
    topbar.classList.toggle('on-dark', darkSections.some(section => {
      const rect = section.getBoundingClientRect();
      return rect.top <= headerCenter && rect.bottom > headerCenter;
    }));

    // Parallax on hero (only when motion is OK)
    if (!prefersReducedMotion && heroMark && y < 800) {
      heroMark.style.transform = `translateY(${y * 0.06}px)`;
    }

    // Scroll-spy: the LAST section whose top has crossed above the trigger line.
    // This guarantees one section is always active — no gaps between sections.
    const trigger = window.innerHeight * 0.35;
    let activeId = null;
    let bestTop = -Infinity;
    sectionMap.forEach((section, id) => {
      const rect = section.getBoundingClientRect();
      // Section has started (top passed trigger line going down)
      // AND hasn't fully passed (bottom still below top of screen)
      const bottom = id === 'cases' && lastCase ? lastCase.getBoundingClientRect().bottom : rect.bottom;
      if (rect.top <= trigger && rect.top > bestTop && bottom > 0) {
        bestTop = rect.top;
        activeId = id;
      }
    });
    navAnchors.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + activeId);
    });
    scrollTicking = false;
  };
  window.addEventListener('scroll', () => {
    if (!scrollTicking) {
      requestAnimationFrame(onScroll);
      scrollTicking = true;
    }
  }, { passive: true });
  onScroll();

  /* ---------- LIVE INVADER state machine ----------
     States: home → prep (400ms: squat/wiggle/launch) → flying (walks w/ wobble)
                    → returning (350ms) → home
     The animation loop runs only while the invader is moving; scroll and resize
     wake it when a new position needs to be calculated. */
  (function () {
    if (!invaderLive) return;

    const HOME_W = 26, HOME_H = 19;
    const FLY_W  = 22, FLY_H  = 16;
    const PREP_MS   = 450;
    const RETURN_MS = 350;
    const TRIGGER_PREP_Y = 24;   // scrollY that kicks off prep-launch
    const TRIGGER_RETURN_Y = 6;  // scrollY that sends invader home

    let state = 'home';
    let stateStart = 0;
    let returnFromX = 0, returnFromY = 0; // remembered pos at moment of return
    let invaderFrame = 0;

    const getHome = () => {
      if (!invaderSlot) return { x: 24, y: 30 };
      const r = invaderSlot.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const getScrollPct = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      return max <= 0 ? 0 : Math.min(1, Math.max(0, h.scrollTop / max));
    };
    const FLY_Y = 16;
    // Visible travel range on the top edge: inset enough that neither the
    // centre nor the wobble (±2.2px) nor the ±5.5° rotation clip the edge.
    // Effective half-width at ±5.5° rotation ≈ FLY_W/2 * cos + FLY_H/2 * sin ≈ 12.5px.
    const EDGE_MARGIN = 8;
    const EFFECTIVE_HALF_W = FLY_W / 2 + 3; // includes wobble X headroom
    const travelX = (pct) => {
      const min = EFFECTIVE_HALF_W + EDGE_MARGIN;
      const max = window.innerWidth - EFFECTIVE_HALF_W - EDGE_MARGIN;
      return min + pct * (max - min);
    };

    // Reduced motion: no animation, just home vs flying
    const applyTransform = (x, y, sx, sy, rot) => {
      // Anchor the invader by its centre, then scale & rotate around centre.
      const nextTransform =
        `translate(${x - HOME_W/2}px, ${y - HOME_H/2}px) ` +
        `scale(${sx}, ${sy}) rotate(${rot}deg)`;
      if (nextTransform !== invaderLive.style.transform) {
        invaderLive.style.transform = nextTransform;
      }
    };

    const scheduleTick = () => {
      if (!invaderFrame) invaderFrame = requestAnimationFrame(tick);
    };

    const tick = (now) => {
      invaderFrame = 0;
      const y = window.scrollY;
      const pct = getScrollPct();
      const home = getHome();
      if (prefersReducedMotion) {
        applyTransform(y < TRIGGER_PREP_Y ? home.x : travelX(pct), y < TRIGGER_PREP_Y ? home.y : FLY_Y, 1, 1, 0);
        return;
      }

      // --- State transitions ---
      if ((state === 'home' || state === 'returning') && y > TRIGGER_PREP_Y) {
        if (state === 'returning') {
          // Interrupting return: start prep from wherever we are visually.
          // Easiest: let prep start from home coord; tiny visual teleport
          // is hidden by prep's squat motion.
        }
        state = 'prep';
        stateStart = now;
      } else if (state === 'flying' && y < TRIGGER_RETURN_Y) {
        state = 'returning';
        stateStart = now;
        // Remember current position on top edge
        returnFromX = travelX(pct);
        returnFromY = FLY_Y;
      }

      // --- Render by state ---
      if (state === 'home') {
        applyTransform(home.x, home.y, 1, 1, 0);
      }
      else if (state === 'prep') {
        const t = (now - stateStart) / PREP_MS;
        if (t >= 1) { state = 'flying'; }

        let x, ypos, sx, sy, rot;

        if (t < 0.3) {
          // SQUAT — shrink vertically, stretch horizontally, dip down a bit
          const k = t / 0.3;
          const ease = Math.sin(k * Math.PI);     // 0→1→0
          sx = 1 + 0.14 * ease;
          sy = 1 - 0.13 * ease;
          x = home.x;
          ypos = home.y + 6 * ease;
          rot = 0;
        } else if (t < 0.55) {
          // WIGGLE — oscillate rotation while starting to rise
          const k = (t - 0.3) / 0.25;
          sx = 1 + 0.02 * (1 - k);
          sy = 1 - 0.02 * (1 - k);
          x = home.x;
          ypos = home.y - 3 * k;
          rot = Math.sin(k * Math.PI * 3) * 14 * (1 - k * 0.4);
        } else {
          // LAUNCH — arc from home to top-edge position
          const k = (t - 0.55) / 0.45;
          const ease = 1 - Math.pow(1 - k, 3);   // ease-out cubic
          const targetX = travelX(pct);
          const targetY = FLY_Y;
          x = lerp(home.x, targetX, ease);
          // Arc upward then land
          const arc = 10;
          const straightY = lerp(home.y - 3, targetY, ease);
          ypos = straightY - arc * Math.sin(k * Math.PI);
          sx = lerp(1, FLY_W / HOME_W, ease);
          sy = lerp(1, FLY_H / HOME_H, ease);
          // Dampening rotation from wiggle residue
          rot = Math.sin((1 - k) * Math.PI * 2) * 6;
        }

        applyTransform(x, ypos, sx, sy, rot);
      }
      else if (state === 'flying') {
        const baseX = travelX(pct);
        // Walking wobble: three sin waves of different frequencies
        const wobbleY = Math.sin(now * 0.006) * 3.5;          // bounce up-down
        const wobbleX = Math.sin(now * 0.0045) * 2.2;         // sway left-right
        const wobbleRot = Math.sin(now * 0.0035) * 5.5;       // sway rotation (deg)
        applyTransform(
          baseX + wobbleX,
          FLY_Y + wobbleY,
          FLY_W / HOME_W,
          FLY_H / HOME_H,
          wobbleRot
        );
      }
      else if (state === 'returning') {
        const t = (now - stateStart) / RETURN_MS;
        if (t >= 1) { state = 'home'; }
        const k = Math.min(1, t);
        const ease = 1 - Math.pow(1 - k, 2.4);  // ease-out
        const x = lerp(returnFromX, home.x, ease);
        // Tiny arc downward as it settles back
        const straightY = lerp(returnFromY, home.y, ease);
        const settleArc = 8 * Math.sin(k * Math.PI);
        const ypos = straightY + settleArc;
        const sx = lerp(FLY_W / HOME_W, 1, ease);
        const sy = lerp(FLY_H / HOME_H, 1, ease);
        const rot = Math.sin((1 - k) * Math.PI) * 6;
        applyTransform(x, ypos, sx, sy, rot);
      }

      if (state !== 'home') scheduleTick();
    };
    window.addEventListener('scroll', scheduleTick, { passive: true });
    window.addEventListener('resize', scheduleTick);
    scheduleTick();

    // On resize, home position changes — state stays, tick will pick up new getHome()
  })();

  /* ---------- BURGER / MOBILE MENU ---------- */
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobile-menu');
  const toggleMobile = (force) => {
    const willOpen = typeof force === 'boolean' ? force : !mobileMenu.classList.contains('open');
    mobileMenu.classList.toggle('open', willOpen);
    burger.classList.toggle('open', willOpen);
    burger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    syncModalScrollLock();
  };
  burger.addEventListener('click', () => toggleMobile());
  document.getElementById('mobile-close')?.addEventListener('click', () => toggleMobile(false));
  document.querySelectorAll('[data-mm]').forEach(a => {
    a.addEventListener('click', () => toggleMobile(false));
  });

  /* ---------- REVEAL on scroll ---------- */
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    document.documentElement.classList.add('motion-ready');
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  }

  /* ---------- ANCHOR NAVIGATION ---------- */
  const flashSection = (element) => {
    if (!element || prefersReducedMotion) return;
    element.classList.remove('section-flash');
    requestAnimationFrame(() => {
      element.classList.add('section-flash');
      setTimeout(() => element.classList.remove('section-flash'), 1100);
    });
  };
  const scrollToSection = (target) => {
    const offset = topbar.offsetHeight + 20;
    const section = target.closest('section') || target;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: prefersReducedMotion ? 'instant' : 'smooth' });
    flashSection(section);
  };

  /* ---------- COUNT-UP animation on stats ---------- */
  const animateCountUp = (el) => {
    const target = el.getAttribute('data-target');
    const suffix = el.getAttribute('data-suffix') || '';
    const decimal = el.getAttribute('data-decimal') === 'true';
    const text = el.getAttribute('data-text');

    if (text) {
      if (prefersReducedMotion) { el.textContent = text; return; }
      el.textContent = '';
      requestAnimationFrame(() => {
        el.style.transition = 'opacity .6s ease';
        el.style.opacity = '0';
        el.textContent = text;
        requestAnimationFrame(() => { el.style.opacity = '1'; });
      });
      return;
    }

    if (prefersReducedMotion) {
      el.textContent = (decimal ? parseFloat(target).toLocaleString('ru-RU', {minimumFractionDigits: 1}) : target) + suffix;
      return;
    }

    const end = parseFloat(target);
    const duration = 1400;
    const start = performance.now();
    const format = (v) => {
      if (decimal) return v.toFixed(1).replace('.', ',');
      return Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
    };
    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = format(end * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const countIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          animateCountUp(e.target);
          countIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));
  }

  /* ---------- MAGNETIC CTA + TILT cards (desktop only, no reduced motion) ---------- */
  if (!prefersReducedMotion && isFinePointer) {
    document.querySelectorAll('.brand, .nav-links a, .btn, .contact-link, .cases-list a').forEach(el => {
      const syncHoverPoint = (e) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--hover-x', `${e.clientX - rect.left}px`);
        el.style.setProperty('--hover-y', `${e.clientY - rect.top}px`);
      };
      el.addEventListener('mouseenter', syncHoverPoint);
      el.addEventListener('mousemove', syncHoverPoint);
    });

    document.querySelectorAll('.btn').forEach(btn => {
      const strength = 0.18;
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });

    document.querySelectorAll('.headline-card').forEach(card => {
      const maxTilt = 7;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * 2 * maxTilt;
        const rotateX = -(y - 0.5) * 2 * maxTilt;
        card.classList.add('is-tilting');
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(6px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-tilting');
        card.style.transform = '';
      });
    });
  }

  /* ---------- PROMPT WORKBENCH TABS ---------- */
  document.querySelectorAll('[data-prompt-tabs]').forEach(workbench => {
    const tabs = Array.from(workbench.querySelectorAll('[role="tab"]'));
    const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
    const activate = (index, moveFocus = false) => {
      tabs.forEach((tab, i) => {
        const selected = i === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      panels[index].scrollTop = 0;
      if (moveFocus) tabs[index].focus({ preventScroll: true });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-selected') !== 'true') activate(index);
      });
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        activate(next, true);
      });
    });
  });

  /* ---------- LIGHTBOX ---------- */
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  document.querySelectorAll('[data-zoom]').forEach(el => {
    el.addEventListener('click', () => {
      lightboxImg.src = el.getAttribute('data-zoom');
      lightboxImg.alt = el.querySelector('img')?.alt || 'Изображение кейса';
      lightbox.classList.add('open');
      syncModalScrollLock();
    });
  });
  const closeLightbox = () => {
    lightbox.classList.remove('open');
    syncModalScrollLock();
    lightboxImg.removeAttribute('src');
    lightboxImg.alt = '';
  };
  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightbox.classList.contains('open')) closeLightbox();
      if (eggModal.classList.contains('open')) closeEgg();
      if (document.getElementById('cases-modal').classList.contains('open')) closeCases();
      if (mobileMenu.classList.contains('open')) toggleMobile(false);
    }
  });

  /* ---------- TOAST + COPY-TO-CLIPBOARD ---------- */
  const toast = document.getElementById('toast');
  let toastTimer = null;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  };
  const copyText = (text) => {
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  };

  // Email copy
  document.querySelectorAll('.contact-link[data-copy]').forEach(link => {
    link.addEventListener('click', (e) => {
      if (link.getAttribute('href').startsWith('mailto:')) {
        e.preventDefault();
        copyText(link.getAttribute('data-copy'))
          .then(() => showToast('Скопировано'))
          .catch(() => { window.location.href = link.getAttribute('href'); });
      }
    });
  });

  /* ---------- EASTER EGG MODAL ---------- */
  const eggTrigger = document.getElementById('egg-trigger');
  const eggModal = document.getElementById('egg-modal');
  const eggClose = document.getElementById('egg-close');
  const openEgg = () => { eggModal.classList.add('open'); syncModalScrollLock(); };
  const closeEgg = () => { eggModal.classList.remove('open'); syncModalScrollLock(); };
  eggTrigger.addEventListener('click', (e) => { e.stopPropagation(); openEgg(); });
  eggClose.addEventListener('click', closeEgg);
  eggModal.addEventListener('click', (e) => { if (e.target === eggModal) closeEgg(); });

  /* ---------- CASES PICKER MODAL ---------- */
  const casesModal = document.getElementById('cases-modal');
  const casesClose = document.getElementById('cases-close');
  const openCases = () => { casesModal.classList.add('open'); syncModalScrollLock(); };
  const closeCases = () => { casesModal.classList.remove('open'); syncModalScrollLock(); };
  // Intercept every #cases link (desktop nav + mobile menu)
  document.querySelectorAll('a[href="#cases"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // If user opened from mobile menu, close it first
      if (mobileMenu.classList.contains('open')) toggleMobile(false);
      openCases();
    });
  });
  // Case picks: close modal, then smooth scroll to the case section
  document.querySelectorAll('[data-case-pick]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      closeCases();
      if (target) {
        requestAnimationFrame(() => scrollToSection(target));
      }
    });
  });
  casesClose.addEventListener('click', closeCases);
  casesModal.addEventListener('click', (e) => { if (e.target === casesModal) closeCases(); });

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    if (link.getAttribute('href') === '#cases' || link.hasAttribute('data-case-pick')) return;
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const hash = link.getAttribute('href');
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      event.preventDefault();
      if (window.location.hash !== hash) {
        try { history.pushState(null, '', hash); } catch { /* Opaque local URLs may disallow history updates. */ }
      }
      scrollToSection(target);
    });
  });
  window.addEventListener('popstate', () => {
    const target = document.getElementById(window.location.hash.slice(1) || 'top');
    if (target) scrollToSection(target);
  });


  /* ---------- KONAMI CODE ---------- */
  (function() {
    const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    const normalizeKonamiKey = (e) => {
      if (e.key.startsWith('Arrow')) return e.key;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'b' || key === 'и' || e.code === 'KeyB') return 'b';
      if (key === 'a' || key === 'ф' || e.code === 'KeyA') return 'a';
      return key;
    };
    let pos = 0;
    document.addEventListener('keydown', (e) => {
      const expected = code[pos];
      const pressed = normalizeKonamiKey(e);
      if (pressed === expected) {
        pos++;
        if (pos === code.length) { launchFireworks(); pos = 0; }
      } else {
        pos = (pressed === code[0]) ? 1 : 0;
      }
    });

    function launchFireworks() {
      if (prefersReducedMotion || typeof Element.prototype.animate !== 'function') return;
      const colors = ['#3158c9', '#8aa6ff', '#F1F1EE', '#f4c430', '#6ab04c'];
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:500;overflow:hidden;';
      document.body.appendChild(container);

      const hint = document.createElement('div');
      hint.textContent = '⬆ UP UP DOWN DOWN ⬇';
      hint.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:JetBrains Mono,monospace;font-size:14px;letter-spacing:0.2em;color:#3158c9;background:rgba(16,18,22,0.88);padding:14px 24px;border:1px solid #3158c9;z-index:501;opacity:0;transition:opacity .3s ease;';
      container.appendChild(hint);
      requestAnimationFrame(() => { hint.style.opacity = '1'; });
      setTimeout(() => { hint.style.opacity = '0'; }, 1400);

      const origins = [
        { x: window.innerWidth * 0.25, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.5,  y: window.innerHeight * 0.4 },
        { x: window.innerWidth * 0.75, y: window.innerHeight * 0.55 }
      ];
      origins.forEach((origin, i) => {
        setTimeout(() => spawnBurst(container, origin, colors), i * 180);
      });
      setTimeout(() => container.remove(), 3500);
    }

    function spawnBurst(container, origin, colors) {
      const count = 36;
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const size = 4 + Math.floor(Math.random() * 5);
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `position:absolute;left:${origin.x}px;top:${origin.y}px;width:${size}px;height:${size}px;background:${color};will-change:transform,opacity;`;
        container.appendChild(p);
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const velocity = 180 + Math.random() * 220;
        const dx = Math.cos(angle) * velocity;
        const dy = Math.sin(angle) * velocity;
        const rotate = (Math.random() - 0.5) * 720;
        p.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 20}px) rotate(${rotate * 0.4}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx}px, ${dy + 200}px) rotate(${rotate}deg)`, opacity: 0 }
        ], {
          duration: 1600 + Math.random() * 600,
          easing: 'cubic-bezier(.2,.6,.3,1)',
          fill: 'forwards'
        });
      }
    }
  })();
