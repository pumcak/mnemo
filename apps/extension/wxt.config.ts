import { defineConfig } from 'wxt';

/**
 * Both browsers get manifest version 3 and the same permissions. WXT turns the
 * background into a service worker on Chrome and an event page on Firefox,
 * which is the one difference that matters and the one we do not have to write.
 */
export default defineConfig({
  srcDir: '.',
  manifest: ({ browser }) => ({
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
    /**
     * Firefox needs an explicit identifier, otherwise it assigns a new one on
     * every install and the extension cannot be updated in place. Chrome has no
     * use for the key, so it is not sent one.
     */
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'mnemo@pumcak.github.io',
              strict_min_version: '128.0',
            },
          },
        }
      : {}),
  }),
});
