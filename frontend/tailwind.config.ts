import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4fe",
          100: "#dde7fd",
          200: "#c3d3fb",
          300: "#99b4f8",
          400: "#678cf2",
          500: "#4468ec",
          600: "#2f4ce0",
          700: "#2839c9",
          800: "#2531a3",
          900: "#1e2860",
          950: "#131a3d",
        },
        gold: {
          300: "#f2d9a0",
          400: "#e8c26a",
          500: "#d6a83f",
          600: "#b98c2c",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 6px -1px rgb(15 23 42 / 0.06)",
        "card-hover": "0 4px 14px -2px rgb(15 23 42 / 0.12)",
        pop: "0 10px 38px -10px rgb(15 23 42 / 0.28), 0 10px 20px -15px rgb(15 23 42 / 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
