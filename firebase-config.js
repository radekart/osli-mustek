// Sem vlož konfiguraci ze své Firebase konzole (Project settings → Your apps → Web app → Config).
// Dokud tu je null, aplikace funguje, ale ukládá postup jen v zařízení.
// Tyhle údaje nejsou tajné: data chrání pravidla Firestore (soubor firestore.rules).
window.FIREBASE_CONFIG = null;
/* Příklad:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "osli-mustek.firebaseapp.com",
  projectId: "osli-mustek",
  storageBucket: "osli-mustek.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
*/
