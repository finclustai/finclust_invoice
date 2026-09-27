import { Bar } from "@/ui/skeleton";

/** The editor's own shape: form on the left, preview on the right. */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col" aria-busy="true" aria-live="polite">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
        <Bar w="5rem" h={20} />
        <span className="ml-auto flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} w="5rem" h={28} />
          ))}
        </span>
      </header>
      <p className="sr-only">Opening the invoice…</p>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
        <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
          {[3, 2, 4].map((rows, i) => (
            <div key={i} className="card space-y-3 p-4">
              <Bar w="30%" h={12} />
              {Array.from({ length: rows }, (_, j) => (
                <Bar key={j} h={34} />
              ))}
            </div>
          ))}
        </div>
        <div className="grid place-items-center border-line bg-sand lg:border-l">
          <p className="text-sm text-mid">Drawing the invoice…</p>
        </div>
      </div>
    </div>
  );
}
