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
        /* Dolboor violet as the fallback; an org's --color-primary-* still overrides it */
        primary: {
          50: 'rgb(var(--color-primary-50, 245 242 254) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100, 239 233 253) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200, 221 214 254) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300, 196 181 253) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400, 177 151 252) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500, 139 92 246) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600, 109 40 217) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700, 91 33 182) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800, 76 29 149) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900, 59 26 120) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950, 43 33 73) / <alpha-value>)',
        },
        /* Dolboor's neutral greys in place of Tailwind's blue-tinted slate, so every page
           follows the shell. One ramp serves both themes: 50–300 are light surfaces and
           borders, 700–950 dark ones, 400–600 muted text in either. */
        slate: {
          50: '#f7f7f8',
          100: '#f0f1f3',
          200: '#e5e7eb',
          300: '#d4d7dc',
          400: '#8d939c',
          500: '#646b77',
          600: '#474c55',
          700: '#2a2b2f',
          800: '#18191b',
          900: '#111214',
          950: '#0a0b0c',
        },
        accent: {
          teal: '#14b8a6',
        },
      },
      /* Dolboor caps corners at 12px: cards 8, modals 12 */
      borderRadius: {
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
      },
      boxShadow: {
        pop: '0 1px 3px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.08)',
        float: '0 2px 8px rgb(0 0 0 / 0.12), 0 12px 32px rgb(0 0 0 / 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'Cambria', 'serif'],
      },
    },
  },
  plugins: [],
}
