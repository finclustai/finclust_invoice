/**
 * The shape of a page, shown while its data is on its way.
 *
 * The database is a long way from the server, so a page can take a second to
 * arrive. A skeleton in the shape of what is coming reads as "nearly there",
 * where a blank screen reads as "broken" and gets clicked again.
 */
export function Bar({ w = "100%", h = 14 }: { w?: string; h?: number }) {
  return (
    <span
      className="block animate-pulse rounded-[4px] bg-sand"
      style={{ width: w, height: h }}
      aria-hidden
    />
  );
}

export function SkeletonPage({
  title,
  rows = 4,
  children,
}: {
  title: string;
  rows?: number;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6" aria-busy="true" aria-live="polite">
      <h1 className="text-2xl">{title}</h1>
      <p className="sr-only">Loading…</p>
      <div className="mt-5 space-y-2.5">
        {children ??
          Array.from({ length: rows }, (_, i) => (
            <div key={i} className="card flex items-center gap-4 p-4">
              <Bar w="6rem" />
              <Bar w="40%" />
              <span className="ml-auto">
                <Bar w="5rem" />
              </span>
            </div>
          ))}
      </div>
    </main>
  );
}
