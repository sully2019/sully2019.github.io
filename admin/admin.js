import { auth, db } from "../js/firebase-config.js";
import {
  signIn,
  signOutUser,
  onAuthStateChanged,
  isAdmin,
} from "../js/access.js";
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  setDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const els = {
  who: document.getElementById("who"),
  signIn: document.getElementById("signin-btn"),
  signOut: document.getElementById("signout-btn"),
  gate: document.getElementById("gate"),
  gateMsg: document.getElementById("gate-msg"),
  body: document.getElementById("admin-body"),
  pending: document.getElementById("pending-list"),
  chips: document.getElementById("chips"),
  addForm: document.getElementById("add-form"),
  addEmail: document.getElementById("add-email"),
  history: document.getElementById("history-list"),
};

let unsubReqs = null;
let unsubAllowlist = null;
let allRequests = [];
let allowlist = [];

els.signIn.addEventListener("click", () =>
  signIn().catch((e) => alert("Sign-in failed: " + e.message)),
);
els.signOut.addEventListener("click", () => signOutUser());

els.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = els.addEmail.value.trim().toLowerCase();
  if (!email) return;
  if (allowlist.includes(email)) {
    els.addEmail.value = "";
    return;
  }
  try {
    const ref = doc(db, "config", "allowlist");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { emails: arrayUnion(email) });
    } else {
      await setDoc(ref, { emails: [email] });
    }
    els.addEmail.value = "";
  } catch (err) {
    alert("Failed to add: " + err.message);
  }
});

onAuthStateChanged(auth, (user) => {
  cleanupSubs();
  if (!user) {
    els.who.textContent = "";
    els.signIn.classList.remove("hidden");
    els.signOut.classList.add("hidden");
    els.gate.classList.remove("hidden");
    els.gateMsg.textContent = "Sign in with the admin Google account.";
    els.body.classList.add("hidden");
    return;
  }
  els.who.textContent = user.displayName || user.email;
  els.signIn.classList.add("hidden");
  els.signOut.classList.remove("hidden");

  if (!isAdmin(user)) {
    els.gate.classList.remove("hidden");
    els.gateMsg.textContent = `${user.email} is not an admin.`;
    els.body.classList.add("hidden");
    return;
  }

  els.gate.classList.add("hidden");
  els.body.classList.remove("hidden");
  subscribe();
});

function cleanupSubs() {
  if (unsubReqs) {
    unsubReqs();
    unsubReqs = null;
  }
  if (unsubAllowlist) {
    unsubAllowlist();
    unsubAllowlist = null;
  }
}

function subscribe() {
  unsubReqs = onSnapshot(
    query(collection(db, "access_requests"), orderBy("requestedAt", "desc")),
    (snap) => {
      allRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderRequests();
    },
    (err) => {
      els.pending.innerHTML = `<p class="empty-row">Error: ${escapeHtml(err.message)}</p>`;
    },
  );
  unsubAllowlist = onSnapshot(
    doc(db, "config", "allowlist"),
    (snap) => {
      allowlist = snap.exists() && Array.isArray(snap.data().emails)
        ? snap.data().emails
        : [];
      renderAllowlist();
    },
    (err) => {
      els.chips.innerHTML = `<p class="empty-row">Error: ${escapeHtml(err.message)}</p>`;
    },
  );
}

function renderRequests() {
  const pending = allRequests.filter((r) => r.status === "pending");
  const decided = allRequests.filter((r) => r.status !== "pending");

  if (pending.length === 0) {
    els.pending.innerHTML =
      '<p class="empty-row">No pending requests.</p>';
  } else {
    els.pending.innerHTML = pending.map(renderReqRow).join("");
    els.pending.querySelectorAll("[data-approve]").forEach((b) =>
      b.addEventListener("click", () => approve(b.dataset.approve)),
    );
    els.pending.querySelectorAll("[data-deny]").forEach((b) =>
      b.addEventListener("click", () => deny(b.dataset.deny)),
    );
  }

  if (decided.length === 0) {
    els.history.innerHTML = '<p class="empty-row">No history yet.</p>';
  } else {
    els.history.innerHTML = decided.map(renderHistoryRow).join("");
  }
}

function renderReqRow(r) {
  const requested = r.requestedAt?.toDate?.();
  return `
    <div class="req-row">
      <div class="req-info">
        <div class="who">${escapeHtml(r.displayName || r.email)}</div>
        <div class="meta">${escapeHtml(r.email)} · requested ${requested ? requested.toLocaleString() : "—"}</div>
      </div>
      <div class="req-actions">
        <button class="primary" data-approve="${r.id}">Approve</button>
        <button class="danger" data-deny="${r.id}">Deny</button>
      </div>
    </div>
  `;
}

function renderHistoryRow(r) {
  const decided = r.decidedAt?.toDate?.();
  return `
    <div class="req-row">
      <div class="req-info">
        <div class="who">${escapeHtml(r.displayName || r.email)} <span class="meta">— ${escapeHtml(r.status)}</span></div>
        <div class="meta">${escapeHtml(r.email)}${decided ? " · " + decided.toLocaleString() : ""}</div>
      </div>
    </div>
  `;
}

function renderAllowlist() {
  if (allowlist.length === 0) {
    els.chips.innerHTML = '<p class="empty-row">Allowlist is empty.</p>';
    return;
  }
  els.chips.innerHTML = allowlist
    .map(
      (email) =>
        `<span class="chip">${escapeHtml(email)}<button data-remove="${escapeAttr(email)}" title="Remove">×</button></span>`,
    )
    .join("");
  els.chips.querySelectorAll("[data-remove]").forEach((b) => {
    b.addEventListener("click", () => removeEmail(b.dataset.remove));
  });
}

async function approve(reqId) {
  const reqRef = doc(db, "access_requests", reqId);
  const allowRef = doc(db, "config", "allowlist");
  try {
    await runTransaction(db, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error("Request not found");
      const email = reqSnap.data().email;
      const allowSnap = await tx.get(allowRef);
      const emails =
        allowSnap.exists() && Array.isArray(allowSnap.data().emails)
          ? allowSnap.data().emails
          : [];
      if (!emails.includes(email)) {
        if (allowSnap.exists()) {
          tx.update(allowRef, { emails: [...emails, email] });
        } else {
          tx.set(allowRef, { emails: [email] });
        }
      }
      tx.update(reqRef, {
        status: "approved",
        decidedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    alert("Approve failed: " + err.message);
  }
}

async function deny(reqId) {
  if (!confirm("Deny this request?")) return;
  try {
    await updateDoc(doc(db, "access_requests", reqId), {
      status: "denied",
      decidedAt: serverTimestamp(),
    });
  } catch (err) {
    alert("Deny failed: " + err.message);
  }
}

async function removeEmail(email) {
  if (!confirm(`Remove ${email} from the allowlist?`)) return;
  try {
    await updateDoc(doc(db, "config", "allowlist"), {
      emails: arrayRemove(email),
    });
  } catch (err) {
    alert("Remove failed: " + err.message);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
