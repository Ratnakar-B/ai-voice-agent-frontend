# VoicePilot Frontend

The frontend is a React, TypeScript, and Vite application for managing voice agents, browsing the knowledge base, and reviewing conversation transcripts.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- The VoicePilot API running locally or at a configured API URL

## Install

From PowerShell in the project root:

```powershell
Set-Location .\frontend
npm install
```

## Configure

The frontend uses `http://localhost:4000` as its default API URL. To use another API URL, create `frontend\.env.local`:

```dotenv
VITE_API_BASE=http://localhost:4000
```

Restart Vite after changing environment variables. Do not put backend secrets or API keys in frontend environment files; `VITE_` variables are included in browser code.

## Run in development

Start the backend in a separate terminal first, then run:

```powershell
Set-Location .\frontend
npm run dev
```

Open the URL Vite prints in the terminal (normally `http://localhost:5173`). If that port is already in use, Vite selects another available port.

## Build and preview

```powershell
Set-Location .\frontend
npm run build
npm run preview
```

The production bundle is written to `frontend\dist`.

## Lint

```powershell
Set-Location .\frontend
npm run lint
```
