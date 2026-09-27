import { Bar, SkeletonPage } from "@/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage title="Dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <Bar w="60%" h={10} />
            <Bar w="80%" h={22} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="card space-y-2.5 p-4">
            <Bar w="40%" h={12} />
            {Array.from({ length: 4 }, (_, j) => (
              <Bar key={j} w={`${80 - j * 15}%`} h={12} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
