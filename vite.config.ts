import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";

// Chạy cùng handler như Netlify để kiểm tra API thật bằng `npm run dev`.
function localApi(): Plugin {
  return {
    name: "local-netlify-api",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        try {
          const { default: handler } = await import("./netlify/functions/api");
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 65536) {
              res.statusCode = 413;
              res.end('{"error":"Dữ liệu quá lớn."}');
              return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers))
            if (value)
              headers.set(key, Array.isArray(value) ? value.join(",") : value);
          const request = new Request(
            "http://" +
              (req.headers.host || "127.0.0.1:" + server.config.server.port) +
              req.url,
            {
              method: req.method,
              headers,
              body: ["GET", "HEAD"].includes(req.method || "GET")
                ? undefined
                : Buffer.concat(chunks),
            },
          );
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "API chưa sẵn sàng. Kiểm tra .env và database.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env))
    if (process.env[key] === undefined) process.env[key] = value;
  return {
    plugins: [react(), localApi()],
    resolve: { preserveSymlinks: true },
    server: { port: 5173, strictPort: true },
    build: { sourcemap: false },
    test: { pool: "threads", maxWorkers: 1 },
  };
});
