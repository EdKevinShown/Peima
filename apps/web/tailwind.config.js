/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          pink:   '#ff6b9d',
          purple: '#c44dff',
          violet: '#7b5ea7',
        },
        bg: {
          deep:  '#0f0c29',
          mid:   '#1a1535',
          base:  '#24243e',
        },
        ink: {
          DEFAULT: '#ffffff',
          muted:   'rgba(255,255,255,0.55)',
          faint:   'rgba(255,255,255,0.30)',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #ff6b9d 0%, #c44dff 100%)',
        'bg-gradient':    'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      fontFamily: {
        sans: [
          '"PingFang SC"', '"Noto Sans SC"',
          '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif',
        ],
        serif: [
          '"Playfair Display"', '"Noto Serif SC"', 'Georgia', 'serif',
        ],
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out',
        'slide-up':   'slideUp 0.5s ease-out both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'float':      'float 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(24px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        float:     { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-12px)' } },
      },
      boxShadow: {
        'glow':      '0 0 32px rgba(255,107,157,0.3)',
        'glass':     '0 8px 32px rgba(0,0,0,0.5)',
        'glass-sm':  '0 4px 16px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};
