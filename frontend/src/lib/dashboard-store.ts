import type { Dashboard, DashboardPeriod, createDashboardClient } from "./api/dashboard";
type State = { period: DashboardPeriod; dashboard: Dashboard | null; loading: boolean; error: string | null; authError: boolean };
export function createDashboardStore(client: ReturnType<typeof createDashboardClient>) {
  const initial: State = { period: "this_month", dashboard: null, loading: true, error: null, authError: false };
  let state = initial, lifetime = 0, request: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const cancel = () => { lifetime++; request?.abort(); request = undefined; };
  async function refresh() {
    if (state.authError) return;
    const life = lifetime, period = state.period, controller = new AbortController();
    request?.abort(); request = controller; publish({ loading: true, error: null });
    try {
      const dashboard = await client.getDashboard(period, { signal: controller.signal });
      if (life !== lifetime || request !== controller) return;
      publish({ dashboard, loading: false });
    } catch (error) {
      if (life !== lifetime || request !== controller) return;
      const e = error as { status?: number; code?: string };
      if (e.status === 401 || ["AUTH_REQUIRED", "AUTH_INVALID"].includes(e.code ?? "")) {
        cancel(); publish({ ...initial, loading: false, authError: true });
      } else publish({ loading: false, error: "Dashboard could not refresh. Retry to load the latest values." });
    }
  }
  return {
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state, getServerSnapshot: () => initial,
    start() { void refresh(); return () => { cancel(); state = initial; }; },
    refresh,
    setPeriod(period: DashboardPeriod) { if (state.authError || period === state.period) return; publish({ period }); void refresh(); },
  };
}
