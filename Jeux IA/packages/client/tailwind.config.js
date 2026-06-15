/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          DEFAULT: "#0E0B1F",
          900: "#0E0B1F",
          800: "#161229",
          700: "#211a3d",
          600: "#2d2350",
        },
        neon: {
          pink: "#FF2E97",
          cyan: "#22E0FF",
          yellow: "#FFD23F",
          green: "#39FF88",
          purple: "#A855F7",
        },
      },
      fontFamily: {
        display: ['"Luckiest Guy"', "cursive"],
        body: ["Outfit", "system-ui", "sans-serif"],
      },
      boxShadow: {
        hard: "4px 4px 0 0 rgba(0,0,0,0.55)",
        neon: "0 0 18px rgba(34,224,255,0.45)",
      },
    },
  },
  plugins: [],
};
