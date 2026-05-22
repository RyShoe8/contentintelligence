import type { Metadata } from "next";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "ContentIntelligence · Content Resourcer",
    template: "%s · ContentIntelligence",
  },
  description: "Gmail signal ingestion for content creation",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
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
            children
          )}
        </Providers>
      </body>
    </html>
  );
}
