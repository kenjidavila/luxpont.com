# Changelog — Luxpont Strategy & Capital

Todos los cambios relevantes del sitio se documentan aquí.
Formato: [versión] — fecha · descripción

---

## [3.2.1] — 2026-08-06

### Corregido
- `<meta name="description">` estaba duplicado en los tres idiomas; se conserva
  uno solo por página
- `gitignore` no llevaba punto inicial, así que git no lo aplicaba →
  renombrado a `.gitignore`
- `sitemap.xml` seguía declarando `lastmod` de 2026-04-09 en las seis URLs

### Eliminado
- Assets versionados que ningún HTML, CSS ni JS referenciaba (~128 MB):
  `assets/redesign/video/hero.mp4` (95 MB, resto del hero en vídeo sustituido
  en 2026-08-01), las tres variantes de `hero-atrio-4k` (PNG/JPG/WebP, 16 MB),
  `about.webp`, `intro-luxpont.svg`, `assets/pdf/placerholder.txt`, y la copia
  en la raíz de `Luxpont_Dossier_EN.pdf` (versión de 14 páginas de mayo,
  superada por la de 8 páginas en `assets/pdf/`)
- Rama `redesign/hero-claro` y su worktree local: no contenía ningún commit que
  no estuviera ya en `main`

### Modificado
- README reescrito contra la infraestructura real: GitHub Pages con build legacy
  sobre `main` (no hay workflow de Actions), Cloudflare como DNS y proxy,
  cabeceras de seguridad y CSP inyectadas por Cloudflare, cache-busting `?v=N`,
  Formspree ya activo, y los pendientes conocidos

---

## [3.2.0] — 2026-08-06

### Modificado
- Cobertura pasa de tabla a lista editorial, con titulares en marino sólido
- Nav: anclas calculadas sobre la geometría real de las capas; menú móvil a
  pantalla completa

### Corregido
- Suelo de legibilidad de 10px en toda la micro-tipografía y áreas táctiles de
  44px

---

## [3.1.0] — 2026-08-04 · 2026-08-05

### Añadido
- Intro splash con el lockup dorado y disolución lenta, sin bloquear el scroll
- Zona de reposo por sección en el scroll pineado, para que deje de ser
  demasiado sensible

### Modificado
- Sistema tipográfico definitivo: Cormorant Garamond (titulares) + DM Sans
  (cuerpo y UI) + DM Mono, tras pasar por Source Serif 4 y Bodoni Moda
- Método se divide en manifiesto + método; secciones editoriales oscuras;
  imágenes editoriales cuadradas
- Hero H1 con techo de 64px

### Corregido
- Mojibake (UTF-8 doblemente codificado) en las versiones EN y FR
- Encuadre de la foto GBP para que la Union Jack siga visible

---

## [3.0.0] — 2026-08-02

### Añadido
- La página entera como una sola secuencia fija de 12 diapositivas, sin scroll
  percibido
- Hero de partículas en Canvas2D: Coliseo y Metrópolis replicados punto a punto
  contra su imagen de referencia, renderizados sobre un búfer de píxeles para
  sostener 60fps a densidad completa

### Modificado
- Tema claro definitivo: paleta marfil / marino / oro
- CSS embebido y duplicado extraído a `assets/css/site.css`

---

## [2.1.0] — 2026-07-24 · 2026-07-25

### Añadido
- Sitio realmente trilingüe (ES / EN / FR) y favicon completo

### Modificado
- Logo sustituido por el monograma oficial
- Todo el JavaScript inline externalizado a `assets/js/`, requisito para poder
  endurecer la CSP
- Layout a pantalla partida con imagen a sangre en Sobre Luxpont, Cuenta GBP y
  Cobertura

### Corregido
- Scrim de legibilidad en el hero y refuerzo de contraste hasta WCAG AA

---

## [2.0.0] — 2026-07-23

### Modificado
- Rediseño completo de la home bajo la doctrina CBCA (Cross Border Capital
  Architecture)

---

## [1.0.0] — 2026-04-09

### Lanzamiento inicial
- Landing page completa en español (España)
- 7 servicios con galería horizontal y tarjetas individuales
- 3 mandatos representativos
- Sección SPV con hero image (Porsche 911, París)
- Sección Ubicación Estratégica (Four Seasons / Canalejas, Madrid)
- Formulario de contacto (Formspree, pendiente de activar)
- Cookie banner RGPD compliant
- Modal de Política de Privacidad
- Descarga de dossier corporativo en ES / EN / FR
- Schema.org: LegalService + FAQPage
- robots.txt con permisos explícitos para AI crawlers
- llms.txt para descubrimiento por LLMs
- Sitemap XML
