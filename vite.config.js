import { defineConfig } from 'vite';

// Where the site is served from. The GitHub Pages workflow passes BASE_PATH from the
// configure-pages action, which reports "/<repo-name>" for a project site and "" for a
// <user>.github.io user site — neither has the leading-and-trailing slashes Vite wants.
// Normalising here means the same build command works locally, on a project site, on a
// user site, and on a custom domain, with no workflow edit.
//   "/india-growth-tracker" → "/india-growth-tracker/"      ""  → "/"      unset → "/"
const base = ('/' + (process.env.BASE_PATH || '/') + '/').replace(/\/+/g, '/');

// PORT (optional) lets a launcher pick the dev-server port; otherwise Vite's default 5173 is used.
export default defineConfig({
  base,
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT },
  build: { outDir: 'dist', emptyOutDir: true }
});
