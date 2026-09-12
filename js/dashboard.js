// ============================================================================
// dashboard.js — Vista "Dashboard Gerencial": KPIs, gráficos técnicos y
// diagnóstico automático de comportamiento (normal / atención / crítico).
// ============================================================================
import { lecturasRef, getDocs, query, where, orderBy } from "./firebase-init.js";
import { PARAMETROS, MEDIDORES, MEDIDORES_AREA_IDS } from "./calculos.js";
import { mostrarToast, fmt, fmtFecha, hoyISO } from "./ui.js";

const inputDesde = document.getElementById("input-desde");
const inputHasta = document.getElementById("input-hasta");
const btnActualizar = document.getElementById("btn-actualizar-dashboard");

const graficos = {}; // instancias Chart.js, para poder destruir/redibujar

const PALETA = {
  energia: "#3fb6ff",
  potencia: "#ffb547",
  l1: "#3fb6ff",
  l2: "#7ee787",
  l3: "#ff6ec7",
  agua: "#4fd1c5",
  umbral: "#ff5c5c",
  glp: "#c792ea",
};

// Paleta cíclica para el gráfico de 13 áreas de consumo de agua — colores
// bien diferenciables entre sí sobre fondo oscuro.
const PALETA_AREAS = ["#3fb6ff", "#4fd1c5", "#7ee787", "#ffb547", "#c792ea", "#ff6ec7", "#f4d35e", "#8aa9ff", "#5ee6c0", "#ff9166", "#a0e17a", "#7fc8ff", "#e0a3ff"];

function hace(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

async function cargarRango(desde, hasta) {
  const q = query(lecturasRef, where("fecha", ">=", desde), where("fecha", "<=", hasta), orderBy("fecha", "asc"));
  const snap = await getDocs(q);
  const registros = snap.docs.map((d) => d.data());
  registros.sort((a, b) => (a.fechaHora || "").localeCompare(b.fechaHora || ""));
  return registros;
}

function estadistica(valores) {
  const v = valores.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!v.length) return { media: 0, desv: 0, min: 0, max: 0 };
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  const varianza = v.reduce((a, b) => a + (b - media) ** 2, 0) / v.length;
  return { media, desv: Math.sqrt(varianza), min: Math.min(...v), max: Math.max(...v) };
}

function etiqueta(r) {
  return `${r.hora}\n${fmtFecha(r.fecha)}`;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
function renderKPIs(registros) {
  const totalEnergiaKwh = registros.reduce((a, r) => a + Math.max(0, r.energia?.energiaConsumidaKwh || 0), 0);
  const demandaMaximaKw = registros.reduce((a, r) => Math.max(a, r.energia?.potenciaTotalKw || 0), 0);
  const totalAguaM3 = registros.reduce((a, r) => a + Math.max(0, r.agua?.consumoM3 || 0), 0);
  const totalGlpKg = registros.reduce((a, r) => a + Math.max(0, r.glp?.consumoKgHora || 0), 0);

  document.getElementById("kpi-energia").textContent = registros.length ? `${fmt(totalEnergiaKwh, 0)} kWh` : "—";
  document.getElementById("kpi-demanda").textContent = registros.length ? `${fmt(demandaMaximaKw, 1)} kW` : "—";
  document.getElementById("kpi-agua").textContent = registros.length ? `${fmt(totalAguaM3, 2)} m³` : "—";
  document.getElementById("kpi-glp").textContent = registros.length ? `${fmt(totalGlpKg, 1)} kg` : "—";
}

// ---------------------------------------------------------------------------
// Gráfico genérico
// ---------------------------------------------------------------------------
function dibujar(idCanvas, config) {
  const ctx = document.getElementById(idCanvas);
  // Destruye cualquier gráfico previo en este canvas — tanto el que nosotros
  // recordamos (graficos[idCanvas]) como cualquier otro que Chart.js ya tenga
  // registrado internamente en ese mismo <canvas> (Chart.getChart). Esta doble
  // verificación evita el error "Canvas is already in use" cuando dos llamadas
  // a actualizarDashboard() se superponen (por ejemplo, al cambiar de pestaña
  // justo cuando la carga inicial todavía no terminaba).
  const existente = graficos[idCanvas] || Chart.getChart(ctx);
  if (existente) existente.destroy();
  graficos[idCanvas] = new Chart(ctx, config);
}

const opcionesBase = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { labels: { color: "#c9d6e3", usePointStyle: true, boxWidth: 8 } },
    tooltip: { backgroundColor: "#0f1620", borderColor: "#233042", borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: "#8ea0b4", maxRotation: 0 }, grid: { color: "#1a2431" } },
    y: { ticks: { color: "#8ea0b4" }, grid: { color: "#1a2431" } },
  },
};

function lineaUmbral(valor, etiquetas, texto) {
  return {
    label: texto,
    data: etiquetas.map(() => valor),
    borderColor: PALETA.umbral,
    borderDash: [6, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    fill: false,
  };
}

// ---------------------------------------------------------------------------
// Energía
// ---------------------------------------------------------------------------
function renderEnergia(registros) {
  const etiquetas = registros.map(etiqueta);
  const potencia = registros.map((r) => r.energia?.potenciaTotalKw ?? null);
  const energiaKwh = registros.map((r) => r.energia?.energiaConsumidaKwh ?? null);

  dibujar("chart-energia", {
    data: {
      labels: etiquetas,
      datasets: [
        { type: "bar", label: "Energía consumida (kWh/hora)", data: energiaKwh, backgroundColor: "#3fb6ff55", borderColor: PALETA.energia, borderWidth: 1, yAxisID: "y" },
        { type: "line", label: "Potencia total (kW)", data: potencia, borderColor: PALETA.potencia, backgroundColor: "transparent", tension: 0.3, pointRadius: 2, yAxisID: "y" },
      ],
    },
    options: { ...opcionesBase, scales: { ...opcionesBase.scales, y: { ...opcionesBase.scales.y, title: { display: true, text: "kW / kWh", color: "#8ea0b4" } } } },
  });

  const st = estadistica(potencia);
  const ultimo = potencia[potencia.length - 1];
  let diag = "Sin datos suficientes para diagnóstico.";
  if (ultimo === null || ultimo === undefined) {
    diag = "Falta el dato de potencia de la última hora del periodo.";
  } else if (potencia.length >= 2) {
    if (ultimo > st.media * 1.2) {
      diag = `⚠ Potencia actual (${fmt(ultimo)} kW) ${fmt(((ultimo / st.media - 1) * 100))}% por encima del promedio del periodo (${fmt(st.media)} kW). Revisar cargas conectadas.`;
    } else if (ultimo < st.media * 0.4 && st.media > 5) {
      diag = `ℹ Potencia actual muy por debajo del promedio del periodo — posible parada de planta o equipo apagado.`;
    } else {
      diag = `✓ Consumo de energía dentro del rango normal (promedio del periodo: ${fmt(st.media)} kW, máximo: ${fmt(st.max)} kW).`;
    }
  }
  document.getElementById("diag-energia").textContent = diag;
}

// ---------------------------------------------------------------------------
// Agua / cisterna
// ---------------------------------------------------------------------------
function renderAgua(registros) {
  const etiquetas = registros.map(etiqueta);
  const nivel = registros.map((r) => r.agua?.nivelPct ?? null);
  const volumen = registros.map((r) => r.agua?.volumenM3 ?? null);
  const umbral = PARAMETROS.cisterna.umbralBajoPct;

  dibujar("chart-agua", {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "Nivel cisterna (%)", data: nivel, borderColor: PALETA.agua, backgroundColor: "#4fd1c533", fill: true, tension: 0.3, pointRadius: 1.5 },
        lineaUmbral(umbral, etiquetas, `Umbral bajo (${umbral}%)`),
      ],
    },
    options: { ...opcionesBase, scales: { ...opcionesBase.scales, y: { ...opcionesBase.scales.y, min: 0, max: 100, title: { display: true, text: "% de llenado", color: "#8ea0b4" } } } },
  });

  const ultimoNivel = nivel[nivel.length - 1];
  const totalConsumo = registros.reduce((a, r) => a + Math.max(0, r.agua?.consumoM3 || 0), 0);
  let diag = "Sin datos suficientes para diagnóstico.";
  if (ultimoNivel === null || ultimoNivel === undefined) {
    diag = "Falta el dato de nivel de cisterna de la última hora del periodo.";
  } else if (nivel.length) {
    diag =
      ultimoNivel < umbral
        ? `⚠ Nivel actual de cisterna en ${fmt(ultimoNivel)}% (${fmt(volumen[volumen.length - 1])} m³) — por debajo del umbral de ${umbral}%. Coordinar suministro/llenado.`
        : `✓ Nivel de cisterna en ${fmt(ultimoNivel)}% (${fmt(volumen[volumen.length - 1])} m³ de ${fmt(PARAMETROS.cisterna.capacidadM3, 1)} m³). Consumo neto del periodo: ${fmt(totalConsumo, 2)} m³.`;
  }
  document.getElementById("diag-agua").textContent = diag;
}

// ---------------------------------------------------------------------------
// Medidores de agua por área (M4-M16) — ranking de consumo del periodo
// ---------------------------------------------------------------------------
function renderMedidoresAreas(registros) {
  const totales = MEDIDORES_AREA_IDS.map((id) => {
    const meta = MEDIDORES.find((m) => m.id === id);
    const total = registros.reduce((a, r) => a + Math.max(0, r.medidores?.[id]?.consumoM3 || 0), 0);
    return { id, nombre: meta.nombre, total };
  }).sort((a, b) => b.total - a.total); // de mayor a menor consumo — así se lee de un vistazo

  const etiquetas = totales.map((t) => `${t.id.toUpperCase()} · ${t.nombre}`);
  const valores = totales.map((t) => t.total);
  // El mayor consumidor se resalta en rojo/alerta para que salte a la vista;
  // el resto usa la paleta cíclica para poder distinguir cada barra.
  const colores = totales.map((_, i) => (i === 0 ? PALETA.umbral : PALETA_AREAS[i % PALETA_AREAS.length]));

  dibujar("chart-medidores-areas", {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: [{ label: "Consumo del periodo (m³)", data: valores, backgroundColor: colores, borderRadius: 4, barThickness: 18 }],
    },
    options: {
      ...opcionesBase,
      indexAxis: "y", // barras horizontales: mucho más legibles con 13 categorías que un gráfico de líneas
      plugins: { ...opcionesBase.plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8ea0b4" }, grid: { color: "#1a2431" }, title: { display: true, text: "m³ consumidos en el periodo", color: "#8ea0b4" } },
        y: { ticks: { color: "#c9d6e3", font: { size: 11 } }, grid: { display: false } },
      },
    },
  });

  const totalAreas = totales.reduce((a, t) => a + t.total, 0);
  const totalPlanta = registros.reduce((a, r) => a + Math.max(0, r.medidores?.m3?.consumoM3 || 0), 0);
  let diag = "Sin datos suficientes para diagnóstico.";
  if (totales.length && totalAreas > 0) {
    const top = totales[0];
    const pctTop = (top.total / totalAreas) * 100;
    diag = `El área con mayor consumo del periodo es "${top.nombre}" (${fmt(top.total, 1)} m³ — ${fmt(pctTop, 0)}% del total medido por área).`;
    if (totalPlanta > 0) {
      const diferenciaPct = ((totalAreas - totalPlanta) / totalPlanta) * 100;
      diag +=
        Math.abs(diferenciaPct) > 10
          ? ` ⚠ La suma de las 13 áreas (${fmt(totalAreas, 1)} m³) difiere ${fmt(Math.abs(diferenciaPct), 0)}% del medidor maestro M3 · Consumo de planta (${fmt(totalPlanta, 1)} m³) — revisar posibles fugas o un punto de consumo sin medir.`
          : ` ✓ La suma de las 13 áreas coincide razonablemente con el medidor maestro M3 (${fmt(totalPlanta, 1)} m³).`;
    }
  }
  document.getElementById("diag-medidores").textContent = diag;
}

// ---------------------------------------------------------------------------
// Tratamiento de agua — ósmosis (M0 entrada, M1 producto, M2 rechazo)
// ---------------------------------------------------------------------------
function renderOsmosis(registros) {
  const etiquetas = registros.map(etiqueta);
  const entrada = registros.map((r) => r.medidores?.m0?.consumoM3 ?? null);
  const producto = registros.map((r) => r.medidores?.m1?.consumoM3 ?? null);
  const rechazo = registros.map((r) => r.medidores?.m2?.consumoM3 ?? null);

  dibujar("chart-osmosis", {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "M0 · Entrada de pozo (m³/h)", data: entrada, borderColor: PALETA.l1, tension: 0.3, pointRadius: 1.5 },
        { label: "M1 · Producto ósmosis (m³/h)", data: producto, borderColor: PALETA.agua, tension: 0.3, pointRadius: 1.5 },
        { label: "M2 · Rechazo ósmosis (m³/h)", data: rechazo, borderColor: PALETA.umbral, tension: 0.3, pointRadius: 1.5 },
      ],
    },
    options: { ...opcionesBase, scales: { ...opcionesBase.scales, y: { ...opcionesBase.scales.y, title: { display: true, text: "m³ por hora", color: "#8ea0b4" } } } },
  });

  const totalProducto = producto.reduce((a, v) => a + Math.max(0, v || 0), 0);
  const totalRechazo = rechazo.reduce((a, v) => a + Math.max(0, v || 0), 0);
  let diag = "Sin datos suficientes para diagnóstico.";
  const base = totalProducto + totalRechazo;
  if (base > 0) {
    const recuperacionPct = (totalProducto / base) * 100;
    diag = `Recuperación del proceso de ósmosis en el periodo: ${fmt(recuperacionPct, 0)}% (producto: ${fmt(totalProducto, 1)} m³ · rechazo: ${fmt(totalRechazo, 1)} m³).`;
    diag +=
      recuperacionPct < 40
        ? " ⚠ Por debajo del rango típico de ósmosis inversa industrial (40-75%) — revisar membranas o presión de operación."
        : " ✓ Dentro del rango típico de ósmosis inversa industrial (40-75%).";
  }
  document.getElementById("diag-osmosis").textContent = diag;
}

// ---------------------------------------------------------------------------
// GLP — total del banco + detalle por tanque
// ---------------------------------------------------------------------------
function renderGlp(registros) {
  const etiquetas = registros.map(etiqueta);
  const pctTotal = registros.map((r) => r.glp?.pctTotal ?? null);
  const masaTotal = registros.map((r) => r.glp?.masaTotalKg ?? null);
  const umbral = PARAMETROS.glp.umbralBajoPct;

  dibujar("chart-glp-total", {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [
        { label: "GLP banco (%)", data: pctTotal, borderColor: PALETA.glp, backgroundColor: "#c792ea33", fill: true, tension: 0.3, pointRadius: 1.5 },
        lineaUmbral(umbral, etiquetas, `Umbral bajo (${umbral}%)`),
      ],
    },
    options: { ...opcionesBase, scales: { ...opcionesBase.scales, y: { ...opcionesBase.scales.y, min: 0, max: 100, title: { display: true, text: "% del banco (6 tanques)", color: "#8ea0b4" } } } },
  });

  const coloresTanques = [PALETA.l1, PALETA.l2, PALETA.l3, PALETA.potencia, PALETA.glp, PALETA.agua];
  dibujar("chart-glp-tanques", {
    type: "line",
    data: {
      labels: etiquetas,
      datasets: [1, 2, 3, 4, 5, 6].map((n, i) => ({
        label: `Tanque ${n}`,
        data: registros.map((r) => r.glp?.tanques?.[i]?.nivelPct ?? null),
        borderColor: coloresTanques[i],
        tension: 0.3,
        pointRadius: 1,
        borderWidth: 1.5,
      })),
    },
    options: { ...opcionesBase, scales: { ...opcionesBase.scales, y: { ...opcionesBase.scales.y, min: 0, max: 100, title: { display: true, text: "% nivel por tanque", color: "#8ea0b4" } } } },
  });

  const ultimoPct = pctTotal[pctTotal.length - 1];
  const ultimaMasa = masaTotal[masaTotal.length - 1];
  const consumos = registros.map((r) => r.glp?.consumoKgHora).filter((v) => typeof v === "number" && v > 0);
  const promedioConsumoHora = consumos.length ? consumos.reduce((a, b) => a + b, 0) / consumos.length : 0;
  const autonomiaDias = promedioConsumoHora > 0 ? ultimaMasa / (promedioConsumoHora * 24) : null;

  let diag = "Sin datos suficientes para diagnóstico.";
  if (ultimoPct === null || ultimoPct === undefined) {
    diag = "Falta el dato de GLP de la última hora del periodo.";
  } else if (pctTotal.length) {
    const base =
      ultimoPct < umbral
        ? `⚠ Nivel del banco de GLP en ${fmt(ultimoPct)}% (${fmt(ultimaMasa, 0)} kg de ${fmt(PARAMETROS.glp.numTanques * PARAMETROS.glp.capacidadMasaKg, 0)} kg) — por debajo del umbral de ${umbral}%. Coordinar recarga.`
        : `✓ Nivel del banco de GLP en ${fmt(ultimoPct)}% (${fmt(ultimaMasa, 0)} kg de ${fmt(PARAMETROS.glp.numTanques * PARAMETROS.glp.capacidadMasaKg, 0)} kg).`;
    const autonomia = autonomiaDias ? ` Autonomía estimada al ritmo actual: ${fmt(autonomiaDias, 1)} días.` : "";
    diag = base + autonomia;
  }
  document.getElementById("diag-glp").textContent = diag;
  document.getElementById("nota-glp-supuesto").textContent =
    "Nota: el % de cada tanque se calcula asumiendo que el transmisor de campo entrega directamente el nivel (0–100) en su lectura de \"PSI\". Ver comentario en calculos.js si se dispone de la curva de calibración real.";
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------
let actualizando = false; // evita llamadas superpuestas (carga inicial + clic en pestaña + botón)

async function actualizarDashboard() {
  const desde = inputDesde.value;
  const hasta = inputHasta.value;
  if (!desde || !hasta) return;
  if (actualizando) return; // ya hay una actualización en curso, no dispares otra

  actualizando = true;
  btnActualizar.disabled = true;
  try {
    const registros = await cargarRango(desde, hasta);
    if (!registros.length) {
      mostrarToast("No hay lecturas guardadas en ese rango de fechas todavía.", "info");
    }
    renderKPIs(registros);
    renderEnergia(registros);
    renderAgua(registros);
    renderMedidoresAreas(registros);
    renderOsmosis(registros);
    renderGlp(registros);
  } catch (err) {
    console.error(err);
    mostrarToast("Error al leer datos de Firebase: " + err.message, "error");
  } finally {
    btnActualizar.disabled = false;
    actualizando = false;
  }
}

function init() {
  inputHasta.value = hoyISO();
  inputDesde.value = hace(2); // cubre por defecto los últimos 3 días
  btnActualizar.addEventListener("click", actualizarDashboard);
  document.getElementById("tab-dashboard").addEventListener("click", () => {
    // Redibuja al entrar a la pestaña para asegurar tamaños de canvas correctos
    setTimeout(actualizarDashboard, 50);
  });
  actualizarDashboard();
}

init();
