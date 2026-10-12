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
export function createCategoryClient(userId: string, transport = createSessionClient(userId)) {
  return {
    async listCategories(status: Category["status"] = "active", options?: V2RequestOptions): Promise<Category[]> {
      const response = await transport.get<unknown, { count: number }>("/categories", {
        ...options,
        query: { status },
      });
      const invalid = () => new V2ApiError(200, "INVALID_RESPONSE", "unexpected");
      if (!Array.isArray(response?.data) || response.meta?.count !== response.data.length) throw invalid();
      const rows = response.data as Category[];
      if (
        rows.some(
          (row) =>
            !row ||
            typeof row !== "object" ||
            !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.id) ||
            typeof row.name !== "string" ||
            !row.name.trim() ||
            !["income", "expense", "both"].includes(row.kind) ||
            row.status !== status ||
            typeof row.isSystem !== "boolean" ||
            !(row.icon === null || typeof row.icon === "string") ||
            !(row.color === null || typeof row.color === "string") ||
            Object.keys(row).some((k) => !["id", "name", "kind", "icon", "color", "isSystem", "status"].includes(k)),
        ) ||
        new Set(rows.map((r) => r.id)).size !== rows.length
      )
        throw invalid();
      return rows;
    },
  };
}
