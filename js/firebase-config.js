import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// Replace this object with the config from the Firebase console:
//   Project Settings → General → Your apps → Web app → SDK setup and configuration → Config.
// Committing the web apiKey is intentional — see CLAUDE.md.
export const firebaseConfig = {
  apiKey: "AIzaSyAoFqCtAXFtMlYrFDhi79qFhuDMMACVom0",
  authDomain: "trip-itin-planner.firebaseapp.com",
  projectId: "trip-itin-planner",
  storageBucket: "trip-itin-planner.firebasestorage.app",
  messagingSenderId: "442500499797",
  appId: "1:442500499797:web:87074c612c5fc897d207dc",
  measurementId: "G-HEKM5BQLGP"
};

//export const firebaseConfig = {
//  apiKey: "REPLACE_ME",
//  authDomain: "REPLACE_ME.firebaseapp.com",
//  projectId: "REPLACE_ME",
//  storageBucket: "REPLACE_ME.appspot.com",
//  messagingSenderId: "REPLACE_ME",
//  appId: "REPLACE_ME",
//};

export const ADMIN_EMAIL = "jgsarmy@gmail.com";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
