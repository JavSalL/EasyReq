import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SupabaseProviderLib from "@/lib/supabase-provider";
import { Toaster } from 'react-hot-toast';
import AppLayoutClient from "@/components/AppLayoutClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EasyReq | Gestión de Proyectos",
  description: "Plataforma de gestión de requerimientos y equipos.",
};

const SupabaseProviderLocal = ({ children }: { children: React.ReactNode }) => {
  return (
    <SupabaseProviderLib>
      {children}
    </SupabaseProviderLib>
  );
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-50 dark:bg-zinc-950`}>
        <SupabaseProviderLocal>
          <AppLayoutClient>
            {children}
          </AppLayoutClient>
          <Toaster 
            position="top-right"
            toastOptions={{
              className: 'dark:bg-zinc-900 dark:text-white dark:border-zinc-800 border',
              style: {
                borderRadius: '12px',
                fontSize: '14px',
              },
            }}
          />
        </SupabaseProviderLocal>
      </body>
    </html>
  );
}

