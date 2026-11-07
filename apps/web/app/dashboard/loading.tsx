export default function Loading() {
  return (
    <div role="status" className="space-y-5 motion-safe:animate-pulse">
      <span className="sr-only">Loading workspace</span>
      <div className="h-10 w-2/3 rounded bg-panel-raised" />
      <div className="h-4 w-1/2 rounded bg-panel-raised" />
      <div className="surface h-64" />
    </div>
  );
}
