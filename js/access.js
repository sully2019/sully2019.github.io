import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { auth, db, googleProvider, ADMIN_EMAIL } from "./firebase-config.js";

export { onAuthStateChanged };

export function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function isAdmin(user) {
  return !!user && user.email === ADMIN_EMAIL;
}

export async function fetchAllowlist() {
  const snap = await getDoc(doc(db, "config", "allowlist"));
  if (!snap.exists()) return [];
  const data = snap.data();
  return Array.isArray(data.emails) ? data.emails : [];
}

export async function isAllowed(user) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  const emails = await fetchAllowlist();
  return emails.includes(user.email);
}

export async function getMyRequest(user) {
  if (!user) return null;
  const q = query(
    collection(db, "access_requests"),
    where("uid", "==", user.uid),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  // If multiple, prefer pending, then most recent.
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const pending = docs.find((d) => d.status === "pending");
  if (pending) return pending;
  return docs.sort((a, b) => {
    const at = a.requestedAt?.toMillis?.() ?? 0;
    const bt = b.requestedAt?.toMillis?.() ?? 0;
    return bt - at;
  })[0];
}

export async function requestAccess(user) {
  if (!user) throw new Error("Not signed in");
  return addDoc(collection(db, "access_requests"), {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email,
    requestedAt: serverTimestamp(),
    status: "pending",
    decidedAt: null,
  });
}

// Subscribe to pending request count (used for the admin badge on the hub).
// Callback receives a number. Returns the unsubscribe fn.
export function watchPendingRequestCount(callback) {
  const q = query(
    collection(db, "access_requests"),
    where("status", "==", "pending"),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.size),
    () => callback(0),
  );
}
