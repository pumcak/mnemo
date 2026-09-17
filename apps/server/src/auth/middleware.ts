import type { MiddlewareHandler } from 'hono';
import { tokenMatches } from './token';

const bearerPrefix = 'Bearer ';

/**
 * Requires the pairing token on every request that touches the history.
 *
 * Loopback is not a security boundary: every page the browser has open can send
 * requests to this port. The token is what a page cannot obtain, so it is what
 * the guard asks for.
 */
export const requireToken = (token: string): MiddlewareHandler => {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const provided = header.startsWith(bearerPrefix) ? header.slice(bearerPrefix.length) : '';

    if (!tokenMatches(token, provided)) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    await next();
  };
};

const localHostnames = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Refuses requests that arrived under a hostname other than the loopback ones.
 *
 * Without this, a page can point a domain it owns at 127.0.0.1 and have the
 * browser treat this service as same origin with that domain, which is the DNS
 * rebinding trick. The bound interface does not protect against it, because the
 * request really does arrive on loopback. The Host header is what gives it away.
 */
export const requireLocalHost = (): MiddlewareHandler => {
  return async (c, next) => {
    // A real HTTP/1.1 request always carries Host, and the browser is the one
    // filling it in, so it cannot be omitted by an attacking page. When it is
    // absent the caller is in process, and the url hostname is what remains.
    const header = c.req.header('host') ?? new URL(c.req.url).hostname;
    const hostname = header.replace(/:\d+$/, '');

    if (!localHostnames.has(hostname)) {
      return c.json({ error: 'forbidden host' }, 403);
    }

    await next();
  };
};
