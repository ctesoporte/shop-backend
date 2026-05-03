'use strict';

/**
 * Public origin for this API — used when the server fetch()es its own routes (e.g. /shipping/quote).
 * Order: API_BASE_URL, VERCEL_URL, request forwarded Host, then localhost in non-production.
 */
function resolvePublicApiBaseUrl(req) {
  const stripSlash = (u) => String(u || '').trim().replace(/\/+$/, '');

  const fromEnv = stripSlash(process.env.API_BASE_URL);
  if (fromEnv) return fromEnv;

  const vercel = stripSlash(process.env.VERCEL_URL);
  if (vercel) {
    if (/^https?:\/\//i.test(vercel)) return stripSlash(vercel);
    return `https://${vercel}`;
  }

  if (req && typeof req.get === 'function') {
    const xfProto = stripSlash(req.get('x-forwarded-proto'));
    const xfHost = stripSlash(req.get('x-forwarded-host'));
    const host = xfHost || stripSlash(req.get('host'));
    const proto = xfProto || req.protocol || 'https';
    if (host) {
      const scheme = proto === 'http' ? 'http' : 'https';
      return `${scheme}://${host}`;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 4000;
    return stripSlash(`http://127.0.0.1:${port}`);
  }

  return '';
}

module.exports = { resolvePublicApiBaseUrl };
