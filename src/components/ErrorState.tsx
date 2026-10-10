interface ErrorStateProps {
  title: string;
  detail?: string;
  // A way out when retrying won't help, e.g. back to the league picker
  action?: { href: string; label: string };
  // False when the problem isn't a flaky API (e.g. a username that
  // doesn't exist), so retrying won't help
  transient?: boolean;
}

// Shared error UI for server pages: what went wrong plus a way to retry
// without hunting for the browser reload button.
export default function ErrorState({ title, detail, action, transient = true }: ErrorStateProps) {
  return (
    <div className="text-center py-12">
      <h1 className="text-2xl font-bold text-sleeper-red mb-4">{title}</h1>
      {detail && <p className="text-gray-400">{detail}</p>}
      {transient && (
        <>
          <p className="text-sm text-gray-500 mt-2">
            This is usually a temporary problem with the Sleeper API.
          </p>
          <a
            href=""
            className="inline-block mt-6 px-4 py-2 bg-sleeper-accent text-sleeper-dark font-medium rounded-lg hover:bg-sleeper-accent/80 transition-colors"
          >
            Try Again
          </a>
        </>
      )}
      {action && (
        <a
          href={action.href}
          className="inline-block mt-6 ml-3 px-4 py-2 border border-gray-700 text-gray-300 font-medium rounded-lg hover:text-white transition-colors"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
