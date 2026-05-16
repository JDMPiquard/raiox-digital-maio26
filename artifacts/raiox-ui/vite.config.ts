import { defineConfig } from "vite";
import { resolve } from "node:path";

const PORT = Number(process.env["PORT"] ?? 5173);
const BASE_PATH = process.env["BASE_PATH"] ?? "/";

export default defineConfig({
  base: BASE_PATH,
  server: {
    host: "0.0.0.0",
    port: PORT,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443 },
  },
  preview: {
    host: "0.0.0.0",
    port: PORT,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        result: resolve(__dirname, "result.html"),
        privacidade: resolve(__dirname, "privacidade.html"),
      },
    },
  },
});
