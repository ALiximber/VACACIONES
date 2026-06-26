# Publicar actualizaciones

La aplicación usa Electron Forge, Squirrel.Windows y GitHub Releases. El
actualizador solo se ejecuta en la aplicación instalada; no se ejecuta con
`npm start`.

## Primera instalación

Genera y publica la primera versión siguiendo el flujo de abajo. En cada equipo,
descarga y ejecuta una vez el archivo `Setup.exe` de la Release publicada. A
partir de esa instalación, las versiones siguientes se descargarán
automáticamente.

## Publicar una versión nueva

1. Confirma que los cambios estén listos y ejecuta las pruebas:

   ```powershell
   npm test
   ```

2. Aumenta la versión. Para una actualización normal:

   ```powershell
   npm version patch
   ```

   Esto cambia, por ejemplo, `1.0.0` a `1.0.1`, crea un commit y una etiqueta de
   Git.

3. Envía el commit y la etiqueta:

   ```powershell
   git push origin main --follow-tags
   ```

4. Crea un token de GitHub con permiso para escribir el contenido del
   repositorio y úsalo solo durante la publicación:

   ```powershell
   $env:GITHUB_TOKEN = 'TU_TOKEN'
   npm run publish
   Remove-Item Env:GITHUB_TOKEN
   ```

5. Abre `https://github.com/ALiximber/VACACIONES/releases`. Electron Forge deja
   la Release como borrador. Revisa sus archivos y pulsa **Publish release**.

No guardes el token en `package.json`, `forge.config.js`, `.env` ni en otro
archivo del proyecto.

## Qué recibe el usuario

Al abrir la aplicación instalada, esta consulta GitHub. Si hay una versión
publicada más reciente, la descarga en segundo plano. Cuando termina, muestra
un diálogo para reiniciar e instalarla.

Las Releases en borrador y las versiones con el mismo número que la aplicación
instalada no se distribuyen.
