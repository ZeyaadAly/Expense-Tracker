import { RouteSkeleton } from "../../components/v2/route-skeleton";
import { PrototypeShell } from "../../features/v2/shell";

export default function Loading() {
  return <PrototypeShell><RouteSkeleton /></PrototypeShell>;
}
