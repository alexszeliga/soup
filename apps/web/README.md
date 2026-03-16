# Soup Web Dashboard

The Soup Web Dashboard is a React-based management interface for the Soup BitTorrent engine. It provides a real-time, poster-centric view of your media library with integrated management controls.

## Features

- **Real-time Telemetry:** Uses WebSockets to provide 500ms updates for speeds, progress, and system health.
- **Poster-Centric UI:** Automatically displays high-quality box art and metadata for identified movies and TV shows.
- **Integrated Ingestion:** Multi-file selection and transfer directly into organized media library roots.
- **Web-Based Explorer:** Browse the server's filesystem directly from the dashboard for path configuration.
- **Material 3 Design:** Responsive, high-density interface optimized for both desktop and mobile.

## Development

### Prerequisites
- Node.js 20+
- pnpm

### Setup
```bash
# From root
pnpm install
pnpm --filter @soup/web dev
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL for the Soup API (Default: `/api`) |

## Architecture

- **`src/hooks/useTorrents.ts`:** Centralized state management for WebSocket synchronization and action handlers.
- **`src/components/`:** Material 3 UI components (Modals, Lists, Stats).
- **`src/context/NotificationContext.tsx`:** Global Snackbar feedback system.

## Build
```bash
pnpm build
```
The production assets will be generated in `dist/`.
