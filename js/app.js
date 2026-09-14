// ============================================================================
// app.js — Lógica de la vista "Registro": captura de lecturas por día/hora,
// cálculo de derivados y guardado en Firestore.
//
// Flujo pensado para velocidad: se elige el día UNA vez; luego se muestra una
// sola hora a la vez (con una franja de 24 "chips" para saltar a cualquier
// otra), y al guardar se avanza automáticamente a la siguiente hora — cruza
// de fecha sola después de las 23:00. Enter mueve el foco al siguiente campo.
// ============================================================================
import { db, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, lecturasRef, configuracionValida } from "./firebase-init.js";
import {
  calcularRegistro,
  franjaDeHora,
  horasDelDia,
  fechaHoraOrdenable,
  docIdFechaHora,
  siguienteHoraFecha,
  PARAMETROS,
  MEDIDORES,
} from "./calculos.js";
import { mostrarToast, fmt, hoyISO } from "./ui.js";

const form = document.getElementById("form-registro");
const inputFecha = document.getElementById("input-fecha");
const inputHoraActual = document.getElementById("hora-actual");
const horasStrip = document.getElementById("horas-strip");
const resumenDia = document.getElementById("resumen-dia");
const badgeTurno = document.getElementById("badge-turno");
const panelAnterior = document.getElementById("panel-anterior");
const btnGuardar = document.getElementById("btn-guardar");

let horaSeleccionada = null; // "HH:00"
let horasGuardadasDelDia = new Set(); // horas con documento ya guardado para inputFecha.value
let horaExistiaAntes = false; // true si la hora cargada actualmente ya tenía datos guardados

// Convierte el valor de un <input type="number"> a número, o a null si está
// vacío o no es válido. Como ningún campo es obligatorio, un campo vacío ya
// no debe tratarse como error (bloquear el guardado) ni como 0 (falsear los
// cálculos) — significa simplemente "todavía no hay dato para esta hora".
function numOrNull(valorTexto) {
  if (valorTexto === "" || valorTexto === null || valorTexto === undefined) return null;
  const n = parseFloat(valorTexto);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Franja de 24 horas del día seleccionado (chips clicables)
// ---------------------------------------------------------------------------
function pintarStrip() {
  horasStrip.innerHTML = horasDelDia()
    .map((h) => {
      const clases = ["chip-hora"];
      if (h === horaSeleccionada) clases.push("chip-hora--active");
      else if (horasGuardadasDelDia.has(h)) clases.push("chip-hora--done");
      return `<button type="button" class="${clases.join(" ")}" data-hora="${h}" title="${franjaDeHora(h)}">${h.slice(0, 2)}</button>`;
    })
    .join("");
  resumenDia.textContent = `${horasGuardadasDelDia.size} de 24 horas registradas`;
}

async function cargarHorasGuardadasDelDia(fecha) {
  const q = query(lecturasRef, where("fecha", "==", fecha));
  const snap = await getDocs(q);
  horasGuardadasDelDia = new Set(snap.docs.map((d) => d.data().hora));
}

let avisoConexionMostrado = false;
function avisarProblemaConexion(err) {
  console.error(err);
  if (avisoConexionMostrado) return; // no repetir el mismo aviso en cada hora
  avisoConexionMostrado = true;
  mostrarToast("No se pudo conectar con Firebase. Revisa tu configuración en js/firebase-config.js (ver aviso arriba).", "error");
}

function primeraHoraPendiente() {
  const horas = horasDelDia();
  const pendiente = horas.find((h) => !horasGuardadasDelDia.has(h));
  if (pendiente) return pendiente;
  // Ya están las 24 — por defecto, la hora actual del reloj (para poder revisar/corregir)
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:00`;
}

// ---------------------------------------------------------------------------
// Cargar / limpiar el formulario para (fecha, hora)
// ---------------------------------------------------------------------------
async function cargarHoraEnFormulario(hora) {
  horaSeleccionada = hora;
  inputHoraActual.value = `${hora}  ·  ${franjaDeHora(hora)}`;
  badgeTurno.textContent = franjaDeHora(hora);
  pintarStrip();

  const fecha = inputFecha.value;
  const id = docIdFechaHora(fecha, hora);

  let snap = { exists: () => false, data: () => ({}) };
  try {
    snap = await getDoc(doc(db, "lecturas", id));
  } catch (err) {
    avisarProblemaConexion(err);
  }

  limpiarCampos();
  horaExistiaAntes = snap.exists();

  if (horaExistiaAntes) {
    const d = snap.data();
    form.potenciaTotalKw.value = d.energia?.potenciaTotalKw ?? "";
    form.energiaSuminGwh.value = d.energia?.energiaSuminGwh ?? "";
    form.energiaSinRestar.checked = !!d.energia?.sinRestar;
    form.estado.value = d.estado ?? "OK";
    form.operador.value = d.operador ?? "";
    form.nivelCisternaPct.value = d.agua?.nivelPct ?? "";
    MEDIDORES.forEach(({ id }) => {
      const campo = form[id];
      if (campo) campo.value = d.medidores?.[id]?.lectura ?? "";
    });
    (d.glp?.tanques || []).forEach((t, i) => {
      const campo = form[`glp${i + 1}`];
      if (campo) campo.value = t.psi ?? "";
    });
    btnGuardar.textContent = "Actualizar esta hora";
    mostrarToast(`${fecha} ${hora} ya tenía datos — corrígelos y guarda las veces que necesites.`, "info");
  } else {
    btnGuardar.textContent = "Guardar y pasar a la siguiente hora →";
  }

  await mostrarPanelAnterior(fecha, hora);
  enfocarPrimerCampo();
}

// Limpia solo los campos de datos (deja "hora-actual", que no es parte de
// este ciclo, intacto — usar form.reset() lo borraría porque vive dentro del <form>).
function limpiarCampos() {
  const nombres = [
    "potenciaTotalKw",
    "energiaSuminGwh",
    "nivelCisternaPct",
    ...MEDIDORES.map((m) => m.id),
    "glp1",
    "glp2",
    "glp3",
    "glp4",
    "glp5",
    "glp6",
    "operador",
  ];
  nombres.forEach((nombre) => {
    if (form[nombre]) form[nombre].value = "";
  });
  form.estado.value = "OK";
  form.energiaSinRestar.checked = false;
}

function enfocarPrimerCampo() {
  const primero = form.querySelector('input[name="potenciaTotalKw"]');
  if (primero) primero.focus();
}

// ---------------------------------------------------------------------------
// Busca la lectura inmediatamente anterior a (fecha, hora), sin importar si
// cruza medianoche o cambia de mes — se ordena por el campo fechaHora.
// ---------------------------------------------------------------------------
async function obtenerAnterior(fecha, hora) {
  const clave = fechaHoraOrdenable(fecha, hora);
  const q = query(lecturasRef, where("fechaHora", "<", clave), orderBy("fechaHora", "desc"), limit(1));
  try {
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data();
  } catch (err) {
    avisarProblemaConexion(err);
    return null;
  }
}

async function mostrarPanelAnterior(fecha, hora) {
  panelAnterior.innerHTML = `<p class="muted">Buscando lectura anterior…</p>`;
  const anterior = await obtenerAnterior(fecha, hora);
  if (!anterior) {
    panelAnterior.innerHTML = `<p class="muted">No hay una lectura previa guardada antes de este momento (será la primera del histórico).</p>`;
    return;
  }
  panelAnterior.innerHTML = `
    <p class="muted">Última lectura anterior: <strong>${anterior.fecha} ${anterior.hora}</strong> (${anterior.turno})</p>
    <div class="mini-grid">
      <div><span>Potencia</span><strong>${fmt(anterior.energia?.potenciaTotalKw)} kW</strong></div>
      <div><span>Nivel cisterna</span><strong>${fmt(anterior.agua?.nivelPct)} %</strong></div>
      <div><span>GLP total</span><strong>${fmt(anterior.glp?.masaTotalKg, 0)} kg</strong></div>
      <div><span>M3 · Consumo planta</span><strong>${fmt(anterior.medidores?.m3?.lectura, 1)} m³</strong></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Cambiar de día (recarga la franja de horas y selecciona la primera pendiente)
// ---------------------------------------------------------------------------
async function alCambiarFecha() {
  const fecha = inputFecha.value;
  if (!fecha) return;
  resumenDia.textContent = "Consultando…";
  try {
    await cargarHorasGuardadasDelDia(fecha);
  } catch (err) {
    horasGuardadasDelDia = new Set();
    avisarProblemaConexion(err);
  }
  // Pase lo que pase con Firebase, la franja de horas y el formulario SIEMPRE
  // deben quedar usables — si no, un problema de conexión deja la pantalla
  // "congelada" sin ninguna explicación (como reportó José).
  await cargarHoraEnFormulario(primeraHoraPendiente());
}

// ---------------------------------------------------------------------------
// Guardar y avanzar
// ---------------------------------------------------------------------------
async function guardarRegistro(ev) {
  ev.preventDefault();
  const fecha = inputFecha.value;
  const hora = horaSeleccionada;
  if (!fecha || !hora) {
    mostrarToast("Selecciona el día y una hora en la franja.", "error");
    return;
  }

  const medidores = {};
  MEDIDORES.forEach(({ id }) => {
    const campo = form[id];
    medidores[id] = campo ? numOrNull(campo.value) : null;
  });

  const input = {
    fecha,
    hora,
    estado: form.estado.value,
    operador: form.operador.value.trim(),
    potenciaTotalKw: numOrNull(form.potenciaTotalKw.value),
    energiaSuminGwh: numOrNull(form.energiaSuminGwh.value),
    energiaSinRestar: form.energiaSinRestar.checked,
    nivelCisternaPct: numOrNull(form.nivelCisternaPct.value),
    glpPsi: [1, 2, 3, 4, 5, 6].map((i) => numOrNull(form[`glp${i}`].value)),
    medidores,
  };

  // Ningún campo es obligatorio (así se puede guardar la hora aunque falten
  // datos, y completarla después) — pero evitamos un guardado totalmente
  // vacío por accidente (por ejemplo, si se presiona Enter sin llenar nada).
  const hayAlgunDato =
    input.potenciaTotalKw !== null ||
    input.energiaSuminGwh !== null ||
    input.nivelCisternaPct !== null ||
    input.glpPsi.some((v) => v !== null) ||
    Object.values(medidores).some((v) => v !== null);

  if (!hayAlgunDato) {
    mostrarToast("No ingresaste ningún dato para esta hora.", "error");
    return;
  }

  const eraEdicion = horaExistiaAntes;

  btnGuardar.disabled = true;
  try {
    const anterior = await obtenerAnterior(fecha, hora);
    const registro = calcularRegistro(input, anterior);
    registro.fechaHora = fechaHoraOrdenable(fecha, hora);
    registro.actualizadoEn = new Date().toISOString();

    const id = docIdFechaHora(fecha, hora);
    await setDoc(doc(db, "lecturas", id), registro, { merge: true });

    horasGuardadasDelDia.add(hora);

    if (eraEdicion) {
      // Ya tenía datos: nos quedamos en la misma hora para poder seguir
      // corrigiéndola las veces que haga falta, sin saltar a la siguiente.
      mostrarToast(`Actualizado: ${fecha} ${hora} (${registro.turno})`, "success");
      await cargarHoraEnFormulario(hora);
    } else {
      // Hora nueva: avanzamos a la siguiente para agilizar la carga de las 24 horas.
      mostrarToast(`Guardado: ${fecha} ${hora} (${registro.turno})`, "success");
      const siguiente = siguienteHoraFecha(fecha, hora);
      if (siguiente.fecha !== fecha) {
        inputFecha.value = siguiente.fecha;
        await cargarHorasGuardadasDelDia(siguiente.fecha).catch((err) => avisarProblemaConexion(err));
      }
      await cargarHoraEnFormulario(siguiente.hora);
    }
  } catch (err) {
    console.error(err);
    mostrarToast("Error al guardar en Firebase: " + err.message, "error");
  } finally {
    btnGuardar.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Enter → salta al siguiente campo (o guarda, si es el último)
// ---------------------------------------------------------------------------
function habilitarSaltoConEnter() {
  const campos = () =>
    Array.from(form.querySelectorAll("input, select")).filter((el) => el.type !== "hidden" && !el.readOnly);
  form.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (ev.target.tagName === "BUTTON") return;
    ev.preventDefault();
    const lista = campos();
    const idx = lista.indexOf(ev.target);
    const siguiente = lista[idx + 1];
    if (siguiente) {
      siguiente.focus();
      if (siguiente.select) siguiente.select();
    } else {
      form.requestSubmit();
    }
  });
}

function init() {
  if (!configuracionValida) {
    const banner = document.getElementById("banner-config");
    if (banner) banner.hidden = false;
  }

  inputFecha.value = hoyISO();

  document.getElementById("info-parametros").innerHTML = `
    Cisterna: ${PARAMETROS.cisterna.alturaM} × ${PARAMETROS.cisterna.anchoM} × ${PARAMETROS.cisterna.largoM} m
    (≈ ${PARAMETROS.cisterna.capacidadM3.toFixed(1)} m³) · Tanque GLP: ${PARAMETROS.glp.capacidadVolumetricaL} L /
    ${PARAMETROS.glp.capacidadMasaKg} kg × ${PARAMETROS.glp.numTanques} tanques · ${MEDIDORES.length} medidores de agua definidos (M0-M16), 8 activos
  `;

  inputFecha.addEventListener("change", alCambiarFecha);
  horasStrip.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".chip-hora");
    if (btn) cargarHoraEnFormulario(btn.dataset.hora);
  });
  form.addEventListener("submit", guardarRegistro);
  habilitarSaltoConEnter();

  alCambiarFecha();
}

init();
