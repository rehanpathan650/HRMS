import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const palette = [
  "bg-[oklch(0.93_0.04_275)] text-[oklch(0.42_0.15_275)]",
  "bg-[oklch(0.93_0.04_160)] text-[oklch(0.42_0.1_160)]",
  "bg-[oklch(0.94_0.05_75)] text-[oklch(0.47_0.11_60)]",
  "bg-[oklch(0.93_0.04_20)] text-[oklch(0.48_0.15_20)]",
  "bg-[oklch(0.93_0.04_230)] text-[oklch(0.45_0.11_230)]",
  "bg-[oklch(0.93_0.04_320)] text-[oklch(0.45_0.14_320)]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {src && <AvatarImage src={src} alt={name} className="object-cover" />}
      <AvatarFallback className={cn("text-[11px] font-semibold", palette[hash(name) % palette.length])}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function PersonCell({
  name,
  subtitle,
  src,
}: {
  name: string;
  subtitle?: React.ReactNode;
  src?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <UserAvatar name={name} src={src} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{name}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}
