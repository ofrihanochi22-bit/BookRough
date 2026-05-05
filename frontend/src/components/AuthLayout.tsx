/**
 * Shared card layout for all auth screens (Login, Register, Forgot, Reset).
 *
 * Renders a centred card on a light-grey background. The title is rendered as
 * an h1 inside the card; children fill the body below it.
 */

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
