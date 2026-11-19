import { defineConfig } from 'vite';

// Relative base is deliberate: it makes the same build work from a GitHub
// Pages project subpath (https://user.github.io/repo/) and from a local root.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
