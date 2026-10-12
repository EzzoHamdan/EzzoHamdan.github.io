// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://ezzohamdan.github.io',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  i18n: {
    locales: ['en', 'ar'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  fonts: [
    {
      // Inscriptional capitals, like the lettering engraved on astrolabes
      provider: fontProviders.fontsource(),
      name: 'Marcellus',
      cssVariable: '--font-display',
      weights: [400],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['serif'],
    },
    {
      // Geometric Kufic for Arabic headings
      provider: fontProviders.fontsource(),
      name: 'Reem Kufi',
      cssVariable: '--font-kufi',
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['arabic'],
      fallbacks: ['sans-serif'],
    },
    {
      // Body text in both scripts, designed together
      provider: fontProviders.fontsource(),
      name: 'Readex Pro',
      cssVariable: '--font-text',
      weights: ['200 700'],
      styles: ['normal'],
      subsets: ['latin', 'arabic'],
      fallbacks: ['sans-serif'],
    },
  ],
});
