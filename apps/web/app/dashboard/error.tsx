"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div className="surface empty-state">
      <h1 className="text-xl text-white">This view couldn’t load</h1>
      <p className="max-w-md text-sm text-muted">
        No successful action is implied. Retry the view, then check the run or
        transaction state before repeating a submission.
      </p>
      <button type="button" className="btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
