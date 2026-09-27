/** A named placeholder beats a 404 for a nav link that is planned but not built. */
export function ComingSoon({ title, plan, what }: { title: string; plan: string; what: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl">{title}</h1>
      <div className="card mt-4 p-6">
        <p className="text-body">{what}</p>
        <p className="mt-2 text-sm text-mid">Arriving in {plan}.</p>
      </div>
    </main>
  );
}
