import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        chess: {
          charcoal: "#312e2b",
          panel: "#262522",
          surface: "#21201d",
          border: "#3d3b38",
          text: "#ffffff",
          muted: "#9e9c98",
          sqLight: "#eeeed2",
          sqDark: "#769656",
          brilliant: "#1baca6",
          great: "#5c8bb0",
          best: "#96bc4b",
          excellent: "#96bc4b",
          good: "#99a83d",
          book: "#a88a68",
          inaccuracy: "#e58f2a",
          mistake: "#e65e2b",
          miss: "#ca3431",
          blunder: "#fa412d",
          forced: "#8c8883",
        },
      },
      boxShadow: {
        badge: "0 2px 4px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
