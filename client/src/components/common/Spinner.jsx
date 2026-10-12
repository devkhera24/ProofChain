export default function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-teal" />
      {label}
    </div>
  );
}
