import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../../api/chat.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { latestBatchKey } from "../../hooks/useLatestBatch.js";
import ChatMessage from "./ChatMessage.jsx";

const MAX = 2000;

function examples(topic) {
  const t = topic ?? "this topic";
  return ["What should I read first?", `What do my sources say about ${t}?`, `Claim: ${t} improves performance in most workloads`];
}

function Typing() {
  return (
    <div className="flex justify-start" aria-label="Assistant is typing">
      <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-surface px-3 py-3 ring-1 ring-line">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  const { projectId } = useParams();
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const canChat = ["editor", "owner"].includes(project?.role);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(null); // { text, error }
  const bottomRef = useRef(null);
  const key = ["chat", projectId];

  const history = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => chatApi.history(projectId, { before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
  });
  // pages[0] is the newest page; render oldest → newest
  const messages = history.data ? [...history.data.pages].reverse().flatMap((p) => p.messages) : [];

  const send = useMutation({
    mutationFn: (message) => chatApi.send(projectId, message),
    onMutate: () => setFailed(null),
    onSuccess: ({ userMessage, agentMessage }) => {
      qc.setQueryData(key, (data) => {
        if (!data) return data;
        const [newest, ...rest] = data.pages;
        return { ...data, pages: [{ ...newest, messages: [...newest.messages, userMessage, agentMessage] }, ...rest] };
      });
      qc.invalidateQueries({ queryKey: ["claims", projectId] });
      qc.invalidateQueries({ queryKey: ["profile", projectId] });
      if (agentMessage.meta?.recommended || agentMessage.meta?.batchId) qc.invalidateQueries({ queryKey: latestBatchKey(projectId) });
    },
    onError: (err, message) => setFailed({ text: message, error: toApiError(err).message }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, send.isPending]);

  const submit = (message = text) => {
    const m = message.trim();
    if (!m || m.length > MAX || send.isPending) return;
    setText("");
    send.mutate(m);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2">
        <h2 className="text-sm font-semibold text-navy">Research chat</h2>
        <p className="text-xs text-muted">Answers come only from your sources, with checked citations.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {history.hasNextPage && (
          <button type="button" className="mx-auto block text-xs text-teal hover:underline" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {history.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
          </button>
        )}
        {history.isPending ? (
          <p className="text-sm text-muted">Loading conversation…</p>
        ) : history.error ? (
          <p className="text-sm text-red-700">{toApiError(history.error).message}</p>
        ) : !messages.length && !send.isPending ? (
          <div className="space-y-2 pt-4">
            <p className="text-sm text-muted">Ask about your sources, state a claim to check, or ask for papers. For example:</p>
            {examples(project?.project.topics?.[0]).map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={!canChat}
                onClick={() => submit(ex)}
                className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink hover:border-teal disabled:opacity-60"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} projectId={projectId} message={m} />)
        )}
        {send.isPending && (
          <>
            <ChatMessage projectId={projectId} message={{ role: "user", content: send.variables, pending: true }} />
            <Typing />
          </>
        )}
        {failed && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            Couldn't send “{failed.text.slice(0, 60)}”: {failed.error}{" "}
            <button type="button" className="font-semibold underline" onClick={() => submit(failed.text)}>
              Retry
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="input min-h-16 resize-none text-sm"
          placeholder={canChat ? "Ask a question… (Enter to send, Shift+Enter for a new line)" : "Viewers can read the chat but not post."}
          value={text}
          disabled={!canChat}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className={`text-[11px] ${text.length > MAX ? "text-red-700" : "text-muted"}`}>
            {text.length}/{MAX}
          </span>
          <button type="submit" className="btn-primary px-3 py-1 text-xs" disabled={!canChat || !text.trim() || text.length > MAX || send.isPending}>
            {send.isPending ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
