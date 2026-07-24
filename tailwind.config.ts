import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Purple brand from the Chronology Portal redesign.
        accent: {
          DEFAULT: "#7856FF",
          soft: "#9B7BFF",
          deep: "#5b3fe0",
          fill: "rgba(120, 86, 255, 0.55)", // fixed-opacity "region present" fill
        },
        ink: "#1F2333",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(24,24,40,0.04), 0 10px 30px rgba(24,24,40,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
