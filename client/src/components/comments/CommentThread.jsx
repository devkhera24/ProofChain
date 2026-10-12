import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { CheckCheck, MessageSquare, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { commentsApi, commentsKey, commentCountsKey } from "../../api/comments.js";
import { toApiError } from "../../api/client.js";
import { timeAgo } from "../../lib/format.js";
import Button from "../ui/Button.jsx";
import { listItem } from "../../lib/motion.js";

const MAX = 2000;
const initials = (name = "?") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

/** Comment counts for every thread of one kind in the project (one shared request for all cards). */
export function useCommentCounts(projectId, kind) {
  return useQuery({ queryKey: commentCountsKey(projectId, kind), queryFn: () => commentsApi.counts(projectId, kind) }).data ?? {};
}

/**
 * Discussion on a link or claim. Collapsed by default (shows a count); `autoOpen` opens it, e.g. when a link
 * becomes disputed. New comments from other people arrive through the `comment.added` socket event.
 */
export default function CommentThread({ projectId, targetKind, targetId, canComment, count, autoOpen = false }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(autoOpen);
  const [text, setText] = useState("");
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const key = commentsKey(projectId, targetId);
  const thread = useQuery({ queryKey: key, queryFn: () => commentsApi.list(projectId, targetKind, targetId), enabled: open });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: commentCountsKey(projectId, targetKind) });
  };
  const add = useMutation({
    mutationFn: () => commentsApi.add(projectId, { targetKind, targetId, text: text.trim() }),
    onSuccess: (comment) => {
      setText("");
      qc.setQueryData(key, (list) => (list ? [...list, comment] : list)); // show it at once; the refetch confirms it
      refresh();
    },
  });
  const resolve = useMutation({ mutationFn: ({ id, resolved }) => commentsApi.resolve(projectId, id, resolved), onSuccess: refresh });

  const total = thread.data?.length ?? count?.total ?? 0;
  const openCount = thread.data ? thread.data.filter((c) => !c.resolved).length : (count?.open ?? 0);

  return (
    <div className="mt-2 border-t border-line pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-teal/40"
      >
        <MessageSquare size={13} aria-hidden="true" />
        {total ? `${total} comment${total === 1 ? "" : "s"}` : "Comment"}
        {openCount > 0 && <span className="rounded-full bg-disputed/10 px-1.5 font-medium text-disputed">{openCount} open</span>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2">
              {thread.isPending ? (
                <p className="text-xs text-muted">Loading comments…</p>
              ) : thread.error ? (
                <p className="text-xs text-red-700">{toApiError(thread.error).message}</p>
              ) : !thread.data.length ? (
                <p className="text-xs text-muted">No comments yet.</p>
              ) : (
                <ol className="space-y-2">
                  <AnimatePresence initial={false}>
                    {thread.data.map((c) => (
                      <motion.li key={c.id} {...listItem} className={clsx("flex gap-2 text-sm", c.resolved && "opacity-60")}>
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy/10 text-[10px] font-semibold text-navy" aria-hidden="true">
                          {initials(c.authorName ?? "?")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted">
                            <span className="font-medium text-ink">{c.authorName ?? "Someone"}</span> · {timeAgo(c.createdAt)}
                            {c.resolved && <span className="ml-1.5 rounded-full bg-black/5 px-1.5">resolved</span>}
                          </p>
                          <p className="whitespace-pre-wrap break-words text-ink">{c.text}</p>
                        </div>
                        {canComment && (
                          <button
                            type="button"
                            className="self-start rounded p-1 text-muted hover:bg-black/5 hover:text-ink"
                            title={c.resolved ? "Reopen" : "Mark resolved"}
                            aria-label={c.resolved ? "Reopen comment" : "Mark comment resolved"}
                            disabled={resolve.isPending}
                            onClick={() => resolve.mutate({ id: c.id, resolved: !c.resolved })}
                          >
                            {c.resolved ? <RotateCcw size={13} /> : <CheckCheck size={13} />}
                          </button>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
              )}

              {canComment && (
                <form
                  className="space-y-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim() && text.length <= MAX) add.mutate();
                  }}
                >
                  <textarea
                    className="input min-h-14 resize-none text-sm"
                    placeholder="Add a comment… (Enter to post, Shift+Enter for a new line)"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form.requestSubmit();
                      }
                    }}
                    maxLength={MAX}
                    aria-label="New comment"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-red-700">{add.error && toApiError(add.error).message}</span>
                    <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!text.trim()}>
                      Post
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
