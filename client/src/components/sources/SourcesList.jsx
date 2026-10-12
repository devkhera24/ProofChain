import { useState } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { sourcesApi } from "../../api/sources.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import StateMessage from "../common/StateMessage.jsx";
import AddSourceDialog from "./AddSourceDialog.jsx";
import SourceRow from "./SourceRow.jsx";

const isBusy = (s) => ["queued", "processing"].includes(s.status);

export default function SourcesList() {
  const { projectId } = useParams();
  const { data: project } = useProject(projectId);
  const canEdit = ["editor", "owner"].includes(project?.role);
  const [adding, setAdding] = useState(false);
  const { data: sources, isPending, error, refetch } = useQuery({
    queryKey: ["sources", projectId],
    queryFn: () => sourcesApi.list(projectId),
    // Step 29 replaces polling with socket events
    refetchInterval: (q) => (q.state.data?.some(isBusy) ? 3000 : false),
  });

  const addButton = canEdit && (
    <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
      Add source
    </button>
  );

  let content;
  if (isPending) content = <StateMessage kind="loading" title="Loading sources…" />;
  else if (error)
    content = (
      <StateMessage
        kind="error"
        title="Couldn't load sources"
        action={
          <button type="button" className="btn-ghost" onClick={() => refetch()}>
            Try again
          </button>
        }
      >
        {toApiError(error).message}
      </StateMessage>
    );
  else if (!sources.length)
    content = (
      <StateMessage title="No sources yet" action={addButton}>
        Add web pages or PDFs. Each one is split into numbered passages you can cite.
      </StateMessage>
    );
  else
    content = (
      <ul className="space-y-3">
        {sources.map((s) => (
          <SourceRow key={s.id} projectId={projectId} source={s} canEdit={canEdit} />
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-navy">Sources{sources?.length ? ` (${sources.length})` : ""}</h2>
        {sources?.length > 0 && addButton}
      </div>
      {content}
      {adding && <AddSourceDialog projectId={projectId} onClose={() => setAdding(false)} />}
    </div>
  );
}
