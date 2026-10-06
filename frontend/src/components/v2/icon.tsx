import type { SVGProps } from "react";

// One local 24px outline icon vocabulary; no font, image, or package requests.
const paths = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  ledger: "M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5",
  accounts: "M3 9l9-6 9 6H3 M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 21h18",
  recurring:
    "M20 7a8 8 0 0 0-14-2L3 8 M3 3v5h5 M4 17a8 8 0 0 0 14 2l3-3 M21 21v-5h-5",
  budgets: "M4 5h16v14H4z M4 9h16 M8 13h3 M8 16h7",
  goals: "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l8-8 M16 4h4v4",
  analytics: "M4 3v18h17 M8 16V9 M13 16V6 M18 16v-4",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6L6 18",
  plus: "M12 5v14 M5 12h14",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  arrow: "M4 8h16 M16 4l4 4-4 4 M20 16H4 M8 12l-4 4 4 4",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  check: "M5 12l4 4L19 6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v6 M12 7v1",
  warning: "M12 3L2 21h20L12 3 M12 9v5 M12 17v1",
  lock: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  chevron: "M9 5l7 7-7 7",
} as const;

export type IconName = keyof typeof paths;
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
