/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        surface: 'rgba(24, 24, 27, 0.7)',
        primary: '#3b82f6',
        'neon-cyan': '#00f3ff',
        'neon-blue': '#003cff',
        'neon-purple': '#b537f2',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 8px rgba(0, 243, 255, 0.6))' },
          '50%': { opacity: '.8', filter: 'drop-shadow(0 0 2px rgba(0, 243, 255, 0.4))' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
