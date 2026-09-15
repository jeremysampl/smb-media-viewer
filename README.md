# SMB Media Viewer

Self-hosted media gallery for OpenMediaVault NAS shares. Users sign in with their existing Samba credentials, browse only the folders they can access, and view images/videos in a swipeable gallery with selectable quality tiers.

## Architecture

- **Frontend**: React + Vite SPA served by Nginx
- **Backend**: Node.js + Express API with Sharp (images), ffmpeg (video transcodes), and LibreOffice (Office document previews)
- **Auth**: Validates credentials against the host Samba service via `smbclient`
- **Permissions**: Parsed from `/etc/samba/smb.conf` plus `/etc/group`
- **Containers**: Separate Docker images for frontend and backend

## Quality tiers

| Tier | Images | Video |
|------|--------|-------|
| Very Low | 320px WebP | 240p |
| Low | 640px WebP | 480p |
| Medium | 1280px WebP | 720p |
| High | 1920px WebP | 1080p |
| Very High | 2560px WebP | 1440p |
| Full | Original file when browser-native (JPEG/PNG/GIF/WebP/AVIF/BMP); otherwise WebP convert (HEIC/TIFF/…) | Original when already playable (H.264/HEVC/VP9/AV1 + common audio in MP4/WebM); otherwise remux to MP4 |

Transcodes for the lightbox are cached on disk under `CACHE_DIR` and may be evicted when the cache exceeds `CACHE_MAX_BYTES`.

A separate **permanent media index** (`INDEX_DIR`) stores:
- SQLite metadata used for date sorting (`capture_time`) and video duration badges
- Tiny grid thumbnails (`very_low` WebP) and video posters

The index is not size-capped. Folder browse returns as soon as directory listing + SQLite lookups finish; missing files are indexed in the background. The first open of a huge folder may sort by file mtime until indexing catches up; later visits reuse the on-disk index.

Configure both locations via env (`CACHE_DIR`, `INDEX_DIR`). In Docker Compose these map to `smb_media_cache` and `smb_media_index` volumes.

## Google Cast slideshows

Select photos, videos, or folders and choose **Cast** to build a slideshow queue. Selected folders include nested media. The queue can be reordered, shuffled, repeated, changed while playing, or switched to **Pick photos** mode for manual control. Videos play through, then the slideshow advances.

Casting requires Chrome, Edge, or Android Chrome. Google only enables the Cast sender API on secure pages (`https://` or `localhost`). Plain `http://192.168.x.x` pages usually show Cast as unavailable.

Recommended LAN setup:

1. Run the frontend with host binding (`npm run dev -- --host`).
2. Open the app on `http://localhost:5173` (or whatever port Vite prints) so Cast controls work.
3. In the Cast dialog, set **LAN media address** to your machine's LAN URL, e.g. `http://192.168.1.50:5173`. Chromecast loads media from that address.
4. Optional: set `CAST_PUBLIC_ORIGIN=http://192.168.1.50:5173` in the backend env so the dialog can default it.

Alternative: open the LAN HTTP URL directly and tell Chrome to treat it as secure:

```text
chrome://flags/#unsafely-treat-insecure-origin-as-secure
```

Add `http://192.168.1.50:5173`, enable the flag, relaunch Chrome.

Keep the sender tab open while a slideshow is playing because the browser controls the timer. The app uses Google's Default Media Receiver. Photos are signed JPEG URLs; videos stream as-is when already playable (H.264/HEVC/VP9/AV1 + common audio in MP4/WebM), otherwise remux to MP4 on first play if needed. Custom fade/slide transitions need a custom receiver. iOS Cast is not supported.

## Prerequisites (OMV host)

- Docker and Docker Compose
- Samba shares already configured in OMV
- RAID/share paths available on the host (typically under `/srv/...`)
- Ports available (default frontend `8080`, backend `3001` on host network)

## Quick start on OMV (pull images)

No need to build from source. Pre-built images are published to GitHub Container Registry (GHCR) from this repo.

1. Create a folder on the NAS and download Compose + env example:

```bash
mkdir -p smb-media-viewer && cd smb-media-viewer
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/jeremysampl/smb-media-viewer/main/docker-compose.yml
curl -fsSL -o .env.example \
  https://raw.githubusercontent.com/jeremysampl/smb-media-viewer/main/.env.example
cp .env.example .env
```

2. Edit `.env` and set strong values for `JWT_SECRET` and `TOKEN_SECRET`. Set `FRONTEND_ORIGIN` to the URL you will open in the browser (e.g. `http://192.168.1.50:8080` or `https://media.example.com`).

   On a Raspberry Pi (or any low-RAM host), keep or tighten the backend limits in `.env`:

   ```bash
   BACKEND_MEM_LIMIT=512m
   BACKEND_CPUS=1.0
   BACKEND_NODE_MAX_OLD_SPACE_MB=384
   INDEX_CONCURRENCY=1
   ```

   `BACKEND_MEM_LIMIT` / `BACKEND_CPUS` are Docker cgroup caps. `BACKEND_NODE_MAX_OLD_SPACE_MB` caps the V8 heap so Node tends to error before the whole Pi OOMs (leave headroom under the mem limit for Sharp/ffmpeg). `INDEX_CONCURRENCY` caps how many Sharp/ffmpeg/EXIF jobs run at once (default `2`); use `1` on a Pi if large folders still spike CPU.

3. Update `docker-compose.yml` volume mounts if your share roots are not under `/srv`.

Example if a share lives at `/srv/dev-disk-by-uuid-abc123/photos`:

```yaml
volumes:
  - /srv/dev-disk-by-uuid-abc123/photos:/srv/dev-disk-by-uuid-abc123/photos:ro
```

The `path =` value in each Samba share section of `smb.conf` must be reachable inside the backend container at the same absolute path.

4. Pull and start:

```bash
docker compose pull
docker compose up -d
```

Pin a release tag instead of `latest` by setting `IMAGE_TAG=1.0.0` (or similar) in `.env`.

5. Open the app:

```
http://<your-nas-ip>:8080
```

Sign in with a Samba user that already has access to one or more shares.

### Build from source instead

If you prefer to compile on the NAS (or GHCR packages are unavailable):

```bash
git clone https://github.com/jeremysampl/smb-media-viewer.git
cd smb-media-viewer
cp .env.example .env
# edit .env secrets, then:
docker compose up -d --build
```

### Publishing images (maintainers)

Pushes to `main` and version tags (`v1.2.3`) run [.github/workflows/publish-images.yml](.github/workflows/publish-images.yml), which builds and pushes multi-arch images (`linux/amd64` and `linux/arm64`) for:

- `ghcr.io/jeremysampl/smb-media-viewer-backend`
- `ghcr.io/jeremysampl/smb-media-viewer-frontend`

Docker pulls the matching architecture automatically for your NAS.

After the **first** successful workflow run, make the packages public (otherwise anonymous `docker pull` fails):

1. Open the GitHub repo → **Packages** (right sidebar), or `https://github.com/users/jeremysampl/packages`
2. Open each package → **Package settings** → **Change visibility** → **Public**
3. Optionally create a GitHub **Release** / tag `v1.0.0` so users can pin `IMAGE_TAG=1.0.0`

No extra secrets are required for GHCR from Actions in this repo (`GITHUB_TOKEN` is enough).

## Development

### Local testing (Windows / macOS / Linux)

The production setup expects Samba (`smbclient`) and `/etc/samba/smb.conf` on the NAS. For local UI and media-pipeline testing, use **local dev mode**:

1. Install [ffmpeg](https://ffmpeg.org/) on your machine (required for video thumbnails/transcodes).
   For Word/PowerPoint previews, install LibreOffice (`soffice` on PATH).

2. Copy the local env file and add test media:

```bash
cd backend
cp .env.local.example .env
# Put sample images/videos in backend/dev-media/
npm install
npm run dev
```

3. In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

4. Open `http://localhost:5173` and sign in with **any** username/password.

In local dev mode the backend:
- Skips Samba authentication (when `SMB_HOST=localhost`)
- Serves files directly from `DEV_MEDIA_ROOT` as a single fake share
- Still runs the real image resize / video transcode / cache pipeline
- Writes permanent browse metadata and grid thumbs under `INDEX_DIR` (default `./index`)

#### Testing against your real NAS from your PC

The app reads files from **local disk paths**, not over the SMB protocol. To test with real NAS files locally:

1. Map the NAS share in Windows Explorer (e.g. `\\nas\photos` → `Z:`).
2. Set in `backend/.env`:
   ```
   LOCAL_DEV=true
   DEV_MEDIA_ROOT=Z:/photos
   SMB_HOST=192.168.x.x
   ```
3. Sign in with your real Samba username/password (validated against the NAS).
4. Files are read from the mapped drive; no Docker bind-mount needed.

### Backend (production-like)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Requires `ffmpeg` and `smbclient` on the host for local auth tests. Office previews also need LibreOffice (`soffice`).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`.

## API overview

- `POST /api/auth/login` - Samba credential check, sets httpOnly session cookie
- `GET /api/auth/me` - Current user (`username`, `admin`)
- `GET /api/admin/status` - Admin-only live jobs + host/process metrics
- `GET /api/shares` - Top-level accessible shares
- `GET /api/browse?path=ShareName/folder` - Folder listing
- `GET /api/media/:token/image?quality=medium` - Resized image
- `GET /api/media/:token/video?quality=medium` - Transcoded/streamed video (Range supported)
- `GET /api/media/:token/poster` - Video thumbnail
- `GET /api/media/:token/raw` - Text, PDF, or spreadsheet bytes for in-browser viewers
- `GET /api/media/:token/pdf-preview` - Office document converted to PDF (cached; requires LibreOffice)

Media tokens are signed and scoped to the authenticated user.

Set `ADMIN_USERS=alice,bob` (Samba usernames, comma-separated) to enable `/admin`. Those users see an **Admin** item in the account menu with Overview, Jobs, Cache, and Index panels (paginated, sortable/filterable tables, including folder filters). Cache and Index support clearing selected rows, everything under a folder filter, or the entire store. Cache open counts and last-opened times are tracked whenever a cached image/video is served.

## Security notes

- Change default secrets before production use.
- Restrict `/admin` with `ADMIN_USERS` (Samba usernames). Leave unset to disable the dashboard.
- Backend uses `network_mode: host` so it can reach the native Samba daemon on port 445.
- Share access is enforced using Samba ACLs from `smb.conf` (share-level in v1).
- Paths outside allowed shares return 404 to avoid leaking filesystem layout.
- Session cookies use `Secure` only when `COOKIE_SECURE=true` or `FRONTEND_ORIGIN` is `https://...`. Leave `COOKIE_SECURE=false` for plain HTTP on the LAN.
- Put the app behind HTTPS (reverse proxy) for remote access, then set `FRONTEND_ORIGIN=https://...` and `COOKIE_SECURE=true`.

## Troubleshooting

- **Pi / host freezes during indexing**: lower `BACKEND_MEM_LIMIT`, `BACKEND_CPUS`, `BACKEND_NODE_MAX_OLD_SPACE_MB`, and `INDEX_CONCURRENCY` in `.env`, then `docker compose up -d`. Pi-friendly values are `512m` / `1.0` / `384` / `1`.
- **Login works but browse says "Authentication required"**: you are almost certainly on `http://` while the cookie was marked `Secure`. Set `COOKIE_SECURE=false` and `FRONTEND_ORIGIN=http://<nas-ip>:8080`, recreate the backend container, then log in again.
- **Share list is empty** (main page has no folders):
  1. On the NAS, run `testparm -s` and confirm share sections + `path =` lines.
  2. Confirm compose mounts the **whole** `/etc/samba` directory (not only `smb.conf`) and `/etc/passwd` + `/etc/group`.
  3. Confirm each share `path` exists in the container (usually via `/srv:/srv:ro`). Example check: `docker exec smb-media-viewer-backend ls /srv`
  4. Check backend logs: `docker logs smb-media-viewer-backend 2>&1 | grep shares`: you should see `Loaded N share(s)`. If N>0 but the UI is empty, the user failed the `valid users` / group ACL filter (primary group `@users` is now supported).
- **Shares appear but folders look empty / Path not found**: the `path =` in Samba does not match a mounted host directory inside the container. Align volume mounts with `testparm -s` paths.
- **Login fails for valid users**: confirm `smbclient` works on the host and `SMB_HOST` is reachable from the backend container (`127.0.0.1` with host networking).
- **Videos won't play**: Full quality streams originals when already H.264+AAC MP4/MOV; otherwise the first view remuxes/transcodes. Wait for cache generation or try a lower quality tier.
- **High CPU usage**: lower default quality tier and reduce concurrent viewers; cache warms up over time.
- **Date sort looks wrong on first open**: while indexing is active the grid keeps mtime order so thumbs don’t reshuffle; after indexing finishes it switches to capture time (data lives under `INDEX_DIR`).
- **Slow first thumbnail row**: grid thumbs are generated into `INDEX_DIR` on demand / while indexing (capped by `INDEX_CONCURRENCY`); they are permanent afterward.

## License

MIT
