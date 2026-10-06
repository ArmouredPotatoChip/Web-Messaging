// Shown by react-error-boundary when a component throws while rendering.
// The app tree is already gone at this point, so the dialog sits over an empty page.
// A full reload is the safe restart; the saved session keeps the user signed in.
export function ErrorFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-80 space-y-3 rounded-lg bg-white p-6 text-center shadow-lg"
      >
        <p className="text-lg font-semibold">Something went wrong.</p>
        <p className="text-sm text-gray-600">The app ran into an unexpected error.</p>
        <button
          onClick={() => window.location.reload()}
          className="w-full rounded bg-blue-600 p-2 text-sm text-white"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
