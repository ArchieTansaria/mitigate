export function Icon({
  name,
  className = "size-4",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, string> = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    deployments: "M4 4h16v6H4z M4 14h16v6H4z M7 7h.01 M7 17h.01",
    runs: "m3 12 4-7 5 14 5-14 4 7",
    campaigns: "M3 6h18v14H3z M3 6l13-3v3 M15 11h6v5h-6z",
    releases: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
    arrow: "M5 12h14 m-5-5 5 5-5 5",
    plus: "M12 5v14 M5 12h14",
    shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z m-4 9 3 3 5-6",
    wallet: "M3 7h18v13H3z M3 7V4h14v3 M16 12h5v4h-5z",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[name] ?? paths.overview} />
    </svg>
  );
}
export function Mark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 grid-cols-3 gap-[3px] rounded-sm border border-orynn/40 p-1"
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <span key={i} className={i % 2 ? "bg-orynn" : "bg-orynn/30"} />
      ))}
    </span>
  );
}
