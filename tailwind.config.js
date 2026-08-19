/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#12161c',
          800: '#1b2129',
          700: '#2a323d',
          600: '#3d4753',
          500: '#5b6674',
          400: '#7d8794',
          300: '#a8b0ba',
          200: '#d0d5db',
          100: '#e6e9ec',
          50: '#f4f6f8',
        },
        pos: { DEFAULT: '#0f7b4f', soft: '#e7f4ec' },
        neg: { DEFAULT: '#b3261e', soft: '#fbeae9' },
        warn: { DEFAULT: '#8a5a00', soft: '#fdf3e0' },
        accent: { DEFAULT: '#2f5fd8', soft: '#eaf0fd' },
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '15px'],
        sm: ['12px', '17px'],
        base: ['13px', '19px'],
      },
    },
  },
  plugins: [],
}
