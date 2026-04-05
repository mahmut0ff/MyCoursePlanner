/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'rgb(var(--color-primary-50, 238 242 255) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100, 224 231 255) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200, 199 210 254) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300, 165 180 252) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400, 129 140 248) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500, 99 102 241) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600, 79 70 229) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700, 67 56 202) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800, 55 48 163) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900, 49 46 129) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950, 30 27 75) / <alpha-value>)',
        },
        accent: {
          teal: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
