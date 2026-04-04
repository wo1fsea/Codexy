import { ImageResponse } from "next/og";

import { APP_THEME_COLOR } from "@/lib/web-app";

export const size = {
  width: 512,
  height: 512
};

export const contentType = "image/png";

export default function Icon() {
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
            "radial-gradient(circle at 30% 28%, #3c7e74 0%, #2b4f54 34%, #161719 74%, #0d0d0e 100%)"
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 104,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "12px solid rgba(242, 238, 227, 0.12)",
            boxShadow: "0 24px 72px rgba(0, 0, 0, 0.34)",
            background: APP_THEME_COLOR,
            color: "#f2eee3",
            fontSize: 196,
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
