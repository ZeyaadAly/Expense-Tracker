import { Skeleton } from "./primitives";

export function RouteSkeleton() {
  return <section data-route-skeleton role="status" aria-label="Loading page" aria-busy="true">
    <h1 className="v2-sr-only">Loading page</h1>
    <div aria-hidden="true">
    <Skeleton variant="metric" />
    <Skeleton variant="chart" />
    <Skeleton variant="transaction" />
    </div>
  </section>;
}
