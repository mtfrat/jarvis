import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jarvis Finance | Control Inteligente de Gastos',
  description: 'Gestión y análisis de finanzas personales asistido por IA y Telegram',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-[#09090b] text-[#fafafa] antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}
