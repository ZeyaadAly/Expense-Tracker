"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./client";

export function useApiRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state,setState] = useState<{key:string;data?:T;status:"loading"|"success"|"error";error?:ApiError}>({key,status:"loading"});
  const active = useRef<{version:number;controller?:AbortController}>({version:0});
  const reload = useCallback(async () => {
    active.current.controller?.abort();
    const controller = new AbortController(); const version = ++active.current.version;
    active.current.controller = controller;
    setState(previous => ({key,data:previous.key === key ? previous.data : undefined,status:"loading"}));
    try {
      const data = await load(controller.signal);
      if (version !== active.current.version || controller.signal.aborted) return false;
      setState({key,data,status:"success"}); return true;
    } catch(error) {
      if (version !== active.current.version || controller.signal.aborted) return false;
      setState(previous => ({key,data:previous.data,status:"error",error:error instanceof ApiError ? error : new ApiError("NETWORK_ERROR",0)})); return false;
    }
  },[key,load]);
  useEffect(() => {
    const requests = active.current;
    let disposed = false;
    queueMicrotask(() => { if(!disposed) void reload(); });
    return () => { disposed = true; requests.controller?.abort(); requests.version++; };
  },[reload]);
  return {...state,loading:state.key !== key || state.status === "loading",reload};
}
