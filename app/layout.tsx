import type { Metadata, Viewport } from "next";
import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import AppLayoutClient from "@/components/AppLayoutClient";
import PwaRegistrar from "@/components/PwaRegistrar";
import { SCRIPT_TEMA } from "@/lib/theme";

// Una sola familia con números tabulares (REQ-001) y buen soporte de acentos.
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#121217" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  // Cada ruta define su título en su layout.tsx; "/" (Proyectos) usa el default
  title: {
    default: "Proyectos | EasyReq",
    template: "%s | EasyReq",
  },
  description: "Plataforma de gestión de requerimientos y equipos.",
  applicationName: "EasyReq",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EasyReq",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light" className={plex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased bg-canvas text-ink">
        <PwaRegistrar />
        <AppLayoutClient>
          {children}
        </AppLayoutClient>
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--line-strong)',
              borderRadius: 'var(--radius-ui)',
              boxShadow: 'none',
              fontSize: '15px',
            },
          }}
        />
      </body>
    </html>
  );
}
