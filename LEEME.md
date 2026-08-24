# Balance — PWA instalable

Esta carpeta es una app web completa (HTML/CSS/JS, sin build, sin backend) que guarda
todo en IndexedDB, dentro del propio iPhone. Para poder "Agregar a pantalla de inicio"
con ícono propio y funcionamiento offline, necesita estar publicada en una URL con
HTTPS (Safari no permite instalar PWAs desde `file://` ni desde artifacts de claude.ai).

## Si ya tenías el repo creado (actualización)

1. Entrá a tu repo en github.com.
2. **Add file** → **Upload files**. Seleccioná **todos** los archivos de esta carpeta
   a la vez (los 10: `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`,
   `LEEME.md` y los 5 `icon-*.png`). No hace falta renombrar nada ni crear carpetas —
   todos van sueltos en la raíz del repo.
3. Confirmá con **Commit changes**. Verificá que la pantalla de confirmación dice
   "10 changed files" (o similar) antes de salir — si dice menos, algo no se
   seleccionó.
4. Esperá 1-2 minutos, cerrá la app del todo en tu iPhone (deslizala hacia arriba en
   el selector de apps) y volvela a abrir.

## Camino más corto desde cero, usando solo el iPhone: GitHub Pages

1. En Safari, andá a github.com y creá una cuenta gratuita si no tenés una.
2. Tocá "+" → "New repository". Nombre sugerido: `balance-app`. Que sea público. Creala.
3. Dentro del repo: **Add file** → **Upload files** y seleccioná **todos** los
   archivos de esta carpeta de una sola vez (los 10 archivos, sueltos, sin subcarpetas).
4. Confirmá el commit ("Commit changes").
5. Andá a la pestaña "Settings" del repo → "Pages" (menú lateral).
6. En "Source" elegí "Deploy from a branch", branch `main`, carpeta `/ (root)`. Guardá.
7. Esperá 1-2 minutos. GitHub te va a dar una URL del tipo:
   `https://TU-USUARIO.github.io/balance-app/`
8. Abrí esa URL en Safari (no en la app de GitHub, tiene que ser Safari).
9. Tocá el botón de compartir → "Agregar a pantalla de inicio".
10. Listo: vas a tener el ícono de Balance en tu pantalla de inicio, se abre a pantalla
    completa y funciona offline después de la primera carga.

## Si hacés un cambio y no se refleja en el iPhone

El service worker cachea los archivos para que la app funcione offline. Si actualizás
algo y no lo ves:
1. Confirmá en GitHub que el archivo realmente se subió (mirá el commit).
2. Subí también `sw.js` con un `CACHE` distinto (ya viene con `balance-v4`; la próxima
   vez que cambies algo, poné `balance-v5`, etc.) — eso fuerza a los dispositivos a
   bajar todo de nuevo.
3. Cerrá la app del todo (no solo minimizarla) y abrila de nuevo dos veces seguidas.
4. Si seguís sin verlo, decime la URL de tu GitHub Pages y reviso yo mismo qué quedó
   publicado.

Un solo archivo faltante entre los que lista `sw.js` (por ejemplo un ícono que no se
subió) puede hacer que el service worker nunca termine de instalarse y se quede
sirviendo la versión vieja para siempre — por eso importa subir los 10 archivos juntos.

## Alternativa

Cualquier hosting estático gratuito sirve igual (Netlify, Vercel, Cloudflare Pages,
Glitch). El requisito único es que sirva estos archivos tal cual, con `index.html` en
la raíz y HTTPS.

## Verificación de persistencia (hacela vos para confirmarlo)

1. Abrí la app, cargá el día de hoy (almuerzo, deporte, peso).
2. Cerrá Safari por completo (o la app desde la pantalla de inicio) y volvé a abrirla.
3. El dato debe seguir ahí: está en IndexedDB, en el dispositivo, no depende de ningún
   servidor ni de la sesión de Claude.
4. Probá también "Backup JSON" en Ajustes para verificar que se puede exportar.

## Notas

- Los datos de esta PWA y los del Artifact de Claude (`balance-app.jsx`) NO están
  conectados entre sí — son dos almacenamientos distintos. El formato del backup JSON
  es compatible entre ambos, así que podés exportar de uno e importar en el otro si
  querés migrar.

## Changelog

- **v7**: botón "Guardar día" al final del formulario, con confirmación visual (aunque
  la app ya guardaba todo automáticamente, ahora hay una señal clara de que quedó
  registrado). Dos gráficos nuevos en Evolución: minutos de actividad acumulados por
  semana y calorías quemadas acumuladas por semana, últimas 8 semanas.
- **v6**: la app ahora se actualiza sola. Antes, aplicar una versión nueva dependía
  de que el service worker del teléfono la detectara por su cuenta al reabrir, lo
  cual no era confiable (sobre todo en PWAs instaladas en iOS) y obligaba a cerrar y
  reabrir un número impredecible de veces. Ahora, al abrir la app, chequea
  activamente si hay una versión nueva publicada y, si la hay, se recarga sola una
  vez para aplicarla — ya no hace falta adivinar cuántas veces reabrir.
- **v5**: vista de calendario semana/mes, racha visible en Hoy, anillo triple
  (alimentación/deporte/fisio) en vez de uno solo, distribución de deportes en
  Evolución, registro de hidratación y sueño (cualitativos), registro opcional de
  dolor (zona/intensidad/comentario), perfil opcional (fecha de nacimiento y sexo)
  con referencia general de cintura por sexo en Evolución — informativa, no afecta
  el puntaje de adherencia ni es un diagnóstico. Los datos viejos se migran solos.
- **v4**: los íconos se movieron a la raíz del repo (antes iban en `icons/`, y si no
  se subían bien rompían la instalación del service worker para toda la app). El
  service worker ahora tolera archivos faltantes en vez de fallar por completo.
- **v3**: varios deportes por día (antes solo uno), metas informativas de peso/cintura
  (se muestran en Evolución, no afectan el puntaje de adherencia), chip explícito
  "Sin registrar" en almuerzo/cena, corrección de un bug de guardado (se perdía el
  registro de deporte si cerrabas la app rápido) y de un bug de la intensidad del
  deporte. Los datos viejos con el formato anterior se migran solos al abrir la app.
- **v2**: corrección de bugs de guardado.
- **v1**: versión inicial.
