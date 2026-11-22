import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { AppHeader } from "@/components/app-header";
import { IdeaBankFab } from "@/components/ideas/idea-bank-fab";

export const metadata: Metadata = {
  title: "ContentPipe — Creator Production & Review System",
  description:
    "A minimalist, distraction-free production tracker, script workspace, and review hub for creators and teams.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var savedTheme = localStorage.getItem('creator_theme');
                var resolvedTheme = 'theme-dark';
                if (savedTheme === 'theme-bright' || savedTheme === 'theme-swiss' || savedTheme === 'theme-comics') {
                  resolvedTheme = 'theme-bright';
                } else if (savedTheme === 'theme-dark' || savedTheme === 'theme-industrial') {
                  resolvedTheme = 'theme-dark';
                }
                if (savedTheme && savedTheme !== resolvedTheme) {
                  localStorage.setItem('creator_theme', resolvedTheme);
                }
                var root = document.documentElement;
                root.classList.remove('theme-industrial', 'theme-swiss', 'theme-comics', 'theme-dark', 'theme-bright', 'dark');
                root.classList.add(resolvedTheme);
                if (resolvedTheme === 'theme-dark') root.classList.add('dark');
                root.setAttribute('data-theme', resolvedTheme);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground antialiased transition-colors duration-200" suppressHydrationWarning>
        <AuthSessionProvider>
          <ThemeProvider>
            <AppHeader />
            <div className="flex-1 flex flex-col">
              {children}
            </div>
            <IdeaBankFab />
          </ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
