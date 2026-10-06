import type { AuthSession, AuthError } from "./types";
import type { createAuthService } from "./auth-service";
export type SessionState = { session: AuthSession | null; loading: boolean; recovery: boolean; error: AuthError | null; epoch: number; expired: boolean };
export function usableSession(session: AuthSession | null, now = Date.now()) {
  return !!(session?.access_token && session.user?.id && session.expires_at && session.expires_at * 1000 > now);
}
export function createSessionStore(service: ReturnType<typeof createAuthService>) {
  const initial: SessionState = { session: null, loading: true, recovery: false, error: null, epoch: 0, expired: false };
  let state = initial, generation = 0, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(session: AuthSession | null, options: Partial<SessionState> = {}) {
    const valid = usableSession(session) ? session : null;
    const changed = state.session?.user.id !== valid?.user.id;
    const previous = state;
    state = { ...state, session: valid, loading: false, recovery: changed ? false : state.recovery, epoch: state.epoch + (changed ? 1 : 0), ...options };
    if (timer) clearTimeout(timer);
    if (valid) timer = setTimeout(() => { revision++; publish(null, { expired: true, recovery: false }); }, Math.min(valid.expires_at! * 1000 - Date.now() + 10, 2147483647));
    if (previous !== state) listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => {
      const current = ++generation;
      const subscription = service.subscribe((event, session) => {
        if (current !== generation) return;
        revision++;
        publish(event === "SIGNED_OUT" ? null : session, { error: null, expired: event === "SIGNED_OUT" && !!state.session, recovery: event === "PASSWORD_RECOVERY" ? usableSession(session) : event === "SIGNED_OUT" || session?.user.id !== state.session?.user.id ? false : state.recovery });
      });
      if (subscription.error) publish(null, { error: subscription.error });
      else {
        const before = revision;
        void service.getSession().then(result => {
          if (current === generation && before === revision) publish(result.data, { error: result.error });
        });
      }
      return () => { generation++; subscription.data?.(); if (timer) clearTimeout(timer); };
    },
    recheck: async () => {
      const current = generation, before = ++revision;
      if (!usableSession(state.session)) publish(null, { loading: true, recovery: false });
      const result = await service.getSession();
      if (current === generation && before === revision) publish(result.data, { error: result.error });
    },
    signOut: async () => {
      const current = generation;
      const result = await service.signOut();
      if (current === generation) { revision++; if (!result.error) publish(null, { recovery: false, error: null, expired: false }); }
      return result;
    },
  };
}
