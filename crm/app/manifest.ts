import type { MetadataRoute } from "next";

// Lets the CRM be added to a phone's home screen and open full screen, like an app (docs/SETUP.md, "Use the CRM on your phone").
// Brand colours are written out here because a manifest cannot read the CSS tokens (Cream background, Navy theme).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agency OS",
    short_name: "Agency OS",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4EDE0",
    theme_color: "#14213D",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
