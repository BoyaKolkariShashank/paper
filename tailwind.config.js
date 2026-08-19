/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        paper: "0 1px 2px rgba(15,23,42,.04), 0 8px 30px rgba(15,23,42,.06)"
      }
    }
  },
  plugins: []
}