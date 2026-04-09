# Luxpont Strategy & Capital — luxpont.com

Sitio web corporativo de Luxpont Strategy & Capital, S.L.  
Arquitectura corporativa internacional · Madrid, España.

---

## Estructura del repositorio

```
luxpont.com/
│
├── index.html                    ← Landing principal (autocontenido)
├── sitemap.xml                   ← Sitemap para Google y AI crawlers
├── robots.txt                    ← Permisos para buscadores y LLMs
├── llms.txt                      ← Protocolo de descubrimiento para IA
│
├── assets/
│   ├── pdf/
│   │   ├── Luxpont_Dossier_ES.pdf
│   │   ├── Luxpont_Dossier_EN.pdf
│   │   └── Luxpont_Dossier_FR.pdf
│   └── og-image.jpg              ← Imagen 1200×630 para compartir en redes
│
├── .github/
│   └── workflows/
│       └── deploy.yml            ← CI/CD — deploy automático al hacer push a main
│
├── README.md                     ← Este archivo
└── CHANGELOG.md                  ← Registro de cambios
```

---

## Deploy

El sitio se publica automáticamente en GitHub Pages al hacer `push` a la rama `main`.

**URL de producción:** https://luxpont.com  
**URL temporal GitHub Pages:** https://[usuario].github.io/luxpont.com

### Configuración inicial (solo primera vez)

1. Ir a **Settings → Pages**
2. Source: `GitHub Actions`
3. Custom domain: `luxpont.com`
4. Marcar ✅ **Enforce HTTPS**

---

## Activación del formulario de contacto

El formulario usa [Formspree](https://formspree.io). Para activarlo:

1. Crear cuenta en formspree.io con `questions@luxpont.com`
2. New Form → copiar el ID (ej: `xpzgkwab`)
3. En `index.html`, buscar `FORMSPREE_ID`
4. Reemplazar por el ID real: `https://formspree.io/f/xpzgkwab`
5. Hacer commit y push — el deploy se ejecuta automáticamente

---

## Actualización de contenido

### Cambiar una imagen
Las imágenes están embebidas en base64 dentro de `index.html`.  
Para reemplazar una imagen, editar el valor base64 del bloque CSS correspondiente.

### Actualizar un dossier PDF
Reemplazar el archivo en `assets/pdf/` manteniendo el mismo nombre de fichero.

### Actualizar el sitemap
Editar la fecha `<lastmod>` en `sitemap.xml` tras cada actualización relevante.

---

## DNS en Arys (configuración requerida)

| Tipo  | Nombre | Valor                   | TTL  |
|-------|--------|-------------------------|------|
| A     | @      | 185.199.108.153         | 3600 |
| A     | @      | 185.199.109.153         | 3600 |
| A     | @      | 185.199.110.153         | 3600 |
| A     | @      | 185.199.111.153         | 3600 |
| CNAME | www    | [usuario].github.io     | 3600 |

La propagación DNS tarda entre 15 minutos y 48 horas.  
Una vez activo, GitHub emite el certificado SSL automáticamente (Let's Encrypt).

---

## Contacto técnico

Para cuestiones relativas al sitio: questions@luxpont.com
