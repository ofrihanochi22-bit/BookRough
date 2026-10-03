import { ScreenLayout } from '../components/ui/ScreenLayout';

interface ComingSoonProps {
  title: string;
  description: string;
}

/** Stand-in for tabs whose screens arrive in later phases (Search, My List). */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <ScreenLayout centered>
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-medium">{title}</h1>
        <p className="max-w-xs text-sm text-muted">{description}</p>
      </div>
    </ScreenLayout>
  );
}
