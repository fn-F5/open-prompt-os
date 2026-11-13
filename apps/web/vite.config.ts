import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

function preloadHeroFont(): Plugin {
  return {
    name: "preload-hero-font",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        const heroFont = Object.keys(ctx.bundle).find(
          (name) => name.includes("geist-sans-latin-400-normal") && name.endsWith(".woff2"),
        );
        if (!heroFont) return [];
        return [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              crossorigin: "",
              href: `/${heroFont}`,
            },
            injectTo: "head",
          },
        ];
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  const apiTarget = env.API_PROXY_TARGET || "http://127.0.0.1:3001";
  return {
    plugins: [react(), tailwindcss()],
    envDir: "../..",
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/rpc": {
          target: apiTarget,
          changeOrigin: true,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom", "react-router"],
            "query-zod-vendor": ["@tanstack/react-query", "zod"],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
