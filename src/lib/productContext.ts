// Product Context Resolution
//
// The EIOS platform hosts two products distinguished by pathname:
//   /        -> EIOS  (https://eios.bolt.host/#/...)
//   /llnd    -> LLND Automate  (https://eios.bolt.host/llnd#/...)
//   /lln     -> legacy LLND path, migrated to /llnd
//
// The pathname is the product boundary. The hash route is resolved within
// the product context. The two products must never interchange routes.

export type Product = 'eios' | 'llnd';

const LLND_PATH = '/llnd';
const LEGACY_LLN_PATH = '/lln';

/**
 * Resolve the product context from the current pathname.
 * Performs legacy /lln -> /llnd migration via history.replaceState
 * (no extra history entry, no redirect loop) before returning.
 */
export function resolveProduct(): Product {
  if (typeof window === 'undefined') return 'eios';

  const pathname = window.location.pathname;

  // Legacy /lln -> /llnd migration (preserve hash + search)
  if (pathname === LEGACY_LLN_PATH || pathname.startsWith(LEGACY_LLN_PATH + '/')) {
    const replacement = LLND_PATH + pathname.slice(LEGACY_LLN_PATH.length);
    const fullUrl = replacement + window.location.search + window.location.hash;
    history.replaceState(null, '', fullUrl);
    return 'llnd';
  }

  if (pathname === LLND_PATH || pathname.startsWith(LLND_PATH + '/')) {
    return 'llnd';
  }

  return 'eios';
}

/**
 * Navigate within a product context, preserving the pathname boundary.
 * Only mutates the hash; the pathname stays as-is.
 */
export function navigateInProduct(product: Product, hash: string): void {
  const target = product === 'llnd' ? LLND_PATH : '/';
  const current = window.location.pathname;
  const normalisedHash = hash.startsWith('#') ? hash : `#${hash}`;

  if (current !== target) {
    // Cross-product navigation: replace pathname + hash together
    history.replaceState(null, '', target + normalisedHash);
    // Trigger hashchange so React state picks it up
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    if (window.location.hash !== normalisedHash) {
      window.location.hash = normalisedHash;
    }
  }
}

/**
 * Migrate any persisted values containing /lln to /llnd.
 * Scans localStorage and sessionStorage for known redirect/route keys.
 */
export function migrateLegacyLlnPaths(): void {
  if (typeof window === 'undefined') return;

  const keysToCheck: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keysToCheck.push(k);
    }
  } catch { /* ignore */ }

  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k) keysToCheck.push(k);
    }
  } catch { /* ignore */ }

  for (const key of keysToCheck) {
    try {
      // localStorage
      let value = localStorage.getItem(key);
      if (value && value.includes('/lln') && !value.includes('/llnd')) {
        const migrated = value.replace(/\/lln(?!d)/g, '/llnd');
        localStorage.setItem(key, migrated);
        continue;
      }
    } catch { /* ignore */ }

    try {
      // sessionStorage
      let value = sessionStorage.getItem(key);
      if (value && value.includes('/lln') && !value.includes('/llnd')) {
        const migrated = value.replace(/\/lln(?!d)/g, '/llnd');
        sessionStorage.setItem(key, migrated);
      }
    } catch { /* ignore */ }
  }
}

/**
 * Returns true if a hash route belongs to EIOS product.
 * EIOS routes: engineering, platform, administration, login, oauth, root/marketing
 */
export function isEiosRoute(hash: string): boolean {
  const h = hash.replace(/^#\/?/, '').split('?')[0];
  if (!h || h === '') return true;
  const first = h.split('/')[0];
  return ['engineering', 'platform', 'administration', 'login', 'oauth',
    'home', 'about', 'features', 'how-it-works', 'resources', 'contact',
    'pricing', 'signup', 'forgot-password'].includes(first);
}

/**
 * Returns true if a hash route belongs to LLND Automate product.
 * LLND routes: assessment, trainer, candidates, results, settings, llnd-automate
 */
export function isLlndRoute(hash: string): boolean {
  const h = hash.replace(/^#\/?/, '').split('?')[0];
  if (!h || h === '') return false;
  const first = h.split('/')[0];
  return ['assessment', 'trainer', 'candidates', 'results', 'settings',
    'llnd-automate', 'lln', 'digital', 'quiz', 'student'].includes(first);
}
