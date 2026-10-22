import { defineConfig } from 'vite';

const apiOrigin = process.env.COMMUNITY_API_ORIGIN || 'http://127.0.0.1:8787';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: apiOrigin,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            // Preserve the production same-origin write check across the two
            // local dev servers. Cross-site origins are deliberately unchanged.
            if (request.headers.origin === `http://${request.headers.host}`
              || request.headers.origin === `https://${request.headers.host}`) {
              proxyRequest.setHeader('Origin', apiOrigin);
            }
          });
        },
      },
    },
  },
});
