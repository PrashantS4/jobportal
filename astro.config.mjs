// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  security: {
    checkOrigin: false
  },
  adapter: cloudflare({
    platform: 'pages',
    remoteBindings: true, // actually hit the remote Cloudflare D1
    configPath: 'wrangler.jsonc' // point it to the jsonc file because default is .toml
  }),
  vite: {
    ssr: {
      external: ['bcryptjs']
    },
    optimizeDeps: {
      exclude: ['astro', 'bcryptjs']
    }
  }
});