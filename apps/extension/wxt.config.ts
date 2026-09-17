import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Mnemo',
    description: 'Records what you watch and sends it to the Mnemo service on this machine.',
    /**
     * Storage holds the settings and the pairing result. Nothing else is asked
     * for: the extension reads what a page already exposes about the video it
     * is playing, so it needs no tab or history permission.
     *
     * The host permission is the loopback service and nothing but it.
     */
    permissions: ['storage'],
    host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'],
  },
});
