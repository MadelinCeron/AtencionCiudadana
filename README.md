# Portal de Atención Ciudadana

Proyecto académico correspondiente a las **Series I y II**. Permite registrar problemas de la comunidad y consultarlos desde un panel municipal protegido con una clave.

## Enlaces

- GitHub: https://github.com/MadelinCeron/AtencionCiudadana
- Render: pendiente de configurar.

## Funcionalidades

- Registro de categoría, ubicación, descripción y fotografía.
- Categorías: Alumbrado, Calles, Limpieza, Agua y Otro.
- Compresión de fotografías a JPEG desde el navegador.
- Guardado persistente en Cloud Firestore y código de confirmación por reporte.
- Panel municipal con fotografía, descripción original, fecha y código.
- Consulta de diez reportes por página, ordenados del más reciente al más antiguo.
- Validación del formulario y del backend.

## Tecnologías

- HTML, CSS y JavaScript en el navegador.
- Node.js 22 o superior y su servidor HTTP integrado.
- Firebase Admin SDK.
- Cloud Firestore Standard, base `(default)`.

La aplicación utiliza Firestore para los datos y las fotos en base64. No utiliza Cloud Storage ni requiere habilitarlo. Mantener el proyecto en el plan Spark, sin activar facturación.

## Requisitos

- Node.js 22 o superior con npm.
- Acceso a Internet para instalar dependencias y conectar con Firestore.
- Proyecto de Firebase con Firestore Standard creado en modo producción.
- Archivo JSON de una cuenta de servicio, guardado fuera de la carpeta del proyecto.

## Configuración del entorno

La configuración local se guarda en `.env`, que no se publica. Si ya existe en tu equipo, conserva ese archivo.

Para una instalación nueva, copia la plantilla solamente si todavía no existe `.env`:

```powershell
Copy-Item .env.example .env
```

Configura estas variables en `.env`:

```dotenv
FIREBASE_PROJECT_ID=tu-proyecto
GOOGLE_APPLICATION_CREDENTIALS="C:/ruta/privada/cuenta-de-servicio.json"
ADMIN_KEY=REEMPLAZAR_POR_UNA_CLAVE_PRIVADA
PORT=3000
```

La ruta del ejemplo debe reemplazarse por la ruta real del JSON. La clave municipal debe tener al menos 16 caracteres, sin espacios. Consulta la `ADMIN_KEY` de tu `.env` en el editor para entrar al panel; no la publiques.

Firebase Admin toma las credenciales de `GOOGLE_APPLICATION_CREDENTIALS`. No es necesario instalar `gcloud`. Conserva las reglas de Firestore que bloquean el acceso directo desde el navegador: las operaciones las realiza el backend con la cuenta de servicio.

`.gitignore` excluye `.env`, las variantes locales y los archivos `*-firebase-adminsdk-*.json`. Mantén el JSON fuera del proyecto y no compartas sus credenciales.

## Ejecutar en Windows con PowerShell

Abre una terminal en la carpeta del proyecto y ejecuta:

```powershell
cd "C:\ruta\AtencionCiudadana"
npm.cmd install
npm.cmd start
```

Se usa `npm.cmd` para evitar el bloqueo de `npm.ps1` por la política de ejecución de PowerShell. No es necesario cambiar esa política.

- Portal ciudadano: http://127.0.0.1:3000/
- Panel municipal: http://127.0.0.1:3000/admin

Detén el servidor con `Ctrl+C`. Para reiniciarlo, vuelve a ejecutar `npm.cmd start`. Si cambias `PORT`, utiliza ese puerto en las direcciones anteriores.

## Arquitectura y almacenamiento

1. El navegador valida el formulario y comprime la fotografía a JPEG.
2. Envía los campos mediante `fetch` a `POST /api/reportes`.
3. El backend valida los datos y guarda un documento en la colección `reportes`.
4. Firestore devuelve el ID del documento, que se muestra como código de confirmación.
5. El panel consulta `GET /api/reportes` con la clave municipal en el encabezado `Authorization: Bearer <clave>`.

Cada documento contiene:

| Campo | Contenido |
| --- | --- |
| `categoria` | Categoría seleccionada |
| `ubicacion` | Ubicación, sin espacios exteriores |
| `descripcion` | Descripción original, incluidos espacios y saltos de línea |
| `foto` | Fotografía JPEG como URL de datos base64 |
| `fecha` | Marca de tiempo del servidor de Firestore |

El código del reporte es el ID del documento. El panel muestra la fecha en la zona horaria de Guatemala y utiliza `textContent` para mostrar la descripción sin interpretar HTML.

### Límites de validación

- Ubicación: al menos 3 caracteres útiles y un máximo de 150 caracteres totales.
- Descripción: al menos 10 caracteres útiles y un máximo de 1500 caracteres totales.
- Archivo de entrada: JPG, PNG o WebP de hasta 12 000 000 bytes.
- Compresión: dimensión mayor de hasta 1200 píxeles y calidad JPEG de 0.72.
- Foto almacenada: un máximo de 720 000 caracteres, incluido el prefijo de la URL de datos.
- Solicitud: un máximo de 740 000 caracteres.

Antes de guardar, el backend mide los bytes UTF-8 del documento serializado y reserva 16 KiB de margen para nombres y metadatos. Esto mantiene el esquema actual por debajo del límite de 1 MiB por documento.

Los documentos existentes conservan el mismo esquema; no se migran ni sobrescriben.

## Demostración de las Series I y II

1. Inicia el servidor y abre el portal ciudadano.
2. Selecciona una categoría, escribe una ubicación y una descripción, y adjunta una foto. Puedes usar `test/fixture.jpg`, una imagen ficticia de una lámpara.
3. Envía el formulario y copia el código de confirmación.
4. Abre el panel municipal e introduce la clave de `.env`.
5. Localiza el mismo código y comprueba que la descripción original y la fotografía coincidan.
6. Detén y reinicia el servidor. Consulta nuevamente el panel: el reporte debe seguir disponible.
7. Prueba una clave municipal incorrecta y un formulario sin foto para observar las validaciones.
8. Opcionalmente, verifica el documento en la colección `reportes` desde la consola de Firebase.

## Pruebas

Pruebas de lógica de interfaz, sin conexión a Firebase:

```powershell
npm.cmd test
```

Incluyen compresión y confirmación, contenido del panel y mensajes de error. Utilizan DOM y canvas simulados; no sustituyen una prueba visual en un navegador real.

Prueba de integración con Firestore real:

```powershell
npm.cmd run test:firestore
```

Esta prueba utiliza `.env`, inicia un servidor temporal en el puerto 3011 y crea un reporte ficticio persistente en cada ejecución. Consume lecturas y escrituras de Firestore. El puerto 3011 debe estar libre.

Comprueba lectura, escritura con JPEG, código, descripción exacta, foto, fecha, tamaño, consulta de la API y persistencia tras reiniciar el servidor. También comprueba HTTP 400 al omitir la foto y HTTP 401 con una clave incorrecta. Conserva los reportes de prueba y no modifica los anteriores.

El resultado más reciente se guarda, sin credenciales, en `test/last-firestore-result.json`.

### Verificación realizada el 14 de noviembre de 2026

- Lectura y escritura reales en `atencion-ciudadana-77598`, base `(default)`.
- Reporte final de prueba: `rzWzeL9oxKPcy5yQyO19`.
- Tamaño calculado del documento: 2018 bytes.
- Código, descripción original y fotografía coincidentes en Firestore y en la API utilizada por el panel.
- Persistencia comprobada después de reiniciar el servidor.
- Reporte anterior de la muestra conservado sin cambios.
- Rechazos correctos: sin fotografía, 400; clave incorrecta, 401.
- Tres pruebas de lógica de interfaz aprobadas.

**Pendiente:** comprobar visualmente el envío y la presentación del reporte en un navegador real. El control del navegador no estaba disponible durante la sesión; el flujo con foto y la persistencia en Firestore se verificaron por HTTP y la lógica de interfaz mediante simulación.

## Estructura del proyecto

```text
AtencionCiudadana/
├── index.html                   # Portal y panel municipal
├── style.css                    # Diseño de la interfaz
├── app.js                       # Formularios, compresión y consultas
├── server.js                    # API, validación y Firebase Admin
├── package.json                 # Dependencias y comandos
├── package-lock.json            # Versiones de dependencias
├── .env.example                 # Plantilla de configuración
├── .gitignore                   # Exclusiones de Git
├── README.md
└── test/
    ├── frontend.test.js         # Pruebas de lógica de interfaz
    ├── firestore.integration.js # Prueba contra Firestore real
    ├── fixture.jpg              # Imagen ficticia de prueba
    └── last-firestore-result.json
```
