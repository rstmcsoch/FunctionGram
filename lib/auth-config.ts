type AuthEnvironment = Record<string, string | undefined>;

// Accept only configured application domains, never all *.vercel.app hosts.
export function authConfiguration(env: AuthEnvironment = process.env) {
  const candidates = [
    env.BETTER_AUTH_URL,
    ...['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL', 'VERCEL_BRANCH_URL']
      .map(key => env[key] ? `https://${env[key]}` : undefined),
    ...(env.AUTH_TRUSTED_ORIGINS || '').split(','),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (!candidates.length && !env.VERCEL) candidates.push('http://localhost:3000');
  const origins = [...new Set(candidates.map(value => {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        (env.VERCEL && url.protocol !== 'https:')) {
      throw new Error('Authentication origins must be HTTP(S) URLs; Vercel requires HTTPS.');
    }
    return url.origin;
  }))];
  if (!origins.length) throw new Error('Configure BETTER_AUTH_URL for this deployment.');
  return {
    baseURL: {
      allowedHosts: origins.map(origin => new URL(origin).host),
      protocol: env.VERCEL ? 'https' as const : 'auto' as const,
    },
    trustedOrigins: origins,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, requireEmailVerification: true },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 15 * 60,
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: {
      enabled: true, storage: 'database' as const, window: 60, max: 30,
      customRules: {
        '/send-verification-email': { window: 60, max: 2 },
        '/sign-up/email': { window: 60, max: 3 },
        '/sign-in/email': { window: 60, max: 5 },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  };
}
