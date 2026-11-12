import { ImageResponse } from "next/og";

// The home-screen icon: the same mark as app/icon.svg, drawn full-bleed (the phone rounds the corners itself) with the glyph inside
// the middle 60%, so Android's maskable crop never cuts it. Raw hex because an image cannot read the CSS tokens (Coral and Navy).
export function appIcon(size: number): ImageResponse {
  const glyph = Math.round(size * 0.6);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FF6B5B" }}>
        <svg width={glyph} height={glyph} viewBox="0 0 36 36"><path d="M18 0 4 36h8l3-8h12l3 8h8L18 0Zm0 16 4 8h-8l4-8Z" fill="#14213D" /></svg>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
