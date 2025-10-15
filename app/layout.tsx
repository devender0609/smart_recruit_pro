import "./globals.css";
import React from "react";

export const metadata = { title: "SmartRecruit Pro", description: "AI Candidate Shortlisting" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold">SR</div>
              <div className="font-semibold">SmartRecruit <span className="text-brand-600">Pro</span></div>
            </div>
            <div className="flex gap-2">
              <a className="btn btn-ghost" href="#">Docs</a>
              <a className="btn btn-primary" href="#">Get Started</a>
            </div>
          </header>
          {children}
          <footer className="text-xs text-gray-500 text-center py-8">© 2025 SmartRecruit Pro. All rights reserved.</footer>
        </div>
      </body>
    </html>
  );
}
