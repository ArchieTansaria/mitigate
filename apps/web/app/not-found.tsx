import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="eyebrow text-orynn">Orryn / 404</p>
        <h1 className="mt-5 text-4xl font-medium tracking-tight text-white">
          Outside the scope.
        </h1>
        <p className="my-5 text-sm leading-7 text-muted">
          This page doesn’t exist. Head back to the workspace to inspect a
          deployment or open a verification.
        </p>
        <Link href="/dashboard" className="btn-primary">
          Open workspace →
        </Link>
      </div>
    </main>
  );
}
