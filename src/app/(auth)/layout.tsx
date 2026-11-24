import { Logo } from "@/components/shared/logo";
import { AuthAside } from "./auth-aside";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Protected workspace. Activity is logged for security and compliance.
        </p>
      </div>
      <AuthAside />
    </div>
  );
}
