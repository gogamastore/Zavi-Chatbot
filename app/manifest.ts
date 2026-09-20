import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zavi Assistant — Chatbot WhatsApp",
    short_name: "Zavi",
    description:
      "Chatbot WhatsApp otomatis untuk UMKM: balas chat 24 jam, jawaban AI, dan pencatatan pesanan.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#075e54",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
