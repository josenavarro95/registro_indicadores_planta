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
  turnoDeHora,
  horasDelDia,
  fechaHoraOrdenable,
  docIdFechaHora,
  siguienteHoraFecha,
  PARAMETROS,
} from "./calculos.js";
import { mostrarToast, fmt, hoyISO } from "./ui.js";

const form = document.getElementById("form-registro");
const inputFecha = document.getElementById("input-fecha");
const inputHoraActual = document.getElementById("hora-actual");
const horasStrip = document.getElementById("horas-strip");
const resumenDia = document.getElementById("resumen-dia");
const badgeTurno = document.getElementById("badge-turno");
const panelAnterior = document.getElementById("panel-anterior");
const btnCargarExcel = document.getElementById("btn-cargar-excel");
const btnGuardar = document.getElementById("btn-guardar");

let horaSeleccionada = null; // "HH:00"
let horasGuardadasDelDia = new Set(); // horas con documento ya guardado para inputFecha.value
let horaExistiaAntes = false; // true si la hora cargada actualmente ya tenía datos guardados

// ---------------------------------------------------------------------------
// Franja de 24 horas del día seleccionado (chips clicables)
// ---------------------------------------------------------------------------
function pintarStrip() {
  horasStrip.innerHTML = horasDelDia()
    .map((h) => {
      const clases = ["chip-hora"];
      if (h === horaSeleccionada) clases.push("chip-hora--active");
      else if (horasGuardadasDelDia.has(h)) clases.push("chip-hora--done");
      return `<button type="button" class="${clases.join(" ")}" data-hora="${h}" title="${turnoDeHora(h)}">${h.slice(0, 2)}</button>`;
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
  inputHoraActual.value = `${hora}  ·  ${turnoDeHora(hora)}`;
  badgeTurno.textContent = turnoDeHora(hora);
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
    form.corrienteL1.value = d.energia?.corrienteL1 ?? "";
    form.corrienteL2.value = d.energia?.corrienteL2 ?? "";
    form.corrienteL3.value = d.energia?.corrienteL3 ?? "";
    form.estado.value = d.estado ?? "OK";
    form.operador.value = d.operador ?? "";
    form.nivelCisternaPct.value = d.agua?.nivelPct ?? "";
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
  ["corrienteL1", "corrienteL2", "corrienteL3", "nivelCisternaPct", "glp1", "glp2", "glp3", "glp4", "glp5", "glp6", "operador"].forEach(
    (nombre) => {
      if (form[nombre]) form[nombre].value = "";
    }
  );
  form.estado.value = "OK";
}

function enfocarPrimerCampo() {
  const primero = form.querySelector('input[name="corrienteL1"]');
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
      <div><span>Potencia</span><strong>${fmt(anterior.energia?.potenciaKw)} kW</strong></div>
      <div><span>Nivel cisterna</span><strong>${fmt(anterior.agua?.nivelPct)} %</strong></div>
      <div><span>GLP total</span><strong>${fmt(anterior.glp?.masaTotalKg, 0)} kg</strong></div>
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

  const input = {
    fecha,
    hora,
    estado: form.estado.value,
    operador: form.operador.value.trim(),
    corrienteL1: parseFloat(form.corrienteL1.value),
    corrienteL2: parseFloat(form.corrienteL2.value),
    corrienteL3: parseFloat(form.corrienteL3.value),
    nivelCisternaPct: parseFloat(form.nivelCisternaPct.value),
    glpPsi: [1, 2, 3, 4, 5, 6].map((i) => parseFloat(form[`glp${i}`].value)),
  };

  const camposNumericosOk =
    [input.corrienteL1, input.corrienteL2, input.corrienteL3, input.nivelCisternaPct].every(
      (v) => !Number.isNaN(v)
    ) && input.glpPsi.every((v) => !Number.isNaN(v));

  if (!camposNumericosOk) {
    mostrarToast("Revisa que todos los campos numéricos estén completos.", "error");
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
    ${PARAMETROS.glp.capacidadMasaKg} kg × ${PARAMETROS.glp.numTanques} tanques · Red ${PARAMETROS.energia.voltajeLineaLinea} V,
    cos φ ${PARAMETROS.energia.factorPotencia}
  `;

  inputFecha.addEventListener("change", alCambiarFecha);
  horasStrip.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".chip-hora");
    if (btn) cargarHoraEnFormulario(btn.dataset.hora);
  });
  form.addEventListener("submit", guardarRegistro);
  btnCargarExcel.addEventListener("click", cargarDatosDeExcel);
  habilitarSaltoConEnter();

  alCambiarFecha();
}

// ---------------------------------------------------------------------------
// Botón de utilidad: carga las 24 lecturas de referencia extraídas del Excel
// (data/seed-excel.json) procesándolas por el mismo motor de cálculo, para
// tener datos reales con qué probar el dashboard de inmediato.
// Nota: requiere servir el sitio con un servidor local (no funciona abriendo
// index.html con doble clic / file://, por restricciones del navegador al
// hacer fetch() de archivos locales).
// ---------------------------------------------------------------------------
async function cargarDatosDeExcel() {
  if (!confirm("Esto escribirá 24 lecturas de referencia (tomadas del Excel) en tu Firestore. ¿Continuar?")) return;
  btnCargarExcel.disabled = true;
  btnCargarExcel.textContent = "Cargando...";
  try {
    const res = await fetch("data/seed-excel.json");
    if (!res.ok) throw new Error("No se pudo leer data/seed-excel.json (¿estás usando un servidor local?)");
    const filas = await res.json();
    filas.sort((a, b) => fechaHoraOrdenable(a.fecha, a.hora).localeCompare(fechaHoraOrdenable(b.fecha, b.hora)));

    let anterior = await obtenerAnterior(filas[0].fecha, filas[0].hora);
    let guardadas = 0;
    for (const fila of filas) {
      const registro = calcularRegistro(fila, anterior);
      registro.fechaHora = fechaHoraOrdenable(fila.fecha, fila.hora);
      registro.actualizadoEn = new Date().toISOString();
      const id = docIdFechaHora(fila.fecha, fila.hora);
      await setDoc(doc(db, "lecturas", id), registro, { merge: true });
      anterior = registro;
      guardadas++;
    }
    mostrarToast(`Se cargaron ${guardadas} lecturas de referencia. Revisa el Dashboard Gerencial.`, "success");
    await alCambiarFecha();
  } catch (err) {
    console.error(err);
    mostrarToast("Error al cargar datos de referencia: " + err.message, "error");
  } finally {
    btnCargarExcel.disabled = false;
    btnCargarExcel.textContent = "Cargar datos de referencia del Excel (una vez, opcional)";
  }
}

init();
