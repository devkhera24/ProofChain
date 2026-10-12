import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code: a separate chunk stays cached across deploys
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules[\\/](react|react-dom|react-router|scheduler|motion|motion-dom|motion-utils|framer-motion|@tanstack|axios|lucide-react)[\\/]/ }],
        },
      },
    },
  },
});
