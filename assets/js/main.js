// ── NAV SCROLL STATE + PINNED SLIDE SEQUENCE (single rAF loop) ───────────────
// The whole page, from the hero through the contact form, lives inside one
// #hero-track: a single sticky .pin-wrapper holds every section as a full
// .pin-layer stacked on top of the others. Scrolling through the track
// crossfades one layer into the next in the exact same screen position —
// nothing slides up from below, so no scroll is perceived. The track's
// height (set in CSS) divided by (layer count - 1) is what paces each
// transition; this loop only needs to know how many layers there are.
const nav = document.getElementById('nav');
const heroTrack = document.getElementById('hero-track');
const pinWrapper = document.querySelector('.pin-wrapper');
const pinLayers = pinWrapper ? Array.from(pinWrapper.querySelectorAll('.pin-layer')) : [];
const heroWhiteout = document.querySelector('.hero-whiteout');
const scrollHint = document.getElementById('heroScrollHint');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── INTRO SPLASH ────────────────────────────────────────────────────────────
// The brand lockup covers the viewport on entry (CSS animates it in, holds,
// then fades out). Once the fade-out keyframe ends we pull the overlay out of
// the layout so it can never trap clicks. A timeout backs it up in case the
// animationend never fires (e.g. reduced-motion collapses the timings).
(function initIntroSplash(){
  const splash = document.getElementById('intro-splash');
  if (!splash) return;
  const remove = () => { splash.style.display = 'none'; };
  splash.addEventListener('animationend', (e) => {
    if (e.target === splash && e.animationName === 'introSplashOut') remove();
  });
  setTimeout(remove, 6000); // fallback only — must outlast the slow fade-out so it never cuts it short
})();

let ticking = false;
function onScroll(){
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY || 0;

    // Only runs when the wrapper is actually pinned (desktop, motion
    // allowed) — on mobile / reduced-motion the CSS un-pins everything into
    // normal flow and this is skipped so it doesn't fight the resulting
    // static layout with stale inline styles.
    const pinned = pinWrapper && getComputedStyle(pinWrapper).position === 'sticky';
    if (heroTrack && pinned && !reduceMotion && pinLayers.length > 1) {
      const trackRect = heroTrack.getBoundingClientRect();
      const total = Math.max(1, heroTrack.offsetHeight - window.innerHeight);
      const scrolled = -trackRect.top;
      const overall = Math.max(0, Math.min(1, scrolled / total));

      const n = pinLayers.length;
      const floatIndex = overall * (n - 1);
      const baseIdx = Math.min(n - 2, Math.floor(floatIndex));
      const frac = Math.max(0, Math.min(1, floatIndex - baseIdx));

      // Give every section a "dwell" zone: it stays fully on screen for the
      // first DWELL of its scroll window, and the crossfade to the next
      // section is compressed (and smoothstepped) into the remaining tail.
      // Without this the layers crossfade continuously, so any scroll position
      // sits permanently mid-transition and it's impossible to land squarely on
      // a section — which read as the scroll being "too sensitive".
      const DWELL = 0.62;
      let t = frac <= DWELL ? 0 : (frac - DWELL) / (1 - DWELL);
      t = t * t * (3 - 2 * t); // smoothstep for a soft in/out on the crossfade

      pinLayers.forEach((layer, i) => {
        let opacity = 0;
        let transform = 'none';
        if (i === baseIdx) {
          opacity = 1 - t;
        } else if (i === baseIdx + 1) {
          opacity = t;
          transform = `translateY(${(1 - t) * 18}px) scale(${0.985 + t * 0.015})`;
        }
        if (i === n - 1 && baseIdx === n - 2 && frac >= 0.999) opacity = 1;
        layer.style.opacity = String(opacity);
        layer.style.transform = transform;
        layer.classList.toggle('in-view', opacity > 0.5);
      });

      // Hero-specific whiteout rides on its own outgoing fade (layer 0 -> 1);
      // once we've moved past that first transition the particle canvas
      // stays fully whitened underneath whichever layer is currently showing.
      if (baseIdx === 0) {
        if (heroWhiteout) heroWhiteout.style.opacity = String(t);
      } else {
        if (heroWhiteout) heroWhiteout.style.opacity = '1';
      }
    } else {
      pinLayers.forEach((layer) => {
        layer.style.opacity = '';
        layer.style.transform = '';
        layer.classList.remove('in-view');
      });
      if (heroWhiteout) heroWhiteout.style.opacity = '';
    }

    // Nav only turns solid once the track has mostly scrolled past, so it
    // never cuts a bar across a photo slide while the sequence is pinned.
    const navThreshold = heroTrack ? Math.max(80, heroTrack.offsetHeight - 120) : 80;
    nav.classList.toggle('scrolled', y > navThreshold);

    if (scrollHint) scrollHint.style.opacity = Math.max(0, 1 - y / 260);
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

// ── ANCLAS DE NAVEGACIÓN ────────────────────────────────────────────────────
// Los enlaces del nav (#metodo, #contacto…) apuntan a divs .pin-anchor de 1px
// dentro del track. Su posición NO puede escribirse a mano: depende de si la
// secuencia está pineada —y entonces del recorrido del track, que se mide en
// alturas de ventana— o de si el CSS la ha soltado a flujo normal (móvil y
// reduced-motion), donde cada capa ocupa su altura real de contenido. Las
// posiciones fijas en vh que había antes solo cuadraban en una ventana
// concreta: en móvil mandaban al usuario a espacio vacío, y la última ancla
// caía más allá del final del track, así que "Contacto" aterrizaba en el hueco
// entre la última diapositiva y el pie. Aquí se recalculan contra la geometría
// real cada vez que cambia.
const pinAnchors = Array.from(document.querySelectorAll('.pin-anchor[data-layer]'));
function placeAnchors(){
  if (!heroTrack || !pinWrapper || pinLayers.length < 2 || !pinAnchors.length) return;
  const pinned = getComputedStyle(pinWrapper).position === 'sticky' && !reduceMotion;
  const n = pinLayers.length;
  // Recorrido que consume la secuencia pineada: el mismo denominador que usa
  // onScroll() para repartir las capas, así que la capa i queda exactamente
  // centrada (frac = 0 → opacidad 1) al aterrizar en i * paso.
  const span = Math.max(1, heroTrack.offsetHeight - window.innerHeight);
  const trackTop = heroTrack.getBoundingClientRect().top + window.scrollY;
  pinAnchors.forEach(a => {
    const i = Math.min(n - 1, Math.max(0, parseInt(a.dataset.layer, 10) || 0));
    const top = pinned
      ? Math.round(i * span / (n - 1))
      : Math.round(pinLayers[i].getBoundingClientRect().top + window.scrollY - trackTop);
    a.style.top = top + 'px';
  });
}

// Un hash de entrada (luxpont.com/#contacto) lo resuelve el navegador antes de
// que este script coloque las anclas, así que hay que repetir el salto —sin
// animación— una vez la geometría es correcta.
function honourHash(){
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el || !el.classList.contains('pin-anchor')) return;
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  el.scrollIntoView();
  root.style.scrollBehavior = prev;
  onScroll();
}

placeAnchors();
honourHash();
window.addEventListener('load', () => { placeAnchors(); honourHash(); });
window.addEventListener('resize', placeAnchors);
// Las imágenes lazy cambian la altura real de las capas cuando el layout está
// en flujo (móvil), y con ella la posición correcta de cada ancla.
if (window.ResizeObserver) new ResizeObserver(placeAnchors).observe(pinWrapper || document.body);

// ── REVEAL ON SCROLL — fades in AND out as content crosses the viewport ──────
// Symmetric top/bottom margin so each element fades in a touch before it
// reaches the edge and fades out a touch before it fully leaves, instead of
// popping in/out right at the viewport boundary. IntersectionObserver only
// (no scroll listener) so this stays off the main thread while scrolling.
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => e.target.classList.toggle('in', e.isIntersecting));
}, { threshold: 0.12, rootMargin: '-8% 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// ── GALLERY ARROW CONTROLS ───────────────────────────────────────────────────
document.querySelectorAll('[data-gallery]').forEach(navEl => {
  const key = navEl.getAttribute('data-gallery');
  const track = document.querySelector('[data-gallery-track="' + key + '"]');
  if (!track) return;
  navEl.querySelectorAll('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = track.querySelector('.card, .pregunta-chip');
      const step = card ? card.getBoundingClientRect().width + 20 : 340;
      track.scrollBy({ left: btn.getAttribute('data-scroll') === 'next' ? step : -step, behavior: 'smooth' });
    });
  });
});

// ── MOBILE NAV ────────────────────────────────────────────────────────────────
const navBurger = document.getElementById('navBurger');
const navMobile = document.getElementById('nav-mobile');
const navMobileClose = document.getElementById('navMobileClose');
function openMobileNav(){
  navMobile.classList.add('open');
  navMobile.setAttribute('aria-hidden', 'false');
  navBurger.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}
function closeMobileNav(){
  navMobile.classList.remove('open');
  navMobile.setAttribute('aria-hidden', 'true');
  navBurger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
navBurger.addEventListener('click', openMobileNav);
navMobileClose.addEventListener('click', closeMobileNav);
document.querySelectorAll('[data-nav-mobile-link]').forEach(a => a.addEventListener('click', closeMobileNav));
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileNav(); });

// ── LANGUAGE BANNER DISMISS ───────────────────────────────────────────────────
function dismissLangBanner(){
  const banner = document.getElementById('lang-banner');
  if (banner) banner.classList.remove('visible');
  document.body.classList.remove('lang-banner-active');
  sessionStorage.setItem('lux_lang_dismissed', '1');
}
const langBannerClose = document.querySelector('.lang-banner-close');
if (langBannerClose) langBannerClose.addEventListener('click', dismissLangBanner);

// ── PRIVACY MODAL ─────────────────────────────────────────────────────────────
function openPrivacy(){ document.getElementById('privacyModal').style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closePrivacy(){ document.getElementById('privacyModal').style.display = 'none'; document.body.style.overflow = ''; }
document.getElementById('privacyModal').addEventListener('click', function(e){ if (e.target === this) closePrivacy(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePrivacy(); });
document.querySelectorAll('.js-open-privacy').forEach(el => el.addEventListener('click', function(e){ e.preventDefault(); openPrivacy(); }));
document.querySelectorAll('.js-close-privacy').forEach(el => el.addEventListener('click', closePrivacy));

// ── COOKIES ───────────────────────────────────────────────────────────────────
const COOKIE_KEY = 'lux_cookie_consent';
function setCookie(name,val,days){
  const d = new Date(); d.setTime(d.getTime() + (days*86400000));
  document.cookie = `${name}=${val};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}
function getCookie(name){
  const v = document.cookie.match('(^|;)\\s*'+name+'\\s*=\\s*([^;]+)');
  return v ? v.pop() : '';
}
function acceptCookies(){ setCookie(COOKIE_KEY,'accepted',365); hideCookieBanner(); }
function rejectCookies(){ setCookie(COOKIE_KEY,'rejected',30); hideCookieBanner(); }
function hideCookieBanner(){
  const b = document.getElementById('cookie-banner');
  if (b) { b.classList.remove('visible'); setTimeout(() => b.style.display = 'none', 400); }
}
const btnCookieReject = document.querySelector('.btn-cookie-reject');
const btnCookieAccept = document.querySelector('.btn-cookie-accept');
if (btnCookieReject) btnCookieReject.addEventListener('click', rejectCookies);
if (btnCookieAccept) btnCookieAccept.addEventListener('click', acceptCookies);
(function(){
  if (!getCookie(COOKIE_KEY)) {
    const b = document.getElementById('cookie-banner');
    if (b) { b.style.display = 'flex'; setTimeout(() => b.classList.add('visible'), 200); }
  }
})();

// ── CONTACT FORM ──────────────────────────────────────────────────────────────
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xqegodkr';
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  const btnTextEl = document.getElementById('btn-text');
  const idleLabel = btnTextEl ? btnTextEl.textContent : '';
  const submitBtn = document.getElementById('submit-btn');
  const nameEl = contactForm.querySelector('[name="name"]');
  const emailEl = contactForm.querySelector('[name="email"]');
  const gdprEl = document.getElementById('f-gdpr');

  // The button stays muted (disabled) until name + a plausible email are
  // filled and consent is ticked — only then does it snap to its real colour.
  function refreshReady(){
    const nameOk = nameEl && nameEl.value.trim().length > 1;
    const emailOk = emailEl && /.+@.+\..+/.test(emailEl.value.trim());
    const consentOk = gdprEl && gdprEl.checked;
    if (submitBtn) submitBtn.disabled = !(nameOk && emailOk && consentOk);
  }
  contactForm.addEventListener('input', refreshReady);
  contactForm.addEventListener('change', refreshReady);
  refreshReady();

  contactForm.addEventListener('submit', async function(e){
    e.preventDefault();
    if (submitBtn && submitBtn.disabled) return;
    const btnText = document.getElementById('btn-text');
    const successMsg = document.getElementById('form-success');
    const errorMsg = document.getElementById('form-error');

    submitBtn.disabled = true;
    btnText.textContent = submitBtn.dataset.sending || idleLabel;

    const formData = new FormData(contactForm);

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST', body: formData, headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        contactForm.reset();
        successMsg.style.display = 'block';
        errorMsg.style.display = 'none';
        btnText.textContent = submitBtn.dataset.sent || idleLabel;
      } else {
        throw new Error('Server error');
      }
    } catch (err) {
      errorMsg.style.display = 'block';
      successMsg.style.display = 'none';
      btnText.textContent = idleLabel;
      refreshReady();
    }
  });
}

// ── LANGUAGE DETECTION BANNER ────────────────────────────────────────────────
// Offers the visitor's browser-preferred language when it differs from the
// language of the page they landed on. Works the same on all three sites
// (ES/EN/FR) since it always excludes the current page's own language.
(function detectLanguage(){
  const DISMISS_KEY = 'lux_lang_dismissed';
  if (sessionStorage.getItem(DISMISS_KEY)) return;

  const currentLang = (document.documentElement.lang || 'es').split('-')[0];

  const lang = (navigator.language || navigator.userLanguage || 'es').toLowerCase();
  const primary = lang.split('-')[0];
  const region = lang.split('-')[1] || '';

  const banner = document.getElementById('lang-banner');
  const text = document.getElementById('lang-banner-text');
  const btn = document.getElementById('lang-banner-btn');
  if (!banner || !text || !btn) return;

  const frRegions = ['fr','be','ch','ca','lu','mc','sn','ci','cm','ml','bf','ne','tg','bj','ga','cg','cd','mg','rw','bi','dj','km','sc','ht','gp','mq','gf','re','yt','nc','pf','wf','pm','mf','bl'];
  const enRegions = ['us','gb','au','ca','nz','ie','za','sg','ng','gh','ke','ug','tz','zm','zw','bw','na','mw','rw','ss','sd','et','ph','jm','tt','bb','bs','ag','lc','vc','kn','gd','dm','bz','gy','sl','lr','gm','ls','sz','mz','pw','fj','pg','sb','to','tv','ki','ws','vu'];
  const esRegions = ['mx','ar','co','pe','ve','cl','ec','gt','cu','bo','do','hn','py','sv','ni','cr','pa','uy','gq'];

  let showLang = null;
  if (primary === 'fr' || frRegions.includes(region)) showLang = 'fr';
  else if (primary === 'en' || enRegions.includes(region)) showLang = 'en';
  else if (primary === 'es' || esRegions.includes(region)) showLang = 'es';
  if (!showLang || showLang === currentLang) return;

  const copy = {
    es: { text: 'Este sitio está disponible en español.', label: 'Ver en español', href: 'https://luxpont.com/' },
    en: { text: 'This site is available in English.', label: 'View in English', href: 'https://luxpont.com/en/' },
    fr: { text: 'Ce site est disponible en français.', label: 'Voir en français', href: 'https://luxpont.com/fr/' }
  }[showLang];

  text.textContent = copy.text;
  btn.textContent = copy.label;
  btn.href = copy.href;
  btn.setAttribute('hreflang', showLang);
  banner.classList.add('visible');
  document.body.classList.add('lang-banner-active');
})();
