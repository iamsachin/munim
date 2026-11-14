import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API and the admin are served by Django. Proxying them keeps everything on one origin, so
// the session and CSRF cookies work exactly as they will when Django serves the built app.
const SERVER = process.env.MUNIM_SERVER ?? 'http://127.0.0.1:8000';
// The server is told the address the browser used, not its own: it builds addresses from it
// (the one Google sends the owner back to must be where their session is).
const proxy = Object.fromEntries(
  ['/api', '/admin', '/static'].map((path) => [path, { target: SERVER, changeOrigin: false }]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  test: { include: ['src/**/*.test.ts'] },
});
