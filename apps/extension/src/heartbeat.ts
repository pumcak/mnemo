import type { Heartbeat } from '@mnemo/contracts';
import type { PlaybackMessage } from './messages';

/**
 * Turns what a page reported into what the service accepts.
 *
 * The extension is the browser capture source, so the kind is fixed and the app
 * is the site. Everything else is carried across unchanged: cleaning up titles
 * is the resolver job, and doing any of it here would throw away what the page
 * actually said.
 */
export const heartbeatFrom = (message: PlaybackMessage, deviceId: string): Heartbeat => ({
  deviceId,
  source: { kind: 'browser', app: message.app },
  rawTitle: message.rawTitle,
  url: message.url,
  state: message.state,
  positionSeconds: message.positionSeconds,
  observedAt: message.observedAt,
  ...(message.durationSeconds === undefined ? {} : { durationSeconds: message.durationSeconds }),
  ...(message.hint === undefined ? {} : { hint: message.hint }),
});
