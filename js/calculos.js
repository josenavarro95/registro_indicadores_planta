// ============================================================================
// calculos.js — Motor de cálculo del Sistema de Monitoreo Integral
// Planta Valdivia, Santa Elena | Red 220V / 3Φ
//
// Todas las fórmulas están documentadas para que puedan auditarse o ajustarse
// a futuro. Este módulo no depende de Firebase ni del DOM: son funciones
// puras, así que se pueden probar de forma aislada (ver /test/calculos.test.js
// si se agrega más adelante).
// ============================================================================

// ---------------------------------------------------------------------------
// PARÁMETROS TÉCNICOS (tomados de la hoja "Parámetros y Cálculos" del Excel
// y de las indicaciones directas de José)
// ---------------------------------------------------------------------------
export const PARAMETROS = {
  energia: {
    voltajeLineaLinea: 220, // V, red trifásica
    factorPotencia: 0.85, // cos φ inductivo estándar de planta industrial
  },
  cisterna: {
    alturaM: 1.9,
    anchoM: 4.3,
    largoM: 6.7,
    // Capacidad geométrica exacta (alto x ancho x largo). Da 54.79 m³;
    // José la referencia como "55 m³" nominal — se muestra redondeada en la UI
    // pero el cálculo usa el valor exacto para no perder precisión.
    get capacidadM3() {
      return this.alturaM * this.anchoM * this.largoM;
    },
    capacidadNominalM3: 55,
    // Umbral de alerta por nivel bajo (% de llenado)
    umbralBajoPct: 20,
  },
  glp: {
    numTanques: 6,
    capacidadVolumetricaL: 7500, // por tanque, placa de fabricante
    capacidadMasaKg: 4050, // por tanque, a densidad 0.54 kg/L
    densidadKgL: 0.54,
    factorPsiAKgCm2: 0.070307, // conversión exacta PSI -> kg/cm²
    // Umbral de alerta por nivel bajo (% de llenado, sobre masa total del banco)
    umbralBajoPct: 15,
  },
};

// ---------------------------------------------------------------------------
// SUPUESTO DE CÁLCULO — GLP (léase antes de usar en producción)
// ---------------------------------------------------------------------------
// El Excel de referencia trae, por cada uno de los 6 tanques, una lectura de
// "Presión GLP en campo (PSI)" que en los datos reales se mueve en un rango
// estrecho (58–85) y decrece de forma gradual y monótona turno a turno — el
// comportamiento típico de un indicador de NIVEL, no de presión de vapor real
// (la presión de vapor de una mezcla GLP depende sobre todo de la temperatura
// ambiente y no cae así de forma continua con el consumo).
//
// Por eso, para este prototipo, se asume que el manómetro/transmisor de cada
// tanque está calibrado en una escala 0–100 que se lee directamente como
// PORCENTAJE DE LLENADO (aunque la etiqueta de campo diga "PSI"), es decir:
//     nivelPct = clamp(psi, 0, 100)
//     masaKg   = nivelPct/100 * capacidadMasaKg
//     volumenL = nivelPct/100 * capacidadVolumetricaL
// El campo kg/cm² SÍ es una conversión física real (PSI x 0.070307) y se
// muestra solo como referencia de presión, no se usa para calcular masa.
//
// Esto es un supuesto de ingeniería para poder avanzar con el prototipo.
// Cuando tengas la curva de calibración real del transmisor (PSI a 0% y PSI
// a 100% de cada tanque), reemplaza `nivelPctDesdePsi()` por la interpolación
// lineal correcta — es el único punto que hay que tocar.
function nivelPctDesdePsi(psi) {
  if (psi === null || psi === undefined || Number.isNaN(psi)) return null;
  return Math.min(100, Math.max(0, psi));
}

// ---------------------------------------------------------------------------
// Turnos operativos (horarios reales tomados del Excel: 6 + 8 + 10 = 24 h)
// ---------------------------------------------------------------------------
export const TURNOS = [
  { id: "T1", nombre: "Turno 1 - Noche", horas: [19, 20, 21, 22, 23, 0] },
  { id: "T2", nombre: "Turno 2 - Madrugada", horas: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "T3", nombre: "Turno 3 - Día/Tarde", horas: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
];

export function turnoDeHora(horaStr) {
  const h = parseInt(String(horaStr).split(":")[0], 10);
  const turno = TURNOS.find((t) => t.horas.includes(h));
  return turno ? turno.nombre : "Sin turno";
}

export function horasDelDia() {
  // 00:00 .. 23:00 en orden natural para los selectores de la UI
  return Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
}

// ---------------------------------------------------------------------------
// ENERGÍA ELÉCTRICA
// ---------------------------------------------------------------------------
function promedio(valores) {
  const validos = valores.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!validos.length) return 0;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

export function calcularEnergia({ corrienteL1, corrienteL2, corrienteL3 }) {
  const i1 = Number(corrienteL1) || 0;
  const i2 = Number(corrienteL2) || 0;
  const i3 = Number(corrienteL3) || 0;
  const promAmp = promedio([i1, i2, i3]);

  // Potencia activa trifásica: P(kW) = √3 x V_LL x I_prom x cosφ / 1000
  const potenciaKw =
    (Math.sqrt(3) * PARAMETROS.energia.voltajeLineaLinea * promAmp * PARAMETROS.energia.factorPotencia) / 1000;

  // Energía en el intervalo horario (1 h): kWh = kW x 1h
  const energiaKwh = potenciaKw;

  // Desbalance de corrientes (NEMA simplificado): máxima desviación respecto
  // al promedio, expresada como % del promedio.
  let desbalancePct = 0;
  if (promAmp > 0) {
    const desviaciones = [i1, i2, i3].map((i) => Math.abs(i - promAmp));
    desbalancePct = (Math.max(...desviaciones) / promAmp) * 100;
  }

  return {
    corrienteL1: i1,
    corrienteL2: i2,
    corrienteL3: i3,
    promAmp: round2(promAmp),
    potenciaKw: round2(potenciaKw),
    energiaKwh: round2(energiaKwh),
    desbalancePct: round2(desbalancePct),
  };
}

// ---------------------------------------------------------------------------
// AGUA POTABLE (CISTERNA)
// ---------------------------------------------------------------------------
export function calcularAgua({ nivelCisternaPct }, anterior) {
  const pct = Math.min(100, Math.max(0, Number(nivelCisternaPct) || 0));
  const alturaM = (pct / 100) * PARAMETROS.cisterna.alturaM;
  const volumenM3 = (pct / 100) * PARAMETROS.cisterna.capacidadM3;

  let consumoM3 = null;
  if (anterior && typeof anterior.agua?.volumenM3 === "number") {
    // Positivo = consumo (bajó el nivel); negativo = se llenó la cisterna
    consumoM3 = anterior.agua.volumenM3 - volumenM3;
  }

  return {
    nivelPct: round2(pct),
    alturaM: round3(alturaM),
    volumenM3: round3(volumenM3),
    consumoM3: consumoM3 === null ? null : round3(consumoM3),
  };
}

// ---------------------------------------------------------------------------
// GLP — banco de 6 tanques
// ---------------------------------------------------------------------------
export function calcularGlp({ glpPsi }, anterior) {
  const psis = (glpPsi || []).slice(0, PARAMETROS.glp.numTanques);
  while (psis.length < PARAMETROS.glp.numTanques) psis.push(null);

  const tanques = psis.map((psiRaw, idx) => {
    const psi = psiRaw === null || psiRaw === undefined || psiRaw === "" ? null : Number(psiRaw);
    const kgcm2 = psi === null ? null : round3(psi * PARAMETROS.glp.factorPsiAKgCm2);
    const nivelPct = nivelPctDesdePsi(psi);
    const masaKg = nivelPct === null ? null : round2((nivelPct / 100) * PARAMETROS.glp.capacidadMasaKg);
    const volumenL = nivelPct === null ? null : round2((nivelPct / 100) * PARAMETROS.glp.capacidadVolumetricaL);
    return { numero: idx + 1, psi, kgcm2, nivelPct: nivelPct === null ? null : round2(nivelPct), masaKg, volumenL };
  });

  const psisValidos = tanques.map((t) => t.psi).filter((v) => v !== null);
  const masasValidas = tanques.map((t) => t.masaKg).filter((v) => v !== null);
  const volumenesValidos = tanques.map((t) => t.volumenL).filter((v) => v !== null);

  const promPsi = psisValidos.length ? round2(promedio(psisValidos)) : null;
  const promKgcm2 = promPsi === null ? null : round3(promPsi * PARAMETROS.glp.factorPsiAKgCm2);
  const masaTotalKg = masasValidas.length ? round2(masasValidas.reduce((a, b) => a + b, 0)) : null;
  const volumenTotalL = volumenesValidos.length ? round2(volumenesValidos.reduce((a, b) => a + b, 0)) : null;
  const capacidadTotalKg = PARAMETROS.glp.numTanques * PARAMETROS.glp.capacidadMasaKg;
  const pctTotal = masaTotalKg === null ? null : round2((masaTotalKg / capacidadTotalKg) * 100);

  let consumoKgHora = null;
  if (anterior && typeof anterior.glp?.masaTotalKg === "number" && masaTotalKg !== null) {
    // Positivo = consumo (bajó la masa); negativo = recarga de tanques
    consumoKgHora = round2(anterior.glp.masaTotalKg - masaTotalKg);
  }

  return { tanques, promPsi, promKgcm2, masaTotalKg, volumenTotalL, pctTotal, capacidadTotalKg, consumoKgHora };
}

// ---------------------------------------------------------------------------
// Registro completo (une los tres bloques + metadatos)
// ---------------------------------------------------------------------------
export function calcularRegistro(input, anterior = null) {
  return {
    fecha: input.fecha,
    hora: input.hora,
    turno: turnoDeHora(input.hora),
    estado: input.estado || "OK",
    operador: input.operador || "",
    energia: calcularEnergia(input),
    agua: calcularAgua(input, anterior),
    glp: calcularGlp(input, anterior),
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

export function fechaHoraOrdenable(fecha, hora) {
  // "2026-09-10" + "08:00" -> "2026-09-10T08:00" (ordenable como string/ISO)
  return `${fecha}T${hora}`;
}

export function docIdFechaHora(fecha, hora) {
  return `${fecha}_${hora.replace(":", "")}`;
}

// Siguiente hora en el tiempo, cruzando de fecha automáticamente después de
// las 23:00 -> 00:00 del día siguiente. Útil para el flujo de "guardar y
// pasar a la hora siguiente" del formulario de registro.
export function siguienteHoraFecha(fecha, hora) {
  const h = parseInt(hora.split(":")[0], 10);
  if (h >= 23) {
    const d = new Date(`${fecha}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const nuevaFecha = d.toISOString().slice(0, 10);
    return { fecha: nuevaFecha, hora: "00:00" };
  }
  return { fecha, hora: `${String(h + 1).padStart(2, "0")}:00` };
}
