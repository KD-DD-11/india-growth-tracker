import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
// Locally it defaults to "/" so `npm run dev` and `npm run preview` work unchanged.
// PORT (optional) lets a launcher pick the dev-server port; otherwise Vite's default 5173 is used.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  build: { outDir: 'dist', emptyOutDir: true }
});
