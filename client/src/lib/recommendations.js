export const SLOT = {
  CORE: { label: "CORE", className: "bg-navy text-white" },
  CORE_2: { label: "CORE-2", className: "bg-navy text-white" },
  FOUNDATION: { label: "FOUNDATION", className: "bg-teal text-white" },
  FRONTIER: { label: "FRONTIER", className: "bg-disputed text-white" },
  CHALLENGER: { label: "CHALLENGER", className: "bg-contradicts text-white" },
};

export const VERIFIED_LABEL = { doi: "DOI", s2: "S2", openalex: "OpenAlex" };

export const TRIGGER_LABEL = { onboarding: "first sources", question: "question", gap: "evidence gap", manual: "manual" };

export const FEEDBACK_LABEL = { added: "Added to project", not_relevant: "Marked not relevant", read: "Already read", later: "Saved for later" };

export const formatAuthors = (authors = []) =>
  authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ");
