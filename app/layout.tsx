import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CatalogMint · Store catalog importer",
  description: "Import a store website, review product names in Bangla and English, and download its catalog with original images.",
  icons: {icon:"/favicon.svg"},
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
