// ── NAV SCROLL STATE + HERO/FIRMA CROSSFADE + METODO SCROLL-REVEAL (single rAF loop) ─
const nav = document.getElementById('nav');
const heroTrack = document.getElementById('hero-track');
const pinWrapper = document.querySelector('.pin-wrapper');
const heroWhiteout = document.querySelector('.hero-whiteout');
const heroBgImg = document.querySelector('.hero-bg img');
const heroContentEl = document.querySelector('.hero-content');
const firmaPanel = document.getElementById('firma-panel');
const scrollHint = document.getElementById('heroScrollHint');
const preguntasTrack = document.getElementById('preguntasTrack');
const preguntasItems = preguntasTrack ? Array.from(preguntasTrack.querySelectorAll('.pregunta-item')) : [];
const preguntasDots = preguntasTrack ? Array.from(preguntasTrack.querySelectorAll('.dot')) : [];
const preguntasProgress = document.getElementById('preguntasProgress');
const preguntasSticky = preguntasTrack ? preguntasTrack.querySelector('.preguntas-sticky') : null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let ticking = false;
function onScroll(){
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY || 0;

    // Hero -> Firma pinned crossfade — #hero and #firma-panel are two full
    // layers stacked on top of each other inside one sticky viewport-height
    // wrapper. First half of the track: the hero photo whites out. Second
    // half: the hero content fades out while the Firma panel fades in, in
    // the exact same screen position, so it materializes instead of
    // scrolling up from below. Only runs when the wrapper is actually
    // pinned (desktop, motion allowed) — on mobile / reduced-motion the
    // CSS un-pins everything into normal flow and this is skipped so it
    // doesn't fight the resulting static layout with stale inline styles.
    const pinned = pinWrapper && getComputedStyle(pinWrapper).position === 'sticky';
    if (heroTrack && pinned && !reduceMotion) {
      const trackRect = heroTrack.getBoundingClientRect();
      const total = Math.max(1, heroTrack.offsetHeight - window.innerHeight);
      const scrolled = -trackRect.top;
      const overall = Math.max(0, Math.min(1, scrolled / total));

      const pWhite = Math.max(0, Math.min(1, overall / 0.5));
      if (heroWhiteout) heroWhiteout.style.opacity = pWhite;
      if (heroBgImg) heroBgImg.style.filter = `brightness(${1 + pWhite * 0.3}) blur(${pWhite * 3}px)`;

      const pFirma = Math.max(0, Math.min(1, (overall - 0.5) / 0.5));
      if (heroContentEl) heroContentEl.style.opacity = String(1 - pFirma);
      if (firmaPanel) {
        firmaPanel.style.opacity = String(pFirma);
        firmaPanel.style.transform = `translateY(${(1 - pFirma) * 18}px) scale(${0.985 + pFirma * 0.015})`;
        firmaPanel.classList.toggle('in-view', pFirma > 0.5);
      }
    } else {
      if (heroWhiteout) heroWhiteout.style.opacity = '';
      if (heroBgImg) heroBgImg.style.filter = '';
      if (heroContentEl) heroContentEl.style.opacity = '';
      if (firmaPanel) { firmaPanel.style.opacity = ''; firmaPanel.style.transform = ''; firmaPanel.classList.remove('in-view'); }
    }

    // Nav only turns solid once the hero track has mostly scrolled past, so
    // it never cuts a bar across the hero image while the hero is pinned.
    const navThreshold = heroTrack ? Math.max(80, heroTrack.offsetHeight - 120) : 80;
    nav.classList.toggle('scrolled', y > navThreshold);

    if (scrollHint) scrollHint.style.opacity = Math.max(0, 1 - y / 260);

    // Método CBCA — interactive question reveal
    if (preguntasTrack && preguntasSticky && !reduceMotion) {
      const trackRect = preguntasTrack.getBoundingClientRect();
      const stickyH = preguntasSticky.offsetHeight;
      const total = Math.max(1, preguntasTrack.offsetHeight - stickyH);
      const scrolled = -trackRect.top;
      const qp = Math.max(0, Math.min(1, scrolled / total));
      const idx = Math.min(preguntasItems.length - 1, Math.floor(qp * preguntasItems.length));
      preguntasItems.forEach((el, i) => el.classList.toggle('active', i === idx));
      preguntasDots.forEach((el, i) => el.classList.toggle('active', i === idx));
      if (preguntasProgress) preguntasProgress.textContent = String(idx + 1).padStart(2,'0') + ' / 06';
    }
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

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
      const card = track.querySelector('.card');
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

  contactForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const gdpr = document.getElementById('f-gdpr');
    if (!gdpr || !gdpr.checked) {
      alert(contactForm.dataset.gdprAlert || idleLabel);
      return;
    }
    const btn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const btnArrow = document.getElementById('btn-arrow');
    const successMsg = document.getElementById('form-success');
    const errorMsg = document.getElementById('form-error');

    btn.disabled = true;
    btnText.textContent = btn.dataset.sending || idleLabel;
    btnArrow.style.display = 'none';

    const formData = new FormData(contactForm);

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST', body: formData, headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        contactForm.reset();
        successMsg.style.display = 'block';
        errorMsg.style.display = 'none';
        btnText.textContent = btn.dataset.sent || idleLabel;
      } else {
        throw new Error('Server error');
      }
    } catch (err) {
      errorMsg.style.display = 'block';
      successMsg.style.display = 'none';
      btnText.textContent = idleLabel;
      btnArrow.style.display = 'inline';
      btn.disabled = false;
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
