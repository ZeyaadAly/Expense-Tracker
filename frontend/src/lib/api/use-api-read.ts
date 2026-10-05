"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError } from "./client";
import { createReadRequest } from "./read-request";

export function useApiRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state,setState] = useState<{key:string;data?:T;status:"loading"|"success"|"error";error?:ApiError;hasLoaded:boolean}>({key,status:"loading",hasLoaded:false});
  const requests = useRef(createReadRequest<T>());
  const latest = useRef({key,load});
  // Async mutation callbacks may have started under a previous filter selection.
  // Their stable reload always uses the latest committed key and loader.
  useLayoutEffect(() => { latest.current = {key,load}; },[key,load]);
  const reload = useCallback((supersede = false, onData?: (data: T) => void) => {
    const {key,load} = latest.current;
    return requests.current.run(key,load,{
      start: () => setState(previous => ({key,data:previous.key === key ? previous.data : undefined,status:"loading",hasLoaded:previous.hasLoaded})),
      success: data => { onData?.(data); setState({key,data,status:"success",hasLoaded:true}); },
      error: error => setState(previous => ({key,data:previous.key === key ? previous.data : undefined,status:"error",hasLoaded:previous.hasLoaded,error:error instanceof ApiError ? error : new ApiError("NETWORK_ERROR",0)})),
    },supersede);
  },[]);
  useEffect(() => {
    const current = requests.current;
    let disposed = false;
    queueMicrotask(() => { if(!disposed) void reload(); });
    return () => { disposed = true; current.cancel(); };
  },[key,load,reload]);
  const current = state.key === key;
  return {...state,data:current ? state.data : undefined,error:current ? state.error : undefined,status:current ? state.status : "loading" as const,loading:!current || state.status === "loading",reload};
}
