import { defineConfig } from "vite";

export default defineConfig({
  root: "demo/web",
  base: process.env.GITHUB_ACTIONS ? "/eip-private-nft-media/" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
