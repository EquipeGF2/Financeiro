import React from 'react';
import { Sidebar } from '@/components/layout';
import '@/styles/globals.css';

export const metadata = {
  title: "Financeiro - Sistema de Gestão Financeira",
  description: "Sistema de controle de pagamentos, receitas e saldos bancários",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://financeiro-germani.vercel.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        <div className="main-layout">
          <Sidebar />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
