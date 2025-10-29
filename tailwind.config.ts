import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.5rem"
      },
      boxShadow: {
        card: "0 20px 40px -10px rgba(0,0,0,0.3)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
