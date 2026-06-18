# JIO Store — Project Memory for AI Coding Agents

## Critical Architecture Decisions

### Persistent Storage (Railway)
- **Uploads go to `/data/uploads/`** (Railway persistent volume), NOT `./uploads/`
- Always use `process.env.UPLOADS_PATH || '/data/uploads/'` for multer destination
- Database: `SQLITE_PATH=/data/jio_store.db` (also persistent)
- If adding new file/disk-based features, always route to `/data/`

### Error Handling
- **Multer errors need explicit handler**: `app.use((err, req, res, next) => { if (err instanceof multer.MulterError) ... })`
- **Error handler MUST be after all routes** — in Express, `next(err)` only finds error handlers defined later in the middleware stack. If defined before routes, it never gets called.
- Always send actual error message from server to client: `alert(e.message)` not `alert('Error')`

### SQLite WAL Mode
- Railway persistent volume may not support `WAL` journal mode (`SQLITE_IOERR_SHMSIZE`)
- Always wrap `PRAGMA journal_mode = WAL` in try-catch, falling back to `DELETE` mode
- Clean up stale `-wal` and `-shm` files on fallback`

### DOM Event Handling
- **Use `addEventListener` NOT `onclick`** — especially inside forms. `onclick` can trigger form submit.
- For "add tag" buttons: `type="button"` + `e.preventDefault()` + `addEventListener('click', ...)`

### Chrome Translation Issue
- All size/color elements must have `translate="no"` attribute
- This includes: admin tag labels, product buttons, cart items, order summary rows, orders table data cells
- Dynamically created elements (JS `innerHTML`) must also include `translate="no"`

### Uploads (Railway Storage Buckets)
- Images stored in Railway S3-compatible Storage Buckets (not local disk)
- DB stores `s3:products/filename.ext` for S3 images, fallback to `/uploads/filename.ext`
- Image proxy at `/api/image/:key` serves from S3 or local disk
- Frontend uses `imgUrl()` helper to resolve image paths
- Max file size: 20MB (multer limit + clear error message)
- `express.json()` default limit (100kb) is sufficient for JSON payloads (file uploads are multipart via multer, not JSON)
- `keepImage` flag should be checked when updating product without changing image
- Bucket env vars: `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_NAME`, `BUCKET_REGION`

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
