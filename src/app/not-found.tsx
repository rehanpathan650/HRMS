import Link from "next/link";
import { LogoMark } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <LogoMark className="mx-auto size-9" />
        <p className="mt-6 font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
        <Button asChild className="mt-6"><Link href="/">Go home</Link></Button>
      </div>
    </div>
  );
}
