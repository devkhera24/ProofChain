/** Two linked rounded squares (same mark as the favicon) plus the wordmark. */
export default function Logo({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-navy ${className}`}>
      <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
        <rect x="3" y="9" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="15" y="9" width="14" height="14" rx="4" fill="none" stroke="var(--color-teal)" strokeWidth="3" />
      </svg>
      ProofChain
    </span>
  );
}
