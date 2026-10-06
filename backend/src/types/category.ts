export type CategoryKind = "income" | "expense" | "both";
export type CategoryStatus = "active" | "archived";
export interface CategoryResource {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  status: CategoryStatus;
  isSystem: boolean;
}
export interface CategoryFilters { kind?: CategoryKind; status: CategoryStatus }
