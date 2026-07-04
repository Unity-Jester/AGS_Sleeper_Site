export default function TeamsLoading() {
  return (
    <div className="space-y-8">
      <div>
        <div className="h-8 w-56 bg-gray-700 rounded animate-pulse" />
        <div className="h-5 w-72 bg-gray-800 rounded animate-pulse mt-2" />
      </div>
      <div className="panel p-4">
        <div className="h-6 w-32 bg-gray-700 rounded animate-pulse mb-4" />
        <div className="h-72 bg-gray-800/60 rounded animate-pulse" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="panel p-4 flex items-center gap-4">
          <div className="h-11 w-11 bg-gray-700 rounded-full animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-40 bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-800 rounded animate-pulse" />
          </div>
          <div className="h-8 w-16 bg-gray-800 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
