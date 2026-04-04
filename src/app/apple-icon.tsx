import { ImageResponse } from "next/og";

import { APP_THEME_COLOR } from "@/lib/web-app";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 28% 24%, #427f76 0%, #31555a 38%, #17181a 76%, #0d0d0e 100%)"
        }}
      >
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "5px solid rgba(242, 238, 227, 0.12)",
            boxShadow: "0 14px 40px rgba(0, 0, 0, 0.28)",
            background: APP_THEME_COLOR,
            color: "#f2eee3",
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.08em"
          }}
        >
          C
        </div>
      </div>
    ),
    size
  );
}
