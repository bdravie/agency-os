import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://clrsweb.uk",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
});
