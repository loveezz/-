import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "ГрузЛайн — учёт грузоперевозок",
  description: "Информационная система транспортной компании",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
