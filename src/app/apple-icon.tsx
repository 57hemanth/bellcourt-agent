import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon: the Bell mark on a full-bleed square (iOS applies its own rounding). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1220" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M16 7.5c-3.6 0-6 2.7-6 6.3v4.4l-1.6 2.6c-.3.5.1 1.2.7 1.2h13.8c.6 0 1-.7.7-1.2L22 18.2v-4.4c0-3.6-2.4-6.3-6-6.3Z" fill="#fff" />
          <circle cx="16" cy="24.6" r="1.9" fill="#2f5bea" />
        </svg>
      </div>
    ),
    size,
  );
}
