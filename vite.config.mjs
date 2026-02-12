import { resolve } from "path";
import { fileURLToPath } from "url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

const LIBRARY_NAME = "ui-system-monitor";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue(), cssInjectedByJsPlugin()],
  build: {
    sourcemap: process.env.NODE_ENV === "development",
    lib: {
      entry: resolve(__dirname, "ui/index.js"),
      name: LIBRARY_NAME,
      formats: ["umd"],
      fileName: () => "system-monitor.js",
    },
    outDir: "./resources",
    rollupOptions: {
      external: ["vue", "vuex"],
      output: {
        globals: {
          vue: "Vue",
          vuex: "vuex",
        },
      },
    },
  },
  server: {
    watch: {
      paths: ["ui/**/*"],
    },
  },
});
