"use client";
import { createSessionClient } from "./session-client";
import { V2ApiError, type V2RequestOptions } from "./v2-client";
export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense" | "both";
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  status: "active" | "archived";
};
export type CategoryInput = Pick<Category, "name" | "kind" | "icon" | "color">;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fields = ["id", "name", "kind", "icon", "color", "isSystem", "status"];
const invalid = (write = false) => new V2ApiError(200, "INVALID_RESPONSE", "unexpected", [], write);
export function validateCategoryInput(input: CategoryInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const validText = (value: string, max: number) => !!value.trim() && Array.from(value.trim()).length <= max && !/[\p{Cc}\p{Cs}]/u.test(value) && /[^\p{Cf}\s]/u.test(value);
  if (!validText(input.name, 80)) errors.name = "Enter 1 to 80 characters. Control characters are not allowed.";
  if (!["income", "expense", "both"].includes(input.kind)) errors.kind = "Choose income, expense or both.";
  if (input.icon !== null && !validText(input.icon, 64)) errors.icon = "Enter 1 to 64 characters or leave blank.";
  if (input.color !== null && !validText(input.color, 16)) errors.color = "Enter 1 to 16 characters or leave blank.";
  return errors;
}
function parseCategory(value: unknown, write = false): Category {
  const row = value as Partial<Category> | undefined;
  if (!row || typeof row !== "object" || Array.isArray(row) || !uuid.test(row.id ?? "") || typeof row.name !== "string" || !row.name.trim() ||
    !["income", "expense", "both"].includes(row.kind ?? "") || !["active", "archived"].includes(row.status ?? "") || typeof row.isSystem !== "boolean" ||
    !(row.icon === null || typeof row.icon === "string") || !(row.color === null || typeof row.color === "string") || Object.keys(row).some(k => !fields.includes(k))) throw invalid(write);
  return row as Category;
}
export function createCategoryClient(userId: string, transport = createSessionClient(userId)) {
  const editable = (input: CategoryInput): CategoryInput => ({name:input.name,kind:input.kind,icon:input.icon,color:input.color});
  const path = (id: string) => { if (!uuid.test(id)) throw new V2ApiError(0, "INVALID_REQUEST", "unexpected"); return `/categories/${id}`; };
  const resource = (value: unknown, id?: string) => { const category = parseCategory((value as {data?:unknown}|undefined)?.data, true); if (id && category.id !== id) throw invalid(true); return category; };
  return {
    async listCategories(status: Category["status"] = "active", options?: V2RequestOptions): Promise<Category[]> {
      const response = await transport.get<unknown, { count: number }>("/categories", {
        ...options,
        query: { status },
      });
      if (!Array.isArray(response?.data) || response.meta?.count !== response.data.length) throw invalid();
      const rows = response.data.map(row => parseCategory(row));
      if (rows.some(row => row.status !== status) ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw invalid();
      return rows;
    },
    createCategory: async (input: CategoryInput, options?: V2RequestOptions) => resource(await transport.post("/categories", editable(input), options)),
    updateCategory: async (id: string, input: CategoryInput, options?: V2RequestOptions) => resource(await transport.put(path(id), editable(input), options), id),
    async archiveCategory(id: string, options?: V2RequestOptions) {
      const response = await transport.post(path(id) + "/archive", {}, options);
      const category = resource(response, id);
      const meta = response?.meta as {pausedRecurringCount?:unknown}|undefined;
      if (category.status !== "archived" || !meta || !Number.isSafeInteger(meta.pausedRecurringCount) || (meta.pausedRecurringCount as number) < 0) throw invalid(true);
      return {category, pausedRecurringCount: meta.pausedRecurringCount as number};
    },
    async restoreCategory(id: string, options?: V2RequestOptions) {
      const category = resource(await transport.post(path(id) + "/restore", {}, options), id);
      if (category.status !== "active") throw invalid(true);
      return category;
    },
  };
}
