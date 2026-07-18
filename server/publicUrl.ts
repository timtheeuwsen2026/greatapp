interface RequestOriginLike {
  protocol?: string;
  get?: (name: string) => string | undefined;
}

const LOCAL_HOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i;

export function normalizePublicAppBaseUrl(
  value: string,
  options: { production?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("VITE_APP_BASE_URL must be a valid absolute URL");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("VITE_APP_BASE_URL must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("VITE_APP_BASE_URL cannot contain credentials, a query, or a hash");
  }

  const production = options.production ?? process.env.NODE_ENV === 'production';
  if (production && (parsed.protocol !== 'https:' || LOCAL_HOST_PATTERN.test(parsed.hostname))) {
    throw new Error("VITE_APP_BASE_URL must be a public HTTPS URL in production");
  }

  return parsed.toString().replace(/\/$/, '');
}

export function getConfiguredPublicAppBaseUrl(): string {
  const configured = process.env.VITE_APP_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (configured) return normalizePublicAppBaseUrl(configured);
  if (process.env.NODE_ENV === 'production') {
    throw new Error("VITE_APP_BASE_URL must be configured in production");
  }
  return `http://localhost:${process.env.PORT || '4000'}`;
}

export function getPublicAppBaseUrl(req?: RequestOriginLike): string {
  const configured = process.env.VITE_APP_BASE_URL?.trim() || process.env.APP_BASE_URL?.trim();
  if (configured || process.env.NODE_ENV === 'production') {
    return getConfiguredPublicAppBaseUrl();
  }

  const host = req?.get?.('host');
  if (host) {
    return normalizePublicAppBaseUrl(`${req?.protocol || 'http'}://${host}`, { production: false });
  }
  return getConfiguredPublicAppBaseUrl();
}

export function buildAppAuthActionUrl(
  actionLink: string,
  destination: string,
  expectedType: string,
): string {
  const actionUrl = new URL(actionLink);
  const tokenHash = actionUrl.searchParams.get('token_hash')
    || actionUrl.searchParams.get('token');
  const actionType = actionUrl.searchParams.get('type');

  if (!tokenHash || actionType !== expectedType) {
    throw new Error(`Invalid Supabase ${expectedType} action link`);
  }

  const appUrl = new URL(destination);
  appUrl.searchParams.set('token_hash', tokenHash);
  appUrl.searchParams.set('type', expectedType);
  return appUrl.toString();
}
