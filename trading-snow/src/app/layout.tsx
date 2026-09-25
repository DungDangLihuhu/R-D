import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/AppShell";
import { ToastViewport } from "@/components/ToastViewport";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Trang con đặt tên riêng ("Danh mục · Trading Snow") để phân biệt các tab đang mở.
  title: { default: "Trading Snow — Nhật ký giao dịch", template: "%s · Trading Snow" },
  description: "Web app thống kê trading kiểu Snowball",
  appleWebApp: { title: "Trading Snow", statusBarStyle: "black-translucent" },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('trading-snow-theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} antialiased`}
      >
        <ThemeProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
            <ToastViewport />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
