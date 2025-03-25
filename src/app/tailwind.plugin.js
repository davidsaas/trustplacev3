// This file replaces the functionality that was previously provided by the tailwindcss-animate plugin
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const plugin = require('tailwindcss/plugin')

const __dirname = dirname(fileURLToPath(import.meta.url));

module.exports = plugin(function ({ addBase, addComponents, addUtilities }) {
  addBase({
    '@theme': {
      '--animate-fade-in': 'fade-in 0.5s linear forwards',
      '--animate-fade-out': 'fade-out 0.5s linear forwards',
      '--animate-spin': 'spin 1s linear infinite',
      '--animate-ping': 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
      '--animate-bounce': 'bounce 1s infinite',
      '--animate-pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    }
  })

  addComponents({
    '@keyframes fade-in': {
      'from': { opacity: 0 },
      'to': { opacity: 1 }
    },
    '@keyframes fade-out': {
      'from': { opacity: 1 },
      'to': { opacity: 0 }
    },
    '@keyframes spin': {
      'to': { transform: 'rotate(360deg)' }
    },
    '@keyframes ping': {
      '75%, 100%': { transform: 'scale(2)', opacity: 0 }
    },
    '@keyframes pulse': {
      '50%': { opacity: 0.5 }
    },
    '@keyframes bounce': {
      '0%, 100%': {
        transform: 'translateY(-25%)',
        animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)'
      },
      '50%': {
        transform: 'none',
        animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)'
      }
    }
  })

  addUtilities({
    '.animate-none': { animation: 'none' },
    '.animate-spin': { animation: 'var(--animate-spin)' },
    '.animate-ping': { animation: 'var(--animate-ping)' },
    '.animate-pulse': { animation: 'var(--animate-pulse)' },
    '.animate-bounce': { animation: 'var(--animate-bounce)' },
    '.animate-fade-in': { animation: 'var(--animate-fade-in)' },
    '.animate-fade-out': { animation: 'var(--animate-fade-out)' }
  })

  return {
    name: 'tailwindcss-animate',
    setup(build) {
      build.onResolve({ filter: /^tailwindcss-animate$/ }, args => {
        return {
          path: resolve(__dirname, 'animate.css'),
        }
      });
    }
  };
}); 