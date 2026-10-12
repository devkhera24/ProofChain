import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 600, // the vendor chunk is deliberately one long-cached file (~170 kB gzipped)
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code: a separate chunk stays cached across deploys
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules[\\/](react|react-dom|react-router|scheduler|motion|motion-dom|motion-utils|framer-motion|@tanstack|axios|lucide-react|socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)[\\/]/ }],
        },
      },
    },
  },
});
