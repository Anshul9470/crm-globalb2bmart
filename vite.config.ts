import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "sales-cms.onrender.com"
    ],
  },
  plugins: [
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "react",
    }), 
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react/jsx-runtime": path.resolve(__dirname, "./src/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./src/jsx-runtime.js"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
}));
