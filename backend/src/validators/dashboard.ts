import { validationError } from "../utils/api-error.js";

export const dashboardPeriods = ["this_month","last_month","3_months","6_months","1_year"] as const;
export type DashboardPeriod = typeof dashboardPeriods[number];

export function validateDashboardQuery(originalUrl:string):DashboardPeriod {
  const query = new URL(originalUrl,"http://localhost").searchParams;
  const errors = [];
  for (const key of new Set(query.keys())) {
    if (key !== "period") errors.push({field:key,message:"This query parameter is not supported."});
    else if (query.getAll(key).length !== 1) errors.push({field:key,message:"Provide this parameter only once."});
  }
  const period = query.get("period") ?? "this_month";
  if (!(dashboardPeriods as readonly string[]).includes(period)) errors.push({field:"period",message:"Choose this_month, last_month, 3_months, 6_months or 1_year."});
  if (errors.length) throw validationError(errors);
  return period as DashboardPeriod;
}
