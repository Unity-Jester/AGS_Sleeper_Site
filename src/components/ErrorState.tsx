interface ErrorStateProps {
  title: string;
  detail?: string;
}

// Shared error UI for server pages: what went wrong plus a way to retry
// without hunting for the browser reload button.
export default function ErrorState({ title, detail }: ErrorStateProps) {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-sleeper-red mb-4">{title}</h1>
      {detail && <p className="text-gray-400">{detail}</p>}
      <p className="text-sm text-gray-500 mt-2">
        This is usually a temporary problem with the Sleeper API.
      </p>
      <a
        href=""
        className="inline-block mt-6 px-4 py-2 bg-sleeper-accent text-sleeper-dark font-medium rounded-lg hover:bg-sleeper-accent/80 transition-colors"
      >
        Try Again
      </a>
    </div>
  );
}
