import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
//import 'bootstrap/dist/css/bootstrap.css';
import "./globals.css";
import SupabaseProviderLib from "@/lib/supabase-provider";
import { Toaster } from 'react-hot-toast';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Software de gestión de proyectos",
  keywords: ["Gestión", "Proyectos", "Ingeniería en Computación", "Supabase", "Next.js"],
  description: "Págna web para la gestión de proyectos de la materia ingeniería de software.",
  authors: [{ name: "Becario de J Reyes" }],
  creator: "rjmas",
};

// Componente para el cliente (necesario para UserProvider)
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
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <SupabaseProviderLocal>
        <div>
          <Toaster position="top-right" />
        </div>
        {children}
        </SupabaseProviderLocal>
      </body>
    </html>
  );
}

