import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-4">
      <div className="card w-full max-w-sm p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-mid">FINCLUST</p>
        <h1 className="mt-1 mb-6 text-2xl">Invoices</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
