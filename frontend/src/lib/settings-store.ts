import type { Profile, createProfileClient } from "./api/profile";
import type { Category, createCategoryClient } from "./api/categories";

type Failure = { message: string; fields: Record<string, string>; uncertain: boolean };
type Section<T> = { data: T | null; loading: boolean; error: string | null; stale: boolean };
type State = {
  profile: Section<Profile>;
  active: Section<Category[]>;
  archived: Section<Category[]>;
  profilePending: boolean;
  categoryPending: boolean;
  profileFailure: Failure | null;
  categoryFailure: Failure | null;
  profileNotice: string | null;
  categoryNotice: string | null;
  profileInspectionReady: boolean;
  categoryInspectionReady: boolean;
  authError: boolean;
};
const section = <T>(): Section<T> => ({ data: null, loading: true, error: null, stale: false });
const initial: State = { profile: section<Profile>(), active: section<Category[]>(), archived: section<Category[]>(), profilePending: false, categoryPending: false, profileFailure: null, categoryFailure: null, profileNotice: null, categoryNotice: null, profileInspectionReady: false, categoryInspectionReady: false, authError: false };
const authFailure = (error: unknown) => { const e = error as {status?:number;code?:string}; return e.status === 401 || e.code === "AUTH_REQUIRED" || e.code === "AUTH_INVALID"; };
const failure = (error: unknown, domain: "profile" | "category"): Failure => {
  const e = error as {code?:string;message?:string;uncertain?:boolean;details?:{field:string;message:string}[]};
  const messages: Record<string,string> = {
    CONFLICT: "You already have a custom category with this name, including archived categories.",
    CATEGORY_IMMUTABLE: "System categories cannot be changed.",
    CATEGORY_KIND_LOCKED: "This category is used by financial records. Its kind cannot change.",
    CATEGORY_ARCHIVED: "This category is archived. Restore it before editing.",
    NOT_FOUND: "This item is unavailable. Refresh this section to inspect the current state.",
  };
  return { uncertain: !!e.uncertain, fields: Object.fromEntries((e.details ?? []).filter(d => ["displayName","name","kind","icon","color"].includes(d.field)).map(d => [d.field,d.message])), message: e.uncertain ? `We could not confirm the ${domain} change. Refresh and inspect current data before trying again.` : messages[e.code ?? ""] ?? e.message ?? "The change could not be saved. Your draft is preserved." };
};

export function createSettingsStore(profileClient: ReturnType<typeof createProfileClient>, categoryClient: ReturnType<typeof createCategoryClient>) {
  let state = initial, generation = 0;
  const listeners = new Set<() => void>();
  const controllers = new Map<string, AbortController>();
  const publish = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const stop = () => { generation++; controllers.forEach(c => c.abort()); controllers.clear(); publish(initial); };
  const handleAuth = (error: unknown) => { if (!authFailure(error)) return false; stop(); publish({ ...initial, authError: true }); return true; };
  async function read<T>(key: "profile" | "active" | "archived", get: (signal:AbortSignal)=>Promise<T>) {
    if (state.authError) return false;
    controllers.get(key)?.abort();
    const controller = new AbortController(), life = generation;
    controllers.set(key, controller);
    publish({ [key]: { ...state[key], loading: true, error: null } });
    try {
      const data = await get(controller.signal);
      if (life !== generation || controllers.get(key) !== controller) return false;
      publish({ [key]: { data, loading: false, error: null, stale: false }, ...(key === "profile" && state.profileFailure?.uncertain ? { profileInspectionReady: true } : key !== "profile" && state.categoryFailure?.uncertain && (key === "active" ? !state.archived.error && !state.archived.loading : !state.active.error && !state.active.loading) ? { categoryInspectionReady: true } : {}) });
      return true;
    } catch (error) {
      if (life !== generation || controllers.get(key) !== controller) return false;
      if (handleAuth(error)) return false;
      publish({ [key]: { ...state[key], loading: false, error: `${key === "profile" ? "Profile" : "Categories"} could not refresh.`, stale: state[key].data !== null } });
      return false;
    }
  }
  const refreshProfile = () => read("profile", signal => profileClient.getProfile({ signal }));
  const refreshCategories = (status: "active" | "archived") => read(status, signal => categoryClient.listCategories(status, { signal }));
  async function write(domain: "profile" | "category", operation: (signal:AbortSignal)=>Promise<unknown>, notice: string) {
    const pending = domain === "profile" ? "profilePending" : "categoryPending";
    const failed = domain === "profile" ? "profileFailure" : "categoryFailure";
    const notified = domain === "profile" ? "profileNotice" : "categoryNotice";
    if (state.authError || state[pending] || state[failed]?.uncertain) return false;
    const controller = new AbortController(), life = generation;
    controllers.set(`${domain}-write`, controller);
    publish({ [pending]: true, [failed]: null, [notified]: null, ...(domain === "profile" ? {profileInspectionReady:false} : {categoryInspectionReady:false}) });
    try { await operation(controller.signal); }
    catch (error) {
      if (life !== generation) return false;
      if (handleAuth(error)) return false;
      publish({ [pending]: false, [failed]: failure(error, domain) });
      return false;
    }
    if (life !== generation) return false;
    const refreshed = domain === "profile" ? await refreshProfile() : (await Promise.all([refreshCategories("active"), refreshCategories("archived")])).every(Boolean);
    if (life !== generation || state.authError) return false;
    publish({ [pending]: false, [notified]: refreshed ? notice : `${notice} Refresh this section to see the latest data.` });
    return true;
  }
  return {
    subscribe: (fn:()=>void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    start: () => { void refreshProfile(); void refreshCategories("active"); void refreshCategories("archived"); return stop; },
    refreshProfile, refreshCategories,
    saveProfile: (displayName:string|null) => write("profile", signal => profileClient.updateProfile({displayName},{signal}), "Profile saved."),
    mutateCategory: (operation:(signal:AbortSignal)=>Promise<unknown>, notice:string) => write("category",operation,notice),
    clearFailure: (domain:"profile"|"category") => { if (domain === "profile" ? state.profileFailure?.uncertain : state.categoryFailure?.uncertain) return; publish(domain === "profile" ? {profileFailure:null,profileNotice:null} : {categoryFailure:null,categoryNotice:null}); },
    inspected: (domain:"profile"|"category") => { if (domain === "profile") { if (state.profileInspectionReady && !state.profile.error && !state.profile.loading) publish({profileFailure:null,profileInspectionReady:false}); } else if (state.categoryInspectionReady && !state.active.error && !state.archived.error && !state.active.loading && !state.archived.loading) publish({categoryFailure:null,categoryInspectionReady:false}); },
  };
}
