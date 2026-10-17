// T67 release controls. Production defaults to maintenance; no stage is inferred
// from a public URL, request parameter, browser storage or JWT metadata.
export type ReleaseStage = "maintenance" | "read-only" | "controlled" | "public";
export type ReleaseConfig = {
  stage: ReleaseStage;
  acceptanceUserIds: readonly string[];
  cronEnabled: boolean;
};

export function readReleaseConfig(input: Record<string, string | undefined>, production = true): ReleaseConfig {
  const stage = input.V2_RELEASE_STAGE?.trim() || (production ? "maintenance" : "public");
  if (!["maintenance", "read-only", "controlled", "public"].includes(stage)) {
    throw new Error("V2_RELEASE_STAGE must name a supported release stage");
  }
  const acceptanceUserIds = (input.V2_ACCEPTANCE_USER_IDS?.trim() || "").split(",").map(v => v.trim()).filter(Boolean);
  if (acceptanceUserIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) ||
      new Set(acceptanceUserIds).size !== acceptanceUserIds.length) {
    throw new Error("V2_ACCEPTANCE_USER_IDS must contain distinct canonical UUIDs");
  }
  if (["read-only", "controlled"].includes(stage) && !acceptanceUserIds.length) {
    throw new Error("V2_ACCEPTANCE_USER_IDS is required for controlled acceptance");
  }
  if (input.V2_CRON_ENABLED && !["true", "false"].includes(input.V2_CRON_ENABLED)) {
    throw new Error("V2_CRON_ENABLED must be true or false");
  }
  return Object.freeze({
    stage: stage as ReleaseStage,
    acceptanceUserIds: Object.freeze(acceptanceUserIds),
    cronEnabled: ["controlled", "public"].includes(stage) && input.V2_CRON_ENABLED === "true",
  });
}
