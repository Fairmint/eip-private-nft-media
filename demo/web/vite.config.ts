import { defineConfig } from "vite";

export default defineConfig({
  root: "demo/web",
  base: process.env.VITE_BASE_PATH ?? "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
