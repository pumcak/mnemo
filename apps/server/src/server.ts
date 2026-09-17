import { serve } from '@hono/node-server';
import { createApp } from './app';
import { parseConfig } from './config';

const config = parseConfig(process.env);

serve({ fetch: createApp().fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`mnemo is listening on http://${config.host}:${info.port}`);
});
