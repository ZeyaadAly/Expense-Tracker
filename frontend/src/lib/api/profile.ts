"use client";
import { createV2ApiClient, V2ApiError, type V2Envelope, type V2RequestOptions } from "./v2-client";
import { getSession } from "../auth/auth-service";

export type Profile = { userId: string; displayName: string | null; preferredCurrency: "EGP"; locale: "en"; timezone: "Africa/Cairo"; createdAt: string; updatedAt: string };
export type ProfileInput = { displayName: string | null };
function parse(envelope: V2Envelope<unknown> | undefined, write: boolean): Profile {
  const p = envelope?.data as Partial<Profile> | undefined;
  if (!p || typeof p !== "object" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.userId ?? "") ||
      !(p.displayName === null || (typeof p.displayName === "string" && p.displayName.trim() === p.displayName && Array.from(p.displayName).length >= 1 && Array.from(p.displayName).length <= 100)) ||
      p.preferredCurrency !== "EGP" || p.locale !== "en" || p.timezone !== "Africa/Cairo" ||
      ![p.createdAt,p.updatedAt].every(v=>typeof v === "string" && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && Number.isFinite(Date.parse(v)))) {
    throw new V2ApiError(200, "INVALID_RESPONSE", "unexpected", [], write);
  }
  return { userId:p.userId!, displayName:p.displayName!, preferredCurrency:p.preferredCurrency, locale:p.locale, timezone:p.timezone, createdAt:p.createdAt!, updatedAt:p.updatedAt! };
}
export function createProfileClient(expectedUserId?: string, transport = createV2ApiClient(expectedUserId ? {
  tokenSupplier: async () => {
    const result = await getSession();
    if (result.error) return { data:null, error:result.error };
    return { data:result.data?.user.id === expectedUserId ? result.data.access_token : null, error:null };
  },
} : {})) {
  function profile(envelope: V2Envelope<unknown> | undefined, write: boolean) {
    const value = parse(envelope, write);
    if (expectedUserId && value.userId !== expectedUserId) throw new V2ApiError(200,"INVALID_RESPONSE","unexpected",[],write);
    return value;
  }
  return {
    bootstrap: async (options?: V2RequestOptions) => profile(await transport.post('/profile/bootstrap',{},options),true),
    getProfile: async (options?: V2RequestOptions) => profile(await transport.get('/profile',options),false),
    updateProfile: async (input: ProfileInput, options?: V2RequestOptions) => profile(await transport.put('/profile',{displayName:input.displayName},options),true),
  };
}
