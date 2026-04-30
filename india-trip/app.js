import { auth, db } from "../js/firebase-config.js";
import {
  signIn,
  signOutUser,
  onAuthStateChanged,
  isAllowed,
  getMyRequest,
  requestAccess,
} from "../js/access.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const TRIP_ID = "india-2026";
const TYPES = ["travel", "lodging", "site", "meal", "other"];

const els = {
  who: document.getElementById("who"),
  signIn: document.getElementById("signin-btn"),
  signOut: document.getElementById("signout-btn"),
  addBtn: document.getElementById("add-entry-btn"),
  notice: document.getElementById("access-notice"),
  timeline: document.getElementById("timeline"),
  modalRoot: document.getElementById("modal-root"),
  statDates: document.getElementById("stat-dates"),
  statCount: document.getElementById("stat-count"),
  statCost: document.getElementById("stat-cost"),
};

let currentUser = null;
let canEdit = false;
let items = [];

els.signIn.addEventListener("click", () =>
  signIn().catch((e) => alert("Sign-in failed: " + e.message)),
);
els.signOut.addEventListener("click", () => signOutUser());
els.addBtn.addEventListener("click", () => openModal(null));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  await refreshAccessUi();
});

async function refreshAccessUi() {
  if (!currentUser) {
    els.who.textContent = "";
    els.signIn.classList.remove("hidden");
    els.signOut.classList.add("hidden");
    els.addBtn.classList.add("hidden");
    els.notice.classList.add("hidden");
    canEdit = false;
    rerender();
    return;
  }

  els.who.textContent = currentUser.displayName || currentUser.email;
  els.signIn.classList.add("hidden");
  els.signOut.classList.remove("hidden");

  const allowed = await isAllowed(currentUser);
  canEdit = allowed;

  if (allowed) {
    els.addBtn.classList.remove("hidden");
    els.notice.classList.add("hidden");
  } else {
    els.addBtn.classList.add("hidden");
    await renderRequestNotice();
  }

  rerender();
}

async function renderRequestNotice() {
  const existing = await getMyRequest(currentUser);
  els.notice.classList.remove("hidden");
  els.notice.classList.add("warn");

  if (!existing) {
    els.notice.innerHTML = `
      <strong>You're signed in but don't have edit access.</strong>
      <p>Request access and the admin will review it.</p>
      <button id="request-btn" class="primary">Request access</button>
    `;
    document
      .getElementById("request-btn")
      .addEventListener("click", async (e) => {
        e.target.disabled = true;
        try {
          await requestAccess(currentUser);
          await renderRequestNotice();
        } catch (err) {
          alert("Could not submit request: " + err.message);
          e.target.disabled = false;
        }
      });
    return;
  }

  if (existing.status === "pending") {
    els.notice.innerHTML = `
      <strong>Your request to edit is pending review.</strong>
      <p>You can still view the itinerary below.</p>
    `;
  } else if (existing.status === "denied") {
    els.notice.innerHTML = `
      <strong>Your previous request was not approved.</strong>
      <p>Reach out to the admin if you think this was a mistake.</p>
    `;
  } else if (existing.status === "approved") {
    els.notice.innerHTML = `
      <strong>You're approved!</strong>
      <p>If editing isn't enabled, refresh the page.</p>
    `;
  }
}

// Live itinerary subscription — runs regardless of auth state (public read).
const tripQuery = query(
  collection(db, "itinerary_items"),
  where("tripId", "==", TRIP_ID),
  orderBy("date", "asc"),
);
onSnapshot(
  tripQuery,
  (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rerender();
  },
  (err) => {
    console.error("Itinerary subscription error", err);
    els.timeline.innerHTML = `<p class="empty">Couldn't load itinerary: ${escapeHtml(err.message)}</p>`;
  },
);

function rerender() {
  renderSummary();
  renderTimeline();
}

function renderSummary() {
  els.statCount.textContent = String(items.length);
  if (items.length === 0) {
    els.statDates.textContent = "—";
    els.statCost.textContent = "—";
    return;
  }
  const dates = items
    .map((i) => i.date?.toDate?.())
    .filter(Boolean)
    .sort((a, b) => a - b);
  const ends = items
    .map((i) => i.endDate?.toDate?.() || i.date?.toDate?.())
    .filter(Boolean)
    .sort((a, b) => a - b);
  const start = dates[0];
  const end = ends[ends.length - 1];
  els.statDates.textContent =
    start && end
      ? `${formatDate(start)} – ${formatDate(end)}`
      : start
        ? formatDate(start)
        : "—";

  const totals = {};
  for (const item of items) {
    if (typeof item.cost === "number" && !Number.isNaN(item.cost)) {
      const cur = item.currency || "USD";
      totals[cur] = (totals[cur] || 0) + item.cost;
    }
  }
  const parts = Object.entries(totals).map(
    ([cur, amt]) => `${formatMoney(amt)} ${cur}`,
  );
  els.statCost.textContent = parts.length ? parts.join(" · ") : "—";
}

function renderTimeline() {
  if (items.length === 0) {
    els.timeline.innerHTML =
      '<p class="empty">No itinerary entries yet. ' +
      (canEdit ? "Click + Add entry to create one." : "") +
      "</p>";
    return;
  }
  const groups = new Map();
  for (const item of items) {
    const d = item.date?.toDate?.();
    const key = d ? d.toISOString().slice(0, 10) : "undated";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const sortedKeys = [...groups.keys()].sort();
  els.timeline.innerHTML = sortedKeys
    .map((key) => {
      const dayItems = groups.get(key);
      const headerLabel =
        key === "undated"
          ? "Undated"
          : formatDayHeader(dayItems[0].date.toDate());
      return `
        <section class="day">
          <h3 class="day-header">${escapeHtml(headerLabel)}</h3>
          <div class="entries">
            ${dayItems.map(renderEntry).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  if (canEdit) {
    els.timeline.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === btn.dataset.edit);
        if (item) openModal(item);
      });
    });
    els.timeline.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = items.find((i) => i.id === btn.dataset.delete);
        if (!item) return;
        if (!confirm(`Delete "${item.location || "(no location)"}"?`)) return;
        try {
          await deleteDoc(doc(db, "itinerary_items", item.id));
        } catch (err) {
          alert("Delete failed: " + err.message);
        }
      });
    });
  }
}

function renderEntry(item) {
  const type = TYPES.includes(item.type) ? item.type : "other";
  const time = item.date?.toDate?.();
  const timeStr =
    time && !isAllDay(item)
      ? time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
  const meta = [];
  if (item.cost != null && !Number.isNaN(item.cost)) {
    meta.push(`${formatMoney(item.cost)} ${item.currency || "USD"}`);
  }
  if (item.attendees && item.attendees.length) {
    meta.push(item.attendees.join(", "));
  }
  if (item.endDate?.toDate) {
    const start = item.date?.toDate?.();
    const end = item.endDate.toDate();
    if (start && end && start.toDateString() !== end.toDateString()) {
      meta.push(`through ${formatDate(end)}`);
    }
  }
  const links = (item.links || [])
    .filter(Boolean)
    .map(
      (l) =>
        `<a class="btn" href="${escapeAttr(l)}" target="_blank" rel="noopener">Link</a>`,
    )
    .join("");

  return `
    <article class="entry type-${type}">
      <div class="entry-head">
        <div>
          <div class="entry-title">${escapeHtml(item.location || "(no location)")}</div>
          ${timeStr ? `<div class="entry-time">${escapeHtml(timeStr)}</div>` : ""}
        </div>
        <span class="entry-type-pill">${escapeHtml(type)}</span>
      </div>
      ${meta.length ? `<div class="entry-meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div>` : ""}
      ${item.notes ? `<div class="entry-notes">${escapeHtml(item.notes)}</div>` : ""}
      ${links ? `<div class="entry-links">${links}</div>` : ""}
      ${
        canEdit
          ? `<div class="entry-actions">
               <button data-edit="${item.id}">Edit</button>
               <button class="danger" data-delete="${item.id}">Delete</button>
             </div>`
          : ""
      }
    </article>
  `;
}

function isAllDay(item) {
  const d = item.date?.toDate?.();
  if (!d) return true;
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function openModal(existing) {
  const isEdit = !!existing;
  const startDate = existing?.date?.toDate?.();
  const endDate = existing?.endDate?.toDate?.();
  const dateStr = startDate ? toDateInput(startDate) : "";
  const timeStr = startDate && !isAllDay(existing) ? toTimeInput(startDate) : "";
  const endStr = endDate ? toDateInput(endDate) : "";

  els.modalRoot.innerHTML = `
    <div class="modal-backdrop" id="backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${isEdit ? "Edit entry" : "Add entry"}</h2>
        <form id="entry-form">
          <div class="form-grid">
            <div class="form-row">
              <label for="f-date">Date</label>
              <input id="f-date" name="date" type="date" required value="${escapeAttr(dateStr)}" />
            </div>
            <div class="form-row">
              <label for="f-time">Time (optional)</label>
              <input id="f-time" name="time" type="time" value="${escapeAttr(timeStr)}" />
            </div>
          </div>
          <div class="checkbox-row">
            <input id="f-multiday" name="multiday" type="checkbox" ${endStr ? "checked" : ""} />
            <label for="f-multiday" style="margin:0;color:var(--muted);">Multi-day (set end date)</label>
          </div>
          <div class="form-row" id="enddate-row" style="${endStr ? "" : "display:none;"}">
            <label for="f-enddate">End date</label>
            <input id="f-enddate" name="endDate" type="date" value="${escapeAttr(endStr)}" />
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label for="f-type">Type</label>
              <select id="f-type" name="type">
                ${TYPES.map((t) => `<option value="${t}" ${existing?.type === t ? "selected" : ""}>${t}</option>`).join("")}
              </select>
            </div>
            <div class="form-row">
              <label for="f-location">Location / Title</label>
              <input id="f-location" name="location" type="text" required value="${escapeAttr(existing?.location || "")}" />
            </div>
          </div>
          <div class="form-row">
            <label for="f-notes">Notes</label>
            <textarea id="f-notes" name="notes">${escapeHtml(existing?.notes || "")}</textarea>
          </div>
          <div class="form-row">
            <label for="f-links">Links (one URL per line)</label>
            <textarea id="f-links" name="links">${escapeHtml((existing?.links || []).join("\n"))}</textarea>
          </div>
          <div class="form-grid">
            <div class="form-row">
              <label for="f-cost">Cost (optional)</label>
              <input id="f-cost" name="cost" type="number" step="0.01" min="0" value="${existing?.cost != null ? existing.cost : ""}" />
            </div>
            <div class="form-row">
              <label for="f-currency">Currency</label>
              <input id="f-currency" name="currency" type="text" value="${escapeAttr(existing?.currency || "USD")}" />
            </div>
          </div>
          <div class="form-row">
            <label for="f-attendees">Attendees (comma separated)</label>
            <input id="f-attendees" name="attendees" type="text" value="${escapeAttr((existing?.attendees || []).join(", "))}" />
          </div>
          <div class="modal-actions">
            <button type="button" id="cancel-btn">Cancel</button>
            <button type="submit" class="primary">${isEdit ? "Save" : "Add"}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const backdrop = document.getElementById("backdrop");
  const form = document.getElementById("entry-form");
  const multiday = document.getElementById("f-multiday");
  const endRow = document.getElementById("enddate-row");

  multiday.addEventListener("change", () => {
    endRow.style.display = multiday.checked ? "" : "none";
  });
  document
    .getElementById("cancel-btn")
    .addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = formToData(form);
    try {
      if (isEdit) {
        await updateDoc(doc(db, "itinerary_items", existing.id), {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "itinerary_items"), {
          ...data,
          tripId: TRIP_ID,
          createdBy: currentUser?.uid || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      closeModal();
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  });
}

function closeModal() {
  els.modalRoot.innerHTML = "";
}

function formToData(form) {
  const fd = new FormData(form);
  const dateStr = fd.get("date");
  const timeStr = fd.get("time");
  const date = combineDateTime(dateStr, timeStr);

  const multiday = form.querySelector("#f-multiday").checked;
  const endStr = fd.get("endDate");
  const endDate = multiday && endStr ? combineDateTime(endStr, "") : null;

  const costRaw = fd.get("cost");
  const cost = costRaw === "" || costRaw == null ? null : Number(costRaw);

  const links = (fd.get("links") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const attendees = (fd.get("attendees") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    date,
    endDate,
    type: fd.get("type"),
    location: (fd.get("location") || "").trim(),
    notes: (fd.get("notes") || "").trim(),
    links,
    cost: cost != null && !Number.isNaN(cost) ? cost : null,
    currency: (fd.get("currency") || "USD").trim().toUpperCase() || "USD",
    attendees,
  };
}

function combineDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  let h = 0,
    min = 0;
  if (timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    h = hh || 0;
    min = mm || 0;
  }
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function toDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function toTimeInput(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDayHeader(d) {
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatDate(d) {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function formatMoney(n) {
  return n.toLocaleString([], { maximumFractionDigits: 2 });
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
