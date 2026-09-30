import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Patrones y Modelos' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
