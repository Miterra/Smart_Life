/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05070d',
          900: '#0b0f1a',
          800: '#101626',
          700: '#1a2236',
          600: '#252e46',
          500: '#3a4666',
          400: '#5d6a8a',
          300: '#8d97b3',
        },
        neon: {
          cyan: '#22d3ee',
          magenta: '#e879f9',
          lime: '#a3e635',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 30px -10px rgba(34, 211, 238, 0.45)',
        glowMagenta: '0 0 30px -10px rgba(232, 121, 249, 0.5)',
        card: '0 24px 48px -24px rgba(0, 0, 0, 0.7)',
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shine: 'shine 8s linear infinite',
      },
      keyframes: {
        shine: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
}
