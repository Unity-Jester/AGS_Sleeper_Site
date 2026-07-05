export default function PortfolioLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 bg-gray-700 rounded-full animate-pulse" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="panel p-4 space-y-3">
            <div className="h-5 w-40 bg-gray-700 rounded animate-pulse" />
            <div className="h-10 bg-gray-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Scouting your empire...</span>
        </div>
      </div>
    </div>
  );
}
