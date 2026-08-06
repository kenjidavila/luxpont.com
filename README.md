# Luxpont Strategy & Capital — luxpont.com

Sitio web corporativo de Luxpont Strategy & Capital, S.L.
Arquitectura corporativa internacional · Madrid, España.

Sitio **estático puro**: sin build, sin dependencias, sin framework. Se edita el
HTML/CSS/JS a mano y se publica con un `push`.

---

## Estructura del repositorio

```
luxpont.com/
│
├── index.html                    ← Landing en español (es-ES)
├── en/index.html                 ← Landing en inglés
├── fr/index.html                 ← Landing en francés
│
├── assets/
│   ├── css/site.css              ← Hoja de estilo única de todo el sitio
│   ├── js/
│   │   ├── particle-shapes.js    ← Nubes de puntos del hero (dato, ~8,5 MB)
│   │   ├── particles.js          ← Motor de partículas Canvas2D del hero
│   │   └── main.js               ← Nav, scroll pineado, formulario, cookies, i18n
│   ├── brand/                    ← Logo, favicons, apple-touch-icon
│   ├── redesign/img/             ← Imágenes editoriales en WebP + SVG del splash
│   └── pdf/                      ← Dossier corporativo ES / EN / FR
│
├── CNAME                         ← luxpont.com (dominio propio de GitHub Pages)
├── sitemap.xml                   ← Sitemap para buscadores y crawlers de IA
├── robots.txt                    ← Allowlist explícita de bots de IA
├── llms.txt                      ← Protocolo de descubrimiento para LLMs
├── favicon.ico
│
├── README.md                     ← Este archivo
└── CHANGELOG.md                  ← Registro de cambios
```

Los tres idiomas son **tres ficheros HTML completos y paralelos**, con la misma
estructura (14 capas `.pin-layer`). Cualquier cambio estructural debe aplicarse a
los tres en el mismo commit, o se desincronizan.

---

## Deploy

**GitHub Pages** publica automáticamente la rama `main` (raíz del repo) con el
build legacy — **no hay GitHub Actions ni workflow propio**; basta con `push` a
`main`. Delante hay **Cloudflare** como DNS y proxy.

```
push a main → GitHub Pages (build legacy) → proxy Cloudflare → luxpont.com
```

| Elemento | Valor real |
|---|---|
| Fuente de Pages | rama `main`, path `/` |
| Dominio | `luxpont.com` (fichero `CNAME`) + `www` |
| HTTPS | certificado GitHub, `Enforce HTTPS` activo |
| DNS | nameservers de Cloudflare (`alexandra` / `lamar`.ns.cloudflare.com) |
| IPs públicas | de Cloudflare (proxy activo), **no** las de GitHub Pages |

### Cabeceras servidas por Cloudflare (no están en el repo)

Cloudflare inyecta las cabeceras de seguridad — `Content-Security-Policy`,
`Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`,
`X-Content-Type-Options`. **La CSP es `script-src 'self'`**: por eso todo el
JavaScript está externalizado en `assets/js/` y no puede haber `<script>` inline
ni handlers `onclick=` en el HTML. Si se añade JS inline, la CSP lo bloquea en
producción aunque funcione en local.

Cloudflare también aplica **email obfuscation**: las direcciones de correo del
HTML se reescriben a `/cdn-cgi/l/email-protection` en la respuesta servida. Es
comportamiento esperado, no un error del repo.

### Comprobar que un cambio está realmente publicado

Los builds de Pages pueden **fallar y dejar producción en un commit anterior**
sin aviso visible. Tras cada push conviene verificar:

```bash
gh api repos/kenjidavila/luxpont.com/pages/builds \
  --jq '.[0] | "\(.created_at)  \(.status)  \(.commit[0:7])"'
```

`status` debe ser `built`, y el commit debe coincidir con el `HEAD` local.

---

## Cache-busting

Los assets se enlazan con un parámetro de versión: `site.css?v=13`,
`main.js?v=13`, etc. **Al modificar cualquier CSS o JS hay que subir ese número
en los tres HTML**, o los navegadores seguirán sirviendo la versión cacheada.
Cloudflare cachea el HTML con `max-age=600`.

---

## Actualización de contenido

### Cambiar una imagen
Las imágenes son ficheros reales en `assets/redesign/img/` (WebP), referenciadas
desde los tres HTML y desde `assets/css/site.css`. No hay base64 embebido.

### Actualizar un dossier PDF
Reemplazar el archivo en `assets/pdf/` manteniendo el mismo nombre. Los tres
idiomas, `llms.txt` y el `sitemap.xml` enlazan esas rutas.

### Actualizar el sitemap
Editar la fecha `<lastmod>` en `sitemap.xml` tras cada cambio relevante.

---

## Formulario de contacto

Activo sobre **Formspree**, endpoint definido en `assets/js/main.js`:

```js
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xqegodkr';
```

El botón de envío arranca deshabilitado y solo se habilita con nombre, email
válido y consentimiento RGPD marcado.

---

## Pendientes conocidos

- **`assets/og-image.jpg` no existe** y da 404. Está referenciada en `og:image`,
  `twitter:image` y en el `image` del Schema.org de los tres idiomas: las
  previsualizaciones al compartir el enlace salen sin imagen. Falta generar el
  fichero a 1200×630.
- **`assets/js/particle-shapes.js` pesa 8,5 MB** (2,85 MB comprimidos) y se
  descarga también en móvil, donde el hero cae a modo centrado. Es con diferencia
  el mayor coste de carga del sitio.
- **Las imágenes vivas no están optimizadas**: `perfil-grupo-familiar.webp` pesa
  9,3 MB y `madrid.webp` 5,3 MB.

---

## Contacto técnico

Para cuestiones relativas al sitio: questions@luxpont.com
