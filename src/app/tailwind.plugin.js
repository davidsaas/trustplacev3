// This file replaces the functionality that was previously provided by the tailwindcss-animate plugin
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function animatePlugin() {
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
} 