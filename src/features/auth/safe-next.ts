const SAME_SITE = "http://invoice.local";

/**
 * Where to send someone after login. Only a path on this site is allowed.
 *
 * A prefix test ("starts with /, but not //") is not enough: the URL parser
 * strips ASCII tab, CR and LF *before* parsing, so "/\t/evil.com" passes the
 * prefix test and then resolves to https://evil.com/. That is a credential
 * phishing vector, because the victim types their password into the real
 * login page and only then lands on the attacker's. So: reject control
 * characters outright, then keep nothing but the path and query of a URL
 * that actually resolves to this origin.
 */
export function safeNext(next: string): string {
  if (!next || /[\u0000-\u001f\u007f]/.test(next)) return "/";
  try {
    const url = new URL(next, SAME_SITE);
    if (url.origin !== SAME_SITE) return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}
