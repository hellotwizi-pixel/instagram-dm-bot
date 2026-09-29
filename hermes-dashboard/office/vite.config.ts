import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 실시간 연결: `HERMES_DESK_URL=http://127.0.0.1:64729 npm run dev`
 * Hermes Desk(server.py)는 Host·Origin 을 자기 주소로만 허용하고 CORS 헤더가 없으므로
 * 개발 서버가 /hermes/* 를 그 주소로 중계하면서 헤더를 맞춰 준다. 배포 빌드에는 포함되지 않는다.
 */
const HERMES = (process.env.HERMES_DESK_URL ?? "").replace(/\/$/, "");

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_HERMES_LIVE": JSON.stringify(HERMES ? "1" : "0"),
  },
  server: {
    port: 3000,
    proxy: HERMES
      ? {
          "/hermes": {
            target: HERMES,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/hermes/, ""),
            configure(proxy) {
              proxy.on("proxyReq", (req) => {
                req.setHeader("Origin", HERMES);
                req.setHeader("Sec-Fetch-Site", "same-origin");
              });
            },
          },
        }
      : undefined,
  },
  preview: { port: 3000 },
});
