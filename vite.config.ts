import { defineConfig } from "vite";

// Static flat-file build, deployable to Netlify/Vercel as-is.
export default defineConfig({
  build: {
    target: "es2020",
    assetsInlineLimit: 0, // keep fonts/media as real files so preload + caching work
  },
});
