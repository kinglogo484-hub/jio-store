# JIO Store — Project Memory for AI Coding Agents

## Critical Architecture Decisions

### Persistent Storage (Railway)
- **Uploads go to `/data/uploads/`** (Railway persistent volume), NOT `./uploads/`
- Always use `process.env.UPLOADS_PATH || '/data/uploads/'` for multer destination
- Database: `SQLITE_PATH=/data/jio_store.db` (also persistent)
- If adding new file/disk-based features, always route to `/data/`

### Error Handling
- **Multer errors need explicit handler**: `app.use((err, req, res, next) => { if (err instanceof multer.MulterError) ... })`
- Always send actual error message from server to client: `alert(e.message)` not `alert('Error')`

### DOM Event Handling
- **Use `addEventListener` NOT `onclick`** — especially inside forms. `onclick` can trigger form submit.
- For "add tag" buttons: `type="button"` + `e.preventDefault()` + `addEventListener('click', ...)`

### Chrome Translation Issue
- All size/color elements must have `translate="no"` attribute
- This includes: admin tag labels, product buttons, cart items, order summary rows, orders table data cells
- Dynamically created elements (JS `innerHTML`) must also include `translate="no"`

### Uploads
- Max file size: 5MB (multer limit + clear error message)
- Image path stored in DB as `/uploads/filename.ext`
- `keepImage` flag should be checked when updating product without changing image

## Infrastructure

### Deploy
- **Host**: Railway.app (free tier, persistent volume)
- **GitHub**: `kinglogo484-hub/jio-store`
- **Live URL**: `https://jio-store-production.up.railway.app`
- **Redeploy methods**:
  - Auto-deploy on `git push origin main` (usually takes 1-2 min)
  - Railway API: `mutation { serviceInstanceRedeploy(serviceId: "...", environmentId: "...") }` with Bearer token
  - CLI: `railway up --detach`

### Railway Auth
- Config file: `~/.railway/config.json`
- Access token expires after ~1 hour. If API calls return "Not Authorized", need `railway login` or refresh token.
- Refresh flow (if API token expired):
  1. `railway login` (requires browser)
  2. OR read fresh token from `~/.railway/config.json` after login

### Database
- **SQLite** via `better-sqlite3`
- Seed data: 27 Egyptian governorates with shipping fees, default admin (`admin`/`jio2026`), 3 payment methods
- Tables: products, orders, payment_info, settings, admins, shipping_rates

## Troubleshooting Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Images disappear | Not using persistent volume | Use `UPLOADS_PATH=/data/uploads` |
| Multer error not showing | Missing `multer.MulterError` handler | Add explicit error handler |
| Button/click not working | `onclick` submits form | Use `addEventListener` + `preventDefault` |
| Chrome translates sizes/colors | Missing `translate="no"` | Add attribute to all relevant elements |
| API returns old cached data | Express static cache | Add `?v=timestamp` query param to scripts |
