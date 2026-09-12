# Monitoreo Integral — Planta Valdivia (prototipo)

Aplicación web (HTML + JS + Firebase Firestore) para registrar, por día/hora/turno,
el consumo de **energía eléctrica**, **agua potable (cisterna)**, **17 medidores de
agua por área (M0-M16)** y **GLP (6 tanques)** de la planta, y visualizarlo en un
**dashboard gerencial** con gráficos técnicos y diagnóstico automático de
comportamiento. Se puede **instalar como app** (PWA) desde el navegador.

Es un prototipo de captura **manual**, pensado como paso previo a la integración
automática con sensores/PLC (ver [Hoja de ruta](#hoja-de-ruta-de-automatización)).

## Estructura del proyecto

```
monitoreo-planta/
├── index.html                    # Interfaz (Registro + Dashboard)
├── manifest.webmanifest          # Metadatos de la PWA (nombre, ícono, colores)
├── service-worker.js             # Habilita "Instalar app" y carga rápida/offline
├── icons/                        # Íconos de la app (192px, 512px, maskable)
├── css/styles.css                # Tema técnico/industrial
├── js/
│   ├── calculos.js               # Motor de cálculo (sin dependencias) — ver supuestos abajo
│   ├── firebase-config.js        # ← AQUÍ VAN TUS CREDENCIALES DE FIREBASE
│   ├── firebase-init.js          # Inicializa Firebase App + Firestore
│   ├── app.js                    # Lógica del formulario de registro
│   ├── dashboard.js              # KPIs, gráficos (Chart.js) y diagnóstico
│   └── ui.js                     # Toasts y formateo
├── firestore.rules               # Reglas de seguridad (abiertas para el prototipo)
└── README.md
```

## 1. Configurar tu proyecto de Firebase

1. En la [consola de Firebase](https://console.firebase.google.com), abre tu proyecto
   **"Datos consumo planta"**.
2. Si aún no existe, crea una base de datos en **Firestore Database** (modo producción).
3. En **⚙ Configuración del proyecto**, baja hasta la sección **"Tus apps"**
   (está más abajo de "Nombre del proyecto / ID del proyecto", que es la
   pantalla general y no trae las credenciales — para eso hace falta la app
   web específica):
   - Si ahí dice que no hay apps, haz clic en el ícono **`</>`** ("Web") para
     registrar una. Ponle cualquier nombre (por ejemplo `monitoreo-web`) y
     **no marques** "Configurar Firebase Hosting" (no lo necesitas).
   - Al terminar, Firebase te muestra un bloque de código con
     `const firebaseConfig = { apiKey: "...", appId: "...", ... }`. Copia ese
     objeto completo (o mándamelo a mí y yo lo dejo listo en el archivo).
4. Pega esos valores en `js/firebase-config.js`, reemplazando los `"TU_..."`.
5. Publica las reglas de `firestore.rules` en **Firestore Database → Reglas**
   (pega el contenido del archivo y presiona "Publicar"; o con la CLI de
   Firebase: `firebase deploy --only firestore:rules`).

Las reglas incluidas quedaron **abiertas** (`allow read, write: if true`) porque así
lo definiste para poder probar rápido. El propio archivo `firestore.rules` trae,
comentada, la versión sellada con autenticación anónima — actívala antes de
compartir la app fuera del equipo o subirla a un GitHub Pages público.

## 2. Publicar / ejecutar

Recomendado: publicar con **GitHub Pages** (ver sección [GitHub](#github) abajo) —
así además funciona como PWA instalable. Para probar en tu propia máquina antes de
subir, el navegador bloquea los módulos ES (`type="module"`) al abrir `index.html`
con doble clic (`file://`), así que necesitas un servidor local simple:

```bash
# Opción 1: Python (ya viene instalado en casi cualquier equipo)
cd monitoreo-planta
python3 -m http.server 8080
# abre http://localhost:8080

# Opción 2: Node
npx serve .
```

## 3. Uso

- **Registro de Lectura**: pensado para llenarse rápido y sin usar el mouse.
  Eliges el **día** una sola vez; abajo aparece una franja con las 24 horas
  (gris = pendiente, verde = ya registrada, azul = la que estás llenando). Al
  entrar, la app salta sola a la primera hora sin datos. El turno se calcula
  solo según los 3 turnos reales de la planta (Noche 19:00–00:00, Madrugada
  01:00–08:00, Día/Tarde 09:00–18:00). Escribe un valor y presiona **Enter**
  para saltar al siguiente campo (Potencia total → Energía suministrada →
  % cisterna → los 17 medidores de agua M0-M16 → los 6 PSI de GLP →
  operador); al presionar Enter en el último campo se guarda solo. Después de
  guardar una hora **nueva**, la app **avanza automáticamente a la hora
  siguiente** (incluso cruzando la medianoche al día siguiente), así que
  puedes hacer las 24 horas seguidas sin tocar la fecha ni el mouse.

  **Energía** y los **17 medidores de agua** son medidores **totalizadores**:
  como un medidor de agua o luz normal, la cifra solo sube — anotas lo que
  marca el medidor en ese momento y la app calcula sola el consumo de la hora
  (actual menos anterior). La **cisterna** sigue siendo el % de llenado, y el
  **GLP** sigue siendo la presión de campo en PSI de cada tanque.

  Para corregir una hora **ya registrada**, tócala en la franja verde — el
  formulario carga sus datos y el botón cambia a "Actualizar esta hora". Al
  guardar, la app se **queda en esa misma hora** (no avanza) para que puedas
  corregirla las veces que necesites; navega a otra hora cuando quieras
  tocando cualquier chip.

  Si ves un aviso naranja arriba de todo ("Esta app todavía no está conectada
  a tu proyecto real de Firebase…"), significa que `js/firebase-config.js`
  todavía tiene los valores de plantilla (`"TU_..."`) — sigue el paso 1 de
  arriba. Mientras tanto la franja de horas y el formulario funcionan igual
  (para que puedas ver la interfaz), pero nada se guarda de verdad hasta que
  conectes tu proyecto.
- **Dashboard Gerencial**: elige un rango de fechas y verás KPIs (energía total,
  demanda máxima, agua total de cisterna, GLP total) y 6 bloques de gráficos:
  energía, cisterna, **consumo de agua por área** (ranking de las 13 áreas de
  mayor a menor, con balance contra el medidor maestro M3), **tratamiento de
  agua / ósmosis** (M0-M2, con % de recuperación) y GLP. Cada bloque trae una
  descripción de qué muestra y un diagnóstico automático (✓ normal / ⚠ atención).
- **Instalar como app (PWA)**: una vez publicado en GitHub Pages, al abrir el
  sitio en Chrome/Edge (computadora o Android) aparece un ícono de "Instalar"
  en la barra de direcciones (o "Agregar a inicio" en el menú ⋮ del navegador
  móvil / "Agregar a pantalla de inicio" en iPhone desde Safari). Al instalarla
  queda como una app normal, con su propio ícono, sin la barra del navegador.

## Supuestos técnicos tomados para el prototipo

Estos son los puntos donde tuve que decidir algo por ti para poder avanzar.
Revísalos — son fáciles de ajustar, están aislados en `js/calculos.js`:

- **Energía eléctrica**: se ingresan dos lecturas directas del tablero cada
  hora — **Potencia total (kW)**, instantánea, y **Energía suministrada**,
  la lectura ACUMULADA del medidor (en GWh, como pediste — es un totalizador
  que solo sube). El consumo real de cada hora (kWh) se calcula solo, como la
  diferencia entre la lectura acumulada actual y la anterior, para poder
  verificar la potencia consumida hora a hora contra la demanda instantánea.
- **Medidores de agua M0-M16**: los 17 son totalizadores (como un medidor de
  agua normal, en m³) — el consumo de cada hora se calcula como la diferencia
  con la lectura anterior de ese mismo medidor, igual que ya se hacía con la
  cisterna. M0-M2 son el tren de tratamiento (entrada de pozo → producto/
  rechazo de ósmosis), M3 es el medidor maestro de "consumo de planta", y
  M4-M16 son los 13 puntos de consumo por área — el dashboard usa estos 13
  para el ranking de consumo y compara su suma contra M3 como chequeo de
  balance (una diferencia grande puede indicar una fuga o un área sin medir).
- **Conversión PSI → kg de GLP**: los datos reales de los 6 tanques se mueven
  en un rango angosto (58–85 PSI) y bajan de forma gradual y constante turno a
  turno — el comportamiento típico de un **indicador de nivel**, no de presión
  de vapor real (la presión de vapor de una mezcla GLP depende sobre todo de
  la temperatura ambiente, no cae así con el consumo). Por eso, el prototipo
  asume que esa lectura de campo ya viene calibrada 0–100 y la usa
  directamente como **% de llenado** del tanque (`masaKg = %/100 × 4050 kg`).
  El kg/cm² sí es una conversión física real (PSI × 0.070307) y se muestra
  solo como referencia. Cuando tengas la curva de calibración exacta del
  transmisor (PSI a tanque vacío y PSI a tanque lleno), avísame y ajusto la
  función `nivelPctDesdePsi()` en `calculos.js` — es el único lugar que hay
  que tocar.
- **Cisterna**: 1.9 × 4.3 × 6.7 m = 54.79 m³ (redondeas a 55 m³ nominal),
  dimensiones que me diste directamente.
- **Día operativo vs. día calendario**: la planta arma su reporte con un
  "día de planta" que arranca a las 19:00 (Turno 1) y cruza medianoche hasta
  las 18:00 del día siguiente. El prototipo, para simplicidad, guarda cada
  lectura con su **fecha calendario real** y hora — el orden cronológico
  (para calcular consumos como diferencia con la lectura anterior) es
  correcto y cruza la medianoche sin problema, pero el filtro del dashboard
  agrupa "por fecha calendario", no "por día de planta". Si prefieres que el
  dashboard también agrupe por turno de 19:00 a 18:00, lo ajustamos en una
  siguiente iteración.
- **Reglas de Firestore abiertas**: decidiste dejarlas así para probar rápido
  (ver sección 1). Recuerda cerrarlas antes de un uso más amplio.
- **Recuperación de ósmosis "típica" (40-75%)**: es una referencia general de
  la industria para ósmosis inversa, usada solo para el diagnóstico automático
  del dashboard — ajústala en `renderOsmosis()` (`js/dashboard.js`) si tu
  proceso tiene un rango de diseño distinto.

## Modelo de datos en Firestore

Colección `lecturas`, un documento por hora con ID `AAAA-MM-DD_HHMM`, por ejemplo
`2026-09-10_0800`:

```json
{
  "fecha": "2026-09-10", "hora": "08:00", "turno": "Turno 2 - Madrugada",
  "estado": "OK", "operador": "...",
  "energia": { "potenciaTotalKw": 305.6, "energiaSuminGwh": 12.483217, "energiaConsumidaKwh": 305.6 },
  "agua": { "nivelPct": 47.37, "alturaM": 0.9, "volumenM3": 25.95, "consumoM3": -3.16 },
  "medidores": {
    "m0": { "nombre": "Entrada agua de pozo", "lectura": 15420.5, "consumoM3": 12.3 },
    "m3": { "nombre": "Consumo de planta", "lectura": 9870.2, "consumoM3": 9.8 },
    "...": "m1, m2, m4-m16 con la misma forma { nombre, lectura, consumoM3 }"
  },
  "glp": { "tanques": [ { "numero": 1, "psi": 72, "kgcm2": 5.06, "nivelPct": 72, "masaKg": 2916, "volumenL": 5400 }, "... x6" ],
           "promPsi": 71.17, "masaTotalKg": 17253, "pctTotal": 71.0, "consumoKgHora": 45 },
  "fechaHora": "2026-09-10T08:00"
}
```

> Nota: las horas guardadas **antes** de este cambio de esquema tienen
> `corrienteL1/L2/L3` en vez de `potenciaTotalKw`/`energiaSuminGwh`, y no
> tienen el campo `medidores`. El dashboard las muestra igual para lo que sí
> tienen (cisterna, GLP), pero los gráficos de energía y de medidores de agua
> van a tener huecos en esas horas antiguas — es normal, es el costo único de
> cambiar de esquema a mitad de camino.

## Hoja de ruta de automatización

Cuando quieras dejar de ingresar los datos a mano, el mismo modelo de datos y
`calculos.js` sirven de base: en vez de que `app.js` reciba los valores desde el
formulario, un servicio (por ejemplo, una Cloud Function programada cada hora,
o un gateway IoT/PLC que hable con Modbus/OPC-UA) llamaría a la misma función
`calcularRegistro()` con las lecturas de los sensores y haría el mismo
`setDoc()` en Firestore. El dashboard no cambiaría nada.

## GitHub

Este proyecto está listo para subirse tal cual a un repositorio y publicarse
con **GitHub Pages** (Settings → Pages → Source: GitHub Actions, con el
workflow `.github/workflows/deploy.yml`). Como todo corre en el navegador
contra Firestore, no necesita backend propio. Antes de hacerlo público, revisa
la sección de reglas de seguridad.

Una vez publicado, el `service-worker.js` y el `manifest.webmanifest` habilitan
que el navegador ofrezca **"Instalar app"** automáticamente — no hace falta
configuración extra en GitHub Pages para eso.
