// ============================================================================
// firebase-init.js — Inicializa Firebase (App + Firestore) usando el SDK
// modular servido desde gstatic (no requiere npm/bundler; funciona abriendo
// index.html directamente o publicado en GitHub Pages).
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig, COLECCION_LECTURAS } from "./firebase-config.js";

// True solo si alguien ya reemplazó los valores de plantilla ("TU_...") en
// firebase-config.js por las credenciales reales del proyecto. Se usa para
// mostrar un aviso claro en la interfaz en vez de dejarla "congelada" sin
// explicación cuando Firebase todavía no está configurado.
export const configuracionValida = Boolean(firebaseConfig.apiKey) && !String(firebaseConfig.apiKey).startsWith("TU_");

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const lecturasRef = collection(db, COLECCION_LECTURAS);

export { doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, writeBatch };
