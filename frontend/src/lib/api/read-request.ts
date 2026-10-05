export type ReadCallbacks<T> = {
  start: () => void;
  success: (data: T) => void;
  error: (error: unknown) => void;
};

// Share an in-flight retry, but let a new key or confirmed write supersede it.
// Identity checks protect state even when a transport ignores cancellation.
export function createReadRequest<T>() {
  let active: { key: string; controller: AbortController; promise: Promise<boolean> } | undefined;
  function cancel() {
    active?.controller.abort();
    active = undefined;
  }
  function run(key: string, load: (signal: AbortSignal) => Promise<T>, callbacks: ReadCallbacks<T>, supersede = false): Promise<boolean> {
    if (!supersede && active?.key === key) return active.promise;
    cancel();
    const request = { key, controller: new AbortController(), promise: Promise.resolve(false) };
    active = request;
    callbacks.start();
    request.promise = (async () => {
      try {
        const data = await load(request.controller.signal);
        if (active !== request || request.controller.signal.aborted) return false;
        callbacks.success(data);
        return true;
      } catch (error) {
        if (active !== request || request.controller.signal.aborted) return false;
        callbacks.error(error);
        return false;
      } finally {
        if (active === request) active = undefined;
      }
    })();
    return request.promise;
  }
  return { run, cancel };
}
