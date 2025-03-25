// This file replaces the functionality that was previously provided by the tailwindcss-animate plugin
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const plugin = require('tailwindcss/plugin')

const __dirname = dirname(fileURLToPath(import.meta.url));

module.exports = plugin(function ({ addBase, addComponents, addUtilities }) {
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