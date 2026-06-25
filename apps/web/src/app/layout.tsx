import type { Metadata } from "next";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "ContentIntelligence",
    template: "%s · ContentIntelligence",
  },
  description: "AI-powered content intelligence and drafting platform",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Providers>
          {session?.user ? (
            <SiteChrome
              email={session.user.email ?? ""}
              isAdmin={session.user.role === "admin"}
              isOrgOwner={session.user.orgRole === "owner"}
            >
              {children}
            </SiteChrome>
          ) : (
            <div className="flex min-h-screen flex-col">{children}</div>
          )}
        </Providers>
      </body>
    </html>
  );
}
