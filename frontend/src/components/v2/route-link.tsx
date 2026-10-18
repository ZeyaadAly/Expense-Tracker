"use client";

import NextLink, { useLinkStatus } from "next/link";
import { createContext, useContext, useEffect, type ComponentProps } from "react";

export const NavigationPendingContext = createContext<((pending: boolean) => void) | null>(null);

function PendingNavigation() {
  const { pending } = useLinkStatus();
  const setPending = useContext(NavigationPendingContext);
  useEffect(() => {
    if (!pending || !setPending) return;
    setPending(true);
    return () => setPending(false);
  }, [pending, setPending]);
  return null;
}

// V2 routes are fetched only after deliberate navigation, including on hover.
export default function RouteLink({ children, ...props }: Omit<ComponentProps<typeof NextLink>, "prefetch">) {
  return <NextLink {...props} prefetch={false}>{children}<PendingNavigation /></NextLink>;
}
