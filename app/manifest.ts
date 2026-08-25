import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Levr",
    short_name: "Levr",
    description:
      "Talk or type a thought. Levr sorts it into your 20% or hands it off.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF9F4",
    theme_color: "#FBF9F4",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
