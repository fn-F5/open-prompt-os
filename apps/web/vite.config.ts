import * as fs from "node:fs/promises";
import * as path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Plugin, createServer, defineConfig, loadEnv } from "vite";

type SeoStaticGeneratorModule = typeof import("./src/lib/seo-static-generator.js");

function seoAndAeoPlugin(siteOrigin: string): Plugin {
  let outDir = path.resolve(import.meta.dirname, "dist");
  let isBuild = false;

  return {
    name: "open-prompt-os-seo-aeo",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/llms.txt" && url !== "/llms-full.txt" && url !== "/sitemap.xml") {
          next();
          return;
        }
        try {
          const gen = (await server.ssrLoadModule(
            "/src/lib/seo-static-generator.ts",
          )) as SeoStaticGeneratorModule;
          if (url === "/llms.txt") {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(gen.generateLlmsTxt(siteOrigin));
            return;
          }
          if (url === "/llms-full.txt") {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(gen.generateLlmsFullTxt(siteOrigin));
            return;
          }
          if (url === "/sitemap.xml") {
            res.setHeader("Content-Type", "application/xml; charset=utf-8");
            res.end(gen.generateSitemapXml(siteOrigin));
            return;
          }
        } catch (err) {
          next(err);
        }
      });
    },
    async closeBundle() {
      if (!isBuild) return;

      const indexHtmlPath = path.join(outDir, "index.html");
      let templateHtml: string;
      try {
        templateHtml = await fs.readFile(indexHtmlPath, "utf8");
      } catch {
        return;
      }

      const ssrServer = await createServer({
        configFile: false,
        root: import.meta.dirname,
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true, hmr: false },
        optimizeDeps: { noDiscovery: true },
      });

      try {
        const gen = (await ssrServer.ssrLoadModule(
          "/src/lib/seo-static-generator.ts",
        )) as SeoStaticGeneratorModule;

        await fs.writeFile(path.join(outDir, "llms.txt"), gen.generateLlmsTxt(siteOrigin), "utf8");
        await fs.writeFile(
          path.join(outDir, "llms-full.txt"),
          gen.generateLlmsFullTxt(siteOrigin),
          "utf8",
        );
        await fs.writeFile(
          path.join(outDir, "sitemap.xml"),
          gen.generateSitemapXml(siteOrigin),
          "utf8",
        );

        const routes = gen.buildPrerenderRoutes(siteOrigin);
        for (const spec of routes) {
          const rendered = gen.injectSeoIntoHtml(templateHtml, spec, siteOrigin);
          if (spec.path === "/") {
            await fs.writeFile(indexHtmlPath, rendered, "utf8");
          } else {
            const cleanSubpath = spec.path.replace(/^\/+/, "");
            const targetDir = path.join(outDir, cleanSubpath);
            await fs.mkdir(targetDir, { recursive: true });
            await fs.writeFile(path.join(targetDir, "index.html"), rendered, "utf8");
          }
        }
      } finally {
        await ssrServer.close();
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  const apiTarget = env.API_PROXY_TARGET || "http://127.0.0.1:3001";
  const siteOrigin = env.VITE_PUBLIC_SITE_URL || "https://openpromptos.com";

  return {
    plugins: [react(), tailwindcss(), seoAndAeoPlugin(siteOrigin)],
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
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
