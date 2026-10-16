import { SkeletonRows } from "@/components/ui";

export default function BoardLoading() {
  return (
    <div className="space-y-6">
      <div className="-mx-3 h-[320px] bg-board sm:-mx-5 lg:-mx-7">
        <div className="px-4 pt-8 sm:px-5 lg:px-7">
          <div className="skeleton h-3 w-32 opacity-30" />
          <div className="mt-5 skeleton h-12 w-[min(80%,520px)] opacity-30" />
          <div className="mt-3 skeleton h-4 w-[min(60%,380px)] opacity-30" />
          <div className="mt-8 grid grid-cols-4 gap-4 sm:grid-cols-6 lg:grid-cols-12">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="skeleton h-6 w-6 rounded-full opacity-30" />
                <div className="skeleton h-2 w-14 opacity-30" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_276px]">
        <SkeletonRows rows={8} />
        <div className="space-y-4">
          <div className="paper-card skeleton h-36" />
          <div className="paper-card skeleton h-44" />
        </div>
      </div>
      <span className="sr-only">Loading status board…</span>
    </div>
  );
}
