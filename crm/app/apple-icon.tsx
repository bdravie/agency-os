import { appIcon } from "@/lib/appIcon";

// iPhone home-screen icon; Next adds the <link rel="apple-touch-icon"> for it.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}
