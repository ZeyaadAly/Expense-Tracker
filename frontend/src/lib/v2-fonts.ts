import localFont from "next/font/local";

const interfaceFont = localFont({
  src: "../app/v2/fonts/ibm-plex-sans-latin.woff2",
  variable: "--font-interface",
  weight: "400 700",
  display: "swap",
});
const financialFont = localFont({
  src: "../app/v2/fonts/manrope-latin.woff2",
  variable: "--font-financial",
  weight: "400 800",
  display: "swap",
});

export const v2FontClasses = `${interfaceFont.variable} ${financialFont.variable}`;
