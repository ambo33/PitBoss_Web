# PitBoss

PitBoss is a monorepo with:

- `apps/api`: Express + Socket.IO API
- `apps/web`: Vite + React frontend

## Render deploy

This repo is set up to deploy to Render as a single web service. The API serves the built frontend in production, so auth, sockets, invite links, and `/api` all stay on the same origin.

### One-time setup

1. Push this repo to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Select the repo and deploy the included [render.yaml](C:\Users\EricA\OneDrive\Claude-Projects\pitboss\render.yaml).
4. Provide values for the prompted secrets:
   - `DATABASE_URL`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `EMAIL_FROM`

`JWT_SECRET` is generated automatically.

### Optional settings

- `CLIENT_URL` is optional on Render. If omitted, the app uses Render's `RENDER_EXTERNAL_URL`.
- If you later add a custom domain, set `CLIENT_URL` to that full `https://...` value so invite emails and QR links use your branded URL.

### Local development

```bash
npm run dev
```

### Production build

```bash
npm run build
npm run start -w apps/api
```
