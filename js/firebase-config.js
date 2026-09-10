// ============================================================================
// firebase-config.js — Credenciales del proyecto de Firebase "Datos consumo
// planta" (datos-consumo-planta). Ya configurado, no necesitas tocar nada más
// aquí.
//
// El apiKey de una app web de Firebase NO es secreto (identifica el proyecto,
// no autoriza nada por sí solo) — lo que realmente protege tus datos son las
// reglas de Firestore (ver firestore.rules). Aun así, no subas este archivo
// con las credenciales reales a un repositorio PÚBLICO sin revisar antes tus
// reglas de seguridad.
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDduwRYrzAXu4_PXZGuEtushvY4Ypb8RUk",
  authDomain: "datos-consumo-planta.firebaseapp.com",
  projectId: "datos-consumo-planta",
  storageBucket: "datos-consumo-planta.firebasestorage.app",
  messagingSenderId: "1063418663864",
  appId: "1:1063418663864:web:4cd22759ed5a0474cd754d",
};

// Nombre de la colección en Firestore donde se guarda cada lectura horaria.
export const COLECCION_LECTURAS = "lecturas";
