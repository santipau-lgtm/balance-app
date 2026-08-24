# Balance — PWA instalable

Esta carpeta es una app web completa (HTML/CSS/JS, sin build, sin backend) que guarda
todo en IndexedDB, dentro del propio iPhone. Para poder "Agregar a pantalla de inicio"
con ícono propio y funcionamiento offline, necesita estar publicada en una URL con
HTTPS (Safari no permite instalar PWAs desde `file://` ni desde artifacts de claude.ai).

## Camino más corto usando solo el iPhone: GitHub Pages

1. En Safari, andá a github.com y creá una cuenta gratuita si no tenés una.
2. Tocá "+" → "New repository". Nombre sugerido: `balance-app`. Que sea público. Creala.
3. Dentro del repo: "Add file" → "Upload files" (podés seleccionar varios archivos
   de esta carpeta a la vez desde el selector de archivos de iOS: `index.html`,
   `styles.css`, `app.js`, `manifest.json`, `sw.js`, `LEEME.md`).
4. Repetí "Add file" → "Create new file" para la carpeta `icons/`: escribí como nombre
   `icons/icon-180.png` y usá "Upload files" apuntando a esa ruta, o subí los 5 archivos
   de `icons/` arrastrándolos al selector — GitHub respeta la subcarpeta si el nombre
   del archivo incluye `icons/` delante.
5. Confirmá el commit ("Commit changes").
6. Andá a la pestaña "Settings" del repo → "Pages" (menú lateral).
7. En "Source" elegí "Deploy from a branch", branch `main`, carpeta `/ (root)`. Guardá.
8. Esperá 1-2 minutos. GitHub te va a dar una URL del tipo:
   `https://TU-USUARIO.github.io/balance-app/`
9. Abrí esa URL en Safari (no en la app de GitHub, tiene que ser Safari).
10. Tocá el botón de compartir → "Agregar a pantalla de inicio".
11. Listo: vas a tener el ícono de Balance en tu pantalla de inicio, se abre a pantalla
    completa y funciona offline después de la primera carga.

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
- Si en algún momento cambiás `app.js` o `styles.css`, actualizá `CACHE` en `sw.js`
  (por ejemplo `balance-v4`) para forzar a los dispositivos a bajar la versión nueva.

## Changelog

- **v3**: varios deportes por día (antes solo uno), metas informativas de peso/cintura
  (se muestran en Evolución, no afectan el puntaje de adherencia), chip explícito
  "Sin registrar" en almuerzo/cena, corrección de un bug de guardado (se perdía el
  registro de deporte si cerrabas la app rápido) y de un bug de la intensidad del
  deporte. Los datos viejos con el formato anterior se migran solos al abrir la app,
  no hace falta hacer nada manual.
- **v2**: corrección de bugs de guardado.
- **v1**: versión inicial.
