import type { MetadataRoute } from "next";

/** Cho phép "Thêm vào màn hình chính" trên điện thoại và mở như app riêng. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trading Snow — Nhật ký giao dịch",
    short_name: "Trading Snow",
    description: "Nhật ký giao dịch và phân tích danh mục cổ phiếu",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0f16",
    theme_color: "#5457d7",
    lang: "vi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
