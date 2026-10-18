# Active route loading

The user's follow-up replaces the earlier permission to retain route-code prefetch. V2 now disables prefetch for every internal link, including navigation, Dashboard previews, account links and Auth links. The shared RouteLink fixes `prefetch={false}`; callers cannot accidentally re-enable it. No explicit router prefetch exists.

Only a deliberate navigation requests the selected route. While a cold route payload loads, the shell shows an accessible page skeleton and keeps navigation available. The old page content is hidden while pending without unmounting its link observer. Next's route loading boundary also provides the same fallback. Once the destination mounts, its existing domain-specific data skeleton covers its actual financial reads. These placeholders make no financial requests themselves.

The pending signal comes from Next's `useLinkStatus`, scoped to the current shell. Mobile navigation also sets the pending state before its drawer closes. This does not introduce a financial cache, mount other pages, change backend calculations, or bypass the route stores' cancellation/session safeguards. Selecting the current navigation item does not start a false loading state.

The prior report and verification JSON remain historical evidence of the density refinement. Their statements allowing code prefetch are superseded by this document. Initial financial API counts remain unchanged; inactive-route/RSC prefetch must now be zero as well.

## Verification

- Optimized production build, lint and typecheck pass. All186 frontend tests pass, with zero failures/skips.
- `active-only.mjs`: five behavior checks pass. Desktop1440 and phone360 cold navigation show the page skeleton while the real route response is deliberately held, then the existing transaction skeleton during delayed financial reads, then the real ledger. Both skeleton axe audits pass, with no overflow or page errors. All four Auth routes have zero route prefetch on entry and hover.
- `network.mjs`: six checks pass. All nine protected routes have zero initial RSC prefetch; Dashboard idle and every visible internal-link hover cause zero extra route/API requests. The three recorded RSC payloads occur only after explicit navigation. Back reactivates Dashboard with one aggregate read; leaving an in-flight Transactions page aborts five reads. The test waits for the destination heading as well as its URL: route loading can commit the URL before the actual page renders.
- Functional regression:16 groups and13 axe audits pass. Auth regression: six groups and eight axe audits pass. Financial behavior and session/cancellation protections remain intact.
- `git diff --check` and the source/build/docs recognized-pattern secret scan pass.

Evidence: [network log](assets/active-only/network.json), [cold navigation](assets/active-only/active-only.json), [desktop skeleton](assets/active-only/route-skeleton-1440.png), [phone skeleton](assets/active-only/route-skeleton-360.png), [functional regression](assets/active-only/functional.json), [Auth regression](assets/active-only/auth.json). Auth-provider responses are synthetic; financial reads/writes use the real isolated local backend and PostgreSQL. No production deployment or main merge is performed.
