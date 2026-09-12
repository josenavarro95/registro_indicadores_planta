// ============================================================================
// ui.js — Utilidades de interfaz compartidas (toasts, formato de números)
// ============================================================================

export function mostrarToast(mensaje, tipo = "info") {
  const cont = document.getElementById("toast-container");
  if (!cont) {
    console.log(`[${tipo}] ${mensaje}`);
    return;
  }
  const el = document.createElement("div");
  el.className = `toast toast--${tipo}`;
  el.textContent = mensaje;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--show"));
  setTimeout(() => {
    el.classList.remove("toast--show");
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

export function fmt(n, decimales = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("es-EC", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function fmtFecha(fechaISO) {
  if (!fechaISO) return "—";
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

export function hoyISO() {
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}
