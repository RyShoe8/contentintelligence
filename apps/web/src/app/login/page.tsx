import Image from "next/image";
import { auth } from "@/auth";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(sp.next?.startsWith("/") ? sp.next : "/feed");
  }

  if (!process.env.AUTH_GOOGLE_ID) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent>
            <p className="text-sm text-[var(--muted)]">
              Sign-in is not configured. Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET, and AUTH_URL on Vercel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const next = sp.next?.startsWith("/") ? sp.next : "/feed";

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="text-center">
          <Image src="/logo.png" alt="ContentIntelligence" width={300} height={108} className="mx-auto h-16 w-auto" priority />
          <p className="mt-3 text-sm font-medium text-[var(--muted)]">Content Resourcer · Sign in</p>
          <h1 className="sr-only">Sign in</h1>
          {sp.error ? <Alert variant="error" className="mt-4 text-left">Sign-in failed. Try again.</Alert> : null}
          <div className="mt-6 flex justify-center">
            <GoogleSignIn callbackUrl={next} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
