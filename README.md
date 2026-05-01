# Sullivan Family Hub

A small GitHub Pages site at **[sully2019.github.io](https://sully2019.github.io)** that hosts shared family apps. The first one is an India trip itinerary planner; more sub-apps will live alongside it as needed.

The site is publicly readable so anyone can see what's planned. Editing requires signing in with Google and being on the family allowlist.

## What's here

| App | Path | Description |
| --- | --- | --- |
| **Family Hub** | `/` | Landing page that links to each sub-app. |
| **India Trip Planner** | `/india-trip/` | Day-by-day itinerary with travel, lodging, sites, meals, costs, and attendees. Live-updates across devices. |
| **Admin** | `/admin/` | Allowlist + access-request management (visible only to the admin). |

## How to use it (for family)

1. Visit [sully2019.github.io](https://sully2019.github.io) on your phone or laptop.
2. Open the **India Trip Planner** card.
3. Click **Sign in with Google** to add or edit entries.
   - If you're not on the allowlist yet, click **Request access** — Jay will see your request on the admin page and approve it.
4. Add lodging, flights, sites, meals, etc. Everyone else's view updates in real time.

## Tech stack

- **Hosting:** GitHub Pages (free, static, served straight from `master`)
- **Frontend:** Vanilla HTML / CSS / JavaScript using ES modules — **no build step**
- **Backend:** [Firebase](https://firebase.google.com) — Firestore for data, Firebase Auth (Google sign-in) for identity
- **Real-time updates:** Firestore `onSnapshot` listeners — changes appear on every open device immediately

## Repository layout

```
/
├── index.html              # Hub landing page
├── styles/shared.css       # Shared styles for all pages
├── js/
│   ├── firebase-config.js  # Firebase init (config values from the Firebase console)
│   └── access.js           # Sign-in, allowlist, and request-access helpers
├── india-trip/             # India trip planner sub-app
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── admin/                  # Allowlist + access-request management
│   ├── index.html
│   └── admin.js
├── CLAUDE.md               # Implementation guidance for AI assistants
└── README.md
```

## Adding a new sub-app

1. Create a folder, e.g., `vacation-photos/`.
2. Add an `index.html` that links `../styles/shared.css` and any local CSS.
3. Import what you need from `../js/firebase-config.js` and `../js/access.js`.
4. Add a card for it in `/index.html`.

That's it — no build, no config, no router.

## Local development

```sh
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000). A real HTTP server is required because `<script type="module">` does not work over `file://`. Any static server works (Python, `npx serve`, etc.).

## Recreating this from scratch (Firebase setup)

The Firebase web config in `js/firebase-config.js` is intentionally committed — Google designs the web `apiKey` to be public. Real security comes from Firestore rules and the authorized-domains list.

Anyone forking this and pointing it at a new Firebase project would need to:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Firestore Database** (production mode).
3. Enable **Authentication → Google** as a sign-in provider.
4. Authentication → Settings → Authorized domains: add the GitHub Pages domain.
5. Project Settings → Your apps → Web app → copy the config object into `js/firebase-config.js`.
6. Update the hardcoded `ADMIN_EMAIL` in `js/firebase-config.js` and the matching email in the Firestore rules.
7. Seed Firestore with `config/allowlist` → `emails: ["<admin email>"]`.
8. Paste the security rules from [`CLAUDE.md`](./CLAUDE.md) into Firestore → Rules → Publish.

Full step-by-step, including the rules block and access-control flow, lives in [`CLAUDE.md`](./CLAUDE.md).

## Notes

- Personal project — feel free to look around, fork, or borrow patterns. No license declared.
- Built with help from [Claude Code](https://claude.com/claude-code).
