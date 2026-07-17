import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Matches the Thanjai Property logo's terracotta/rust-orange.
        brand: {
          50: "#fef5f1",
          100: "#fce8de",
          200: "#f9d4c2",
          300: "#f5b99e",
          400: "#ee956d",
          500: "#e87b4a",
          600: "#da6834",
          700: "#c35c2c",
          800: "#9e4d29",
          900: "#5f3421",
          950: "#3d2114",
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
