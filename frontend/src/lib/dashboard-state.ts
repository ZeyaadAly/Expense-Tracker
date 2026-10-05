import type { Filters } from "./transactions";

// Separate requests can observe different committed moments. Only compare counts
// that can actually be compared; a filtered count may be smaller than the total.
export function countsConflict(filters: Filters, listCount: number | undefined, overallCount: number | undefined) {
  if (listCount === undefined || overallCount === undefined) return false;
  return filters.type === "all" && filters.category === "all" ? listCount !== overallCount : listCount > overallCount;
}
