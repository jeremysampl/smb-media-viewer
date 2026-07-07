# SMB Media Viewer

Self-hosted media gallery for OpenMediaVault NAS shares. Users sign in with their existing Samba credentials, browse only the folders they can access, and view images/videos in a swipeable gallery with selectable quality tiers.

## Architecture

- **Frontend**: React + Vite SPA served by Nginx
- **Backend**: Node.js + Express API with Sharp (images) and ffmpeg (video transcodes)
- **Auth**: Validates credentials against the host Samba service via `smbclient`
- **Permissions**: Parsed from `/etc/samba/smb.conf` plus `/etc/group`
- **Containers**: Separate Docker images for frontend and backend

## Quality tiers

| Tier | Images | Video |
|------|--------|-------|
| Very Low | 320px | 240p |
| Low | 640px | 480p |
| Medium | 1280px | 720p |
| High | 1920px | 1080p |
| Very High | 2560px | 1440p |
| Full | Original | Original/remuxed |

Transcodes and thumbnails are cached on disk. A background job evicts old cache files when the cache volume exceeds the configured size cap.

## Prerequisites (OMV host)

- Docker and Docker Compose
- Samba shares already configured in OMV
- RAID/share paths available on the host (typically under `/srv/...`)
- Ports available (default frontend `8080`, backend `3001` on host network)

## Quick start on OMV

1. Clone this repository on your NAS:

```bash
git clone https://github.com/your-user/smb-media-viewer.git
cd smb-media-viewer
```

2. Create an environment file:

```bash
cp backend/.env.example .env
```

Edit `.env` and set strong values for `JWT_SECRET` and `TOKEN_SECRET`.

3. Update `docker-compose.yml` volume mounts if your share roots are not under `/srv`.

Example if a share lives at `/srv/dev-disk-by-uuid-abc123/photos`:

```yaml
volumes:
  - /srv/dev-disk-by-uuid-abc123/photos:/srv/dev-disk-by-uuid-abc123/photos:ro
```

The `path =` value in each Samba share section of `smb.conf` must be reachable inside the backend container at the same absolute path.

4. Build and start:

```bash
docker compose up -d --build
```

5. Open the app:

```
http://<your-nas-ip>:8080
```

Sign in with a Samba user that already has access to one or more shares.

## Development

### Local testing (Windows / macOS / Linux)

The production setup expects Samba (`smbclient`) and `/etc/samba/smb.conf` on the NAS. For local UI and media-pipeline testing, use **local dev mode**:

1. Install [ffmpeg](https://ffmpeg.org/) on your machine (required for video thumbnails/transcodes).

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

Requires `ffmpeg` and `smbclient` on the host for local auth tests.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`.

## API overview

- `POST /api/auth/login` - Samba credential check, sets httpOnly session cookie
- `GET /api/auth/me` - Current user
- `GET /api/shares` - Top-level accessible shares
- `GET /api/browse?path=ShareName/folder` - Folder listing
- `GET /api/media/:token/image?quality=medium` - Resized image
- `GET /api/media/:token/video?quality=medium` - Transcoded/streamed video (Range supported)
- `GET /api/media/:token/poster` - Video thumbnail

Media tokens are signed and scoped to the authenticated user.

## Security notes

- Change default secrets before production use.
- Backend uses `network_mode: host` so it can reach the native Samba daemon on port 445.
- Share access is enforced using Samba ACLs from `smb.conf` (share-level in v1).
- Paths outside allowed shares return 404 to avoid leaking filesystem layout.
- Put the app behind HTTPS (reverse proxy) for remote access.

## Troubleshooting

- **Login fails for valid users**: confirm `smbclient` works on the host and `SMB_HOST` is reachable from the backend container (`127.0.0.1` with host networking).
- **Empty share list**: verify `smb.conf` share `path` values match mounted volumes and ACLs include the user or their group.
- **Videos won't play**: first view triggers ffmpeg transcode; wait for cache generation or try a lower quality tier.
- **High CPU usage**: lower default quality tier and reduce concurrent viewers; cache warms up over time.

## License

MIT
