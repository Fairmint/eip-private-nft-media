import { defineConfig } from "vite";

export default defineConfig({
  root: "demo/web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
