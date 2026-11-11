import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CourseForge — Self-hosted AI Course Generator",
  description: "Turn any topic into a full course with your own OpenAI-compatible LLM API. Modules, lessons and quizzes, stored locally.",
};

// CourseForge registers no service worker of its own. A leftover service
// worker from another app previously served on the same origin (e.g. an old
// project on localhost:3000) keeps controlling the page, serves stale cached
// HTML and fails to load the new hashed CSS — resulting in an unstyled page
// and "Failed to fetch" errors. Unregister any worker and clear its caches.
const swCleanup = `
(function () {
  if (!('serviceWorker' in navigator)) return;
  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    if (regs.length === 0) return;
    regs.forEach(function (r) { r.unregister(); });
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) { caches.delete(k); });
      });
    }
    // reload exactly once so the page is re-fetched without the stale worker
    if (hadController && !sessionStorage.getItem('sw-cleanup-reloaded')) {
      sessionStorage.setItem('sw-cleanup-reloaded', '1');
      window.location.reload();
    }
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: swCleanup }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
