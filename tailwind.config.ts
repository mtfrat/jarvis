import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#121215",
          foreground: "#fafafa",
          subtle: "#18181b",
        },
        border: "#27272a",
        accent: {
          emerald: "#10b981",
          cyan: "#06b6d4",
          violet: "#8b5cf6",
          rose: "#f43f5e",
          amber: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
