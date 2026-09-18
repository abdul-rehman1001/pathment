# TanStack Query in Pathment

How we use it, where we deliberately don't, and the reasoning behind both — including
the parts worth being able to defend in an interview.

---

## 1. The problem it solves here

Before this, every hook was a hand-rolled `useState` + `useEffect` + `axios` triple:

```ts
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
useEffect(() => { api.get().then(setData).catch(...).finally(...) }, [deps]);
```

That works, and it is honest code. What it cannot do is know that another component
already asked for the same thing. So:

- The notification bell renders twice (desktop sidebar + mobile header, hidden by CSS
  only). Two components, two fetches, two sockets, one number on screen.
- `/changelog` was fetched by `ChangelogMount` and `ChangelogDrawer`, both mounted in
  every portal layout.
- Effects keyed on `pathname` refetched on every client-side navigation.
- Nothing shared a cache, so navigating back to a page refetched everything.

Roughly eighteen API calls fired before the user touched anything, and users hit the
server's rate limiter during normal work. Deduplication and caching are exactly what a
query library is for.

## 2. The shape we use

Three files, in `lib/query/`:

| File | Purpose |
|---|---|
| `client.ts` | `QueryClient` defaults — staleness, retry policy, the `STALE` presets |
| `keys.ts` | `qk` — every query key in one hierarchical object |
| `useApiQuery.ts` | `useQuery` mapped onto this codebase's `{ loading, error, refetch }` hook contract |

`QueryProvider` is mounted in `app/layout.tsx`, above every other provider, because
`ClanProvider` and the auth-dependent hooks query inside it.

### Writing a hook

```ts
export function useTracks(menteeId: string | null): UseTracksReturn {
  const { data, loading, error, refetch } = useApiQuery<Track[]>({
    queryKey: qk.mentor.tracks(menteeId ?? ''),
    queryFn: async () => (await tracksApi.listForMentee(menteeId!))?.data?.tracks ?? [],
    enabled: !!menteeId,
    errorMessage: 'Failed to load tracks',
  });

  return { tracks: data ?? EMPTY, loading, error, refetch };
}
```

Two rules that made the migration safe:

1. **Keep the hook's return shape.** Every hook here already returned
   `{ thing, loading, error, refetch }`. `useApiQuery` returns the same, so hooks were
   migrated without touching a single component.
2. **Return a stable empty value.** `data ?? EMPTY` with a module-level `const EMPTY = []`
   — not `?? []`, which allocates a new array each render and breaks `useMemo` downstream.

### Three patterns worth copying

The mechanical swap covers most hooks. These three came up repeatedly and are the parts
that are easy to get wrong.

**Derived defaults, not synced state.** Several hooks auto-selected something once data
arrived — the first enrollment, the first program, a clan's community space — via an
effect that wrote state. Don't. Compute the default and let an explicit choice win:

```ts
const [override, setSelected] = useState<string | null>(null);
const defaultId = useMemo(() => list.find(isActive)?.id ?? null, [list]);
const selectedId = override ?? defaultId;
```

No effect means nothing can fall out of step when the list refetches.

**Forms: draft over server, never a copy.** A settings or review form seeded from server
data must not copy that data into state on load — that is precisely the stale-state bug
the library exists to prevent, and in the review form it would show a *previous task's*
prefill. Hold the edit separately and fall back to the server value:

```ts
const [draft, setDraft] = useState<T | null>(null);
const value = draft ?? serverValue;          // read
const onSave = async () => { await save(value); setDraft(null); await invalidate(key); };
```

If the exposed setter must accept the `SetStateAction` form, resolve the updater against
`draft ?? serverValue` so callers never see the draft's `null`
(`lib/hooks/admin/useAdminSettings.ts` has the wrapper).

**Poll only while it matters.** `refetchInterval` accepts a function, so a poll can stop
on its own instead of running for the life of the page:

```ts
refetchInterval: (docs) => (docs?.some((d) => d.status === 'processing') ? 10_000 : false),
```

### Telling 403 from 404

`useApiQuery` returns `errorStatus` alongside `error`. Pages use it with the shared
`components/shared/ResourceError.tsx` to render the three real outcomes rather than a flat
"not found" — which is what made a paused mentee look like missing data for weeks. Expose
it from the hook when a detail page needs it; note that hooks whose return type is built
with `Omit<..., 'error'>` need `errorStatus` in that omit list too.

### Invalidating after a write

```ts
const invalidate = useInvalidate();
await enrollmentApi.approveCompletion(id);
await invalidate(qk.mentee.tasks(menteeId), qk.mentor.cohort);
```

Keys are hierarchical, so a prefix clears everything beneath it: `qk.mentee.all`
invalidates every mentee query; `qk.mentee.profile(id)` invalidates one.

### Socket events invalidate; they don't re-fetch by hand

```ts
socket.on('notification:unread-count', () => client.invalidateQueries({ queryKey: key }));
```

The server says "something changed", the cache marks itself stale, and whatever is
mounted refetches once. Previously each mounted bell re-read the list itself.

## 3. Configuration, and why

```ts
staleTime: 60_000        // STALE.medium
gcTime: 5 * 60_000
refetchOnWindowFocus: true
retry: (count, error) => status >= 500 || no status ? count < 2 : false
```

**`staleTime` is the single most important setting.** The library default is `0`, meaning
every query is stale the instant it arrives, so it refetches on every mount and every
window focus. That default is what gives TanStack a reputation for being chatty — it is a
configuration choice, not a property of the library. We set 30s / 60s / 5min presets
(`STALE.short` / `medium` / `long`) by how fast the data actually changes.

**`refetchOnWindowFocus: true` is safe *because* of `staleTime`.** A query only refires on
focus if its data is older than its staleTime. This replaced a hand-rolled
`useRefreshOnReturn` hook that existed only because `focus` and `visibilitychange` both
fire on one alt-tab and we were making two requests per switch.

**The retry policy is deliberately narrow.** TanStack retries 3 times by default. Retrying
a 429 is actively harmful — it spends the very budget that just rejected us — and a
401/403/404 will not change by asking again. So we retry only network faults and 5xx, and
on a rate-limit we wait the server's own `Retry-After` (`retryDelay` reads
`getRateLimit(error)`).

## 4. What we deliberately did NOT migrate

Query caching is for data you read. It is the wrong tool for anything live, imperative, or
time-critical, and forcing it in makes the code worse.

| Stays as-is | Why |
|---|---|
| `ReviewMeetingPanel` roster (8s) | Live call attendance. Needs a guaranteed cadence, not a staleness heuristic. |
| `ReviewJoinBar` active review (12s) | A mentee must see "join now" promptly. |
| `LiveMeetingBanner` (45s) | Same. |
| `CallContext` talk-flush + guest heartbeat | Writes, not reads. Fire-and-forget presence. |
| `useActivityTracker` heartbeat | A write beacon; also exempt from the server rate limit. |
| `useProctor` | Interview capture on a fixed timer. |
| `ThemeContext` appearance | Fires once per session and applies to the DOM imperatively; localStorage is the source of truth. Caching it risks a theme flash for no gain. |
| `MessageCenter` conversations | A heavily-mutated local working set, not a cached read: eight sites apply optimistic sends, archiving and unread updates. Moving it into the cache would be a rewrite of a realtime component to save one request. |
| The `apply/[slug]` and `apply/status/[token]` pages | Unauthenticated, token-based, single-use. A 403 cannot fire on a public endpoint, and caching an application's status would show an applicant a stale result right after they submit. |
| `auth-session` refresh | Owns its own single-flight and backoff, and must work before React renders. |

These use `usePolling` (`lib/hooks/shared/usePolling.ts`), which honours a 429's
`retryAfter` instead of hammering through it.

**Rule of thumb:** if the question is *"what is the current value of X?"* it is a query.
If it is *"tell the server I am still here"* or *"this must run every N seconds no matter
what"*, it is not.

## 5. Trade-offs

**What we gain:** request deduplication across components; a cache so back-navigation is
instant; one place to configure retry and staleness; background refetch with stale data on
screen instead of a spinner; automatic garbage collection; devtools that show every query's
state.

**What it costs:**

- **A dependency and ~13KB gzipped.** Small, but not nothing.
- **A second source of truth.** Server state now lives in the cache, not in component
  state. Forgetting to invalidate after a mutation shows stale data — a failure mode the
  old code could not have, because it had no cache to be wrong.
- **Cache-key discipline.** A key that misses a dependency (a filter, a user id) serves one
  user's data to another. This is why `keys.ts` exists rather than inline arrays.
- **Defaults that mislead.** `staleTime: 0` and `retry: 3` are wrong for most apps. A team
  that adopts the library without configuring it can end up *more* chatty than before.
- **Debugging indirection.** "Why did this refetch?" now has more possible answers: mount,
  focus, reconnect, invalidation, interval.

## 6. What if we didn't use it?

The honest answer is that we would rebuild a worse version of it — we already had. The
codebase contained a module-level cache in `usePermissions`, a single-flight promise in
`auth-session`, and (briefly) a hand-written subscribable store for notifications. Each was
correct in isolation and each solved one slice of the same problem, with no shared
conventions and no devtools.

The alternative that genuinely works is **lifting server state into React Context** and
fetching once at the top. That is fine for three or four values; it becomes a bottleneck
because any change re-renders every consumer, and it gives you no staleness, retry, or
background-refetch story.

## 7. Alternatives worth naming

| Option | When it is the better call |
|---|---|
| **SWR** | Smaller and simpler; excellent for read-mostly UIs. Weaker mutation/invalidation story than TanStack. Same authors' philosophy, less machinery. |
| **RTK Query** | Already on Redux Toolkit. Codegen from an OpenAPI spec, and cache tags built in. Bringing Redux in *just* for this is not worth it. |
| **Apollo / urql** | GraphQL. The normalised cache is a genuine advantage when many views share entities. We are REST, so not applicable. |
| **Next.js server-side fetching** (Server Components + `fetch` cache, or Server Actions) | Data needed on first paint, SEO, or things that should never reach the client. Pathment is an authenticated SPA-style dashboard behind a token in `localStorage`, so most screens are client-rendered and a client cache is the right layer. A sensible future direction for the public pages (`/programs`, cohort apply links). |
| **Hand-rolled** | A handful of endpoints, or a constraint against dependencies. Below roughly ten hooks the library is not obviously worth it. |

## 8. Interview-angle summary

If asked *"why TanStack Query?"*, the useful answer is not "it caches". It is:

> Server state is not client state. It is asynchronous, shared between components, owned by
> someone else, and can go stale without anyone telling you. `useState` models none of that,
> so every app that uses `useState` for it eventually reimplements deduplication, caching,
> retries and invalidation — badly, and in several places at once. A query library makes
> that machinery explicit and configurable.

And the follow-up worth volunteering: *the defaults are not the recommendation*.
`staleTime: 0` plus `retry: 3` is how teams end up shipping something chattier than what
they replaced. Configure staleness by how fast the data actually changes, and never retry a
response the server gave you deliberately.
