# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static GitHub Pages site at `https://sully2019.github.io` that acts as a hub of small family apps. The first sub-app is an India trip itinerary planner. Architecture is intentionally minimal: vanilla HTML/CSS/JS with ES modules, no build step, push to `master` and it's live.

## Architecture

- **`/index.html`** — hub landing page; lists sub-apps as cards. The Admin card only renders when signed in as the admin email.
- **`/<sub-app>/index.html` + JS + CSS** — each sub-app lives in its own folder. Currently: `india-trip/`, `admin/`.
- **`js/firebase-config.js`** — single Firebase init; exports `app`, `auth`, `db`, `googleProvider`, plus `ADMIN_EMAIL`. Imported by every page that needs Firebase.
- **`js/access.js`** — shared sign-in / allowlist / request helpers. Both `india-trip` and `admin` import from here.
- **`styles/shared.css`** — shared design tokens (colors, spacing, buttons, cards). Each sub-app adds its own `styles.css` for app-specific layout.

To add a sub-app: create a folder, add `index.html` (link `../styles/shared.css` and any local CSS), import from `../js/firebase-config.js` and `../js/access.js`, then add a card in `/index.html`.

## Backend (Firebase)

The site stores data in Firestore and authenticates via Firebase Auth (Google sign-in only).

**Firebase web config is intentionally committed** to `js/firebase-config.js`. The web `apiKey` is a project identifier, not a secret — Google designs it to be public. Real security comes from Firestore rules and the list of authorized domains. Do **not** "fix" this by removing the key, moving it to env vars, or adding a build step.

### Firestore data model

- **`config/allowlist`** — single doc, `{ emails: string[] }`. The list of email addresses allowed to edit.
- **`access_requests/{autoId}`** — `{ uid, email, displayName, requestedAt, status: "pending"|"approved"|"denied", decidedAt }`.
- **`itinerary_items/{autoId}`** — `{ tripId, date, endDate, location, type, notes, links, cost, currency, attendees, createdBy, createdAt, updatedAt }`. `tripId` is `"india-2026"` for the India trip; the field exists so future trips can share the collection.

### Firestore security rules

Paste these into Firebase console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null
        && request.auth.token.email == 'jgsarmy@gmail.com';
    }

    function isAllowed() {
      return request.auth != null
        && request.auth.token.email in
           get(/databases/$(database)/documents/config/allowlist).data.emails;
    }

    match /config/allowlist {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /access_requests/{reqId} {
      allow read:   if isAdmin() || (request.auth != null
                                     && resource.data.uid == request.auth.uid);
      allow create: if request.auth != null
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.email == request.auth.token.email
                    && request.resource.data.status == 'pending';
      allow update, delete: if isAdmin();
    }

    match /itinerary_items/{itemId} {
      allow read:  if true;
      allow write: if isAllowed();
    }
  }
}
```

The admin email is hardcoded in **two** places — these rules and `js/firebase-config.js` (`ADMIN_EMAIL`). Keep them in sync. If a co-admin is ever added, switch to a `config/admins` doc lookup in both spots.

### One-time Firebase setup (when first creating the project)

1. Create a free Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Firestore Database** (production mode).
3. Enable **Authentication → Google** as a sign-in provider.
4. Authentication → Settings → Authorized domains: add `sully2019.github.io` (and `localhost` for local dev — usually pre-added).
5. Project Settings → General → Your apps → Web app → register an app → copy the config object into `js/firebase-config.js` (replacing the `REPLACE_ME` values).
6. Firestore → seed: create document `config/allowlist` with field `emails: ["jgsarmy@gmail.com"]`.
7. Firestore → Rules: paste the rules block above and publish.

## Access control flow

- **Signed out** — public read of itinerary; no edit controls visible.
- **Signed in, allowlisted** — edit/add/delete controls visible.
- **Signed in, not allowlisted** — read-only view + a "Request access" button. The button writes a doc to `access_requests` with `status: "pending"`. The admin sees pending requests on `/admin/` (a badge on the hub's Admin card shows the count via a live snapshot).
- **Admin** (`jgsarmy@gmail.com`) — sees the `/admin/` page where they can approve/deny requests and add/remove allowlist emails directly. Approval is a Firestore transaction that adds the email to the allowlist and marks the request approved.

There is **no email notification** for pending requests by design — the admin checks the badge when they visit the hub. Adding email later means installing the Firebase "Trigger Email" extension, no code change to the rules or pages.

## Firebase SDK version

Pinned to **v10.13.2** via `gstatic.com/firebasejs/...` CDN URLs. If updating, change every occurrence consistently across all files (currently `js/firebase-config.js`, `js/access.js`, `india-trip/app.js`, `admin/admin.js`).

## Local development

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. A real HTTP server is required because `<script type="module">` does not work over `file://`. Any static server is fine (Python, `npx serve`, etc.).

For sign-in to work locally, `localhost` must be in Firebase's authorized domains list (it is by default).

## Deployment

`git push origin master` — that's it. GitHub Pages serves the repo root automatically. Verify on `https://sully2019.github.io` after the Pages build finishes (usually ~30 seconds).
