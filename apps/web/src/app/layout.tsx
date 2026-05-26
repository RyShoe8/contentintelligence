import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "ContentIntelligence · Content Resourcer",
    template: "%s · ContentIntelligence",
  },
  description: "Gmail signal ingestion for content creation",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en" className={dmSans.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <Providers>
          <div className="flex flex-1 flex-col">
            {session?.user ? (
              <SiteChrome
                email={session.user.email ?? ""}
                isAdmin={session.user.role === "admin"}
                isOrgOwner={session.user.orgRole === "owner"}
              >
                {children}
              </SiteChrome>
            ) : (
              children
            )}
          </div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
