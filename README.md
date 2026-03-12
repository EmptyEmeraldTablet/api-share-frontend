# API Share Frontend

Static SPA built with Vite + TypeScript.

## Build-Time Configuration

The frontend reads the backend base URL from `VITE_API_BASE` at build time.
If `VITE_API_BASE` is not set, requests default to the same origin using `/api`.

### Local Development

Create a `.env.local` file:

```bash
VITE_API_BASE=http://localhost:8787
```

### Cloudflare Pages

Set `VITE_API_BASE` in Environment Variables for:
- `Production`
- `Preview`

Trigger a new build to apply changes.

### Vercel

Set `VITE_API_BASE` in Project Settings → Environment Variables for:
- `Production`
- `Preview`
- `Development`

Redeploy to apply changes.
