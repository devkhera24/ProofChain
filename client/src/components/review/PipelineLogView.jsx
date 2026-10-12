import { useParams } from "react-router";
import clsx from "clsx";
import { useLatestBatch } from "../../hooks/useLatestBatch.js";
import StateMessage from "../common/StateMessage.jsx";

const kindOf = (line) => (/ drop /.test(line) ? "drop" : / pass /.test(line) ? "pass" : / retry /.test(line) ? "retry" : "info");
const STYLE = {
  drop: "bg-red-50 text-red-800",
  pass: "bg-green-50 text-green-800",
  retry: "bg-amber-50 text-amber-800",
  info: "text-ink",
};

/** The latest batch's pipeline log: every check that ran, and what was dropped and why. */
export default function PipelineLogView() {
  const { projectId } = useParams();
  const { data: batch, isPending } = useLatestBatch(projectId);
  if (isPending) return <StateMessage kind="loading" title="Loading log…" />;
  if (!batch) return <StateMessage title="No pipeline runs yet">Generate recommendations to see every verification step here.</StateMessage>;

  const counts = batch.pipelineLog.reduce((acc, l) => ((acc[kindOf(l)] = (acc[kindOf(l)] ?? 0) + 1), acc), {});
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-semibold text-navy">Pipeline log · batch {batch.humanId}</h2>
        <span className="text-xs text-muted">
          {batch.status === "running" ? "running…" : batch.status} · {counts.pass ?? 0} passed · {counts.drop ?? 0} dropped · {counts.retry ?? 0} retried
        </span>
      </div>
      <p className="text-xs text-muted">
        L1 = the paper exists in a second index · L2 = its metadata matches · L3 = the explanation is quoted from the abstract · L4 = quotes exist in your sources.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white p-2 font-mono text-xs leading-relaxed">
        {batch.pipelineLog.length ? (
          batch.pipelineLog.map((line, i) => (
            <div key={i} className={clsx("whitespace-pre-wrap rounded px-2", STYLE[kindOf(line)])}>
              {line}
            </div>
          ))
        ) : (
          <p className="px-2 text-muted">The log appears when the batch finishes.</p>
        )}
      </div>
    </div>
  );
}
