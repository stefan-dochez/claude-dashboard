import { useEffect, useState } from 'react';

// Module-level cache: the GitHub user only changes when the user re-auths
// `gh`, which doesn't happen inside a dashboard session. Fetch once, reuse
// across every AggregatedPrView mount. `inflight` dedupes concurrent mounts
// so a tab-switch burst doesn't fire N identical requests.
let cached: string | null | undefined;
let inflight: Promise<string | null> | null = null;

async function fetchGithubUser(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;
  inflight = fetch('/api/git/github-user')
    .then(r => r.json())
    .then((data: { login: string | null }) => {
      cached = data.login;
      return cached;
    })
    .catch(() => {
      cached = null;
      return null;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * Returns the authenticated GitHub user (`gh auth` login) or null.
 * `loading` is true until the first fetch resolves; subsequent mounts
 * resolve synchronously from the module-level cache.
 */
export function useGithubUser(): { user: string | null; loading: boolean } {
  const [user, setUser] = useState<string | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    if (cached !== undefined) return;
    let cancelled = false;
    fetchGithubUser().then(u => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
}
