/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Custom color palette for a "really nice" look (Dark/Modern theme base)
        background: '#0f172a', // Slate 900
        surface: '#1e293b',    // Slate 800
        primary: '#3b82f6',    // Blue 500
        'primary-hover': '#2563eb', // Blue 600
        secondary: '#64748b',  // Slate 500
        text: '#f1f5f9',       // Slate 100
        'text-muted': '#94a3b8', // Slate 400
        border: '#334155',     // Slate 700
      }
    },
  },
  plugins: [],
}
