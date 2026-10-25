// Which part of the job page is shown (components/job-sections.tsx), kept in the URL
// (?tab=photos). Other parts of the page can switch it, as the Next Step bar's Add Photo does
// (owner, 2026-10-25: Require a Photo).

export const JOB_TAB_EVENT = "leakbook:job-tab";

/** Show this part of the job page (replaceState keeps Back for leaving the job). */
export function showJobTab(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", id);
  url.hash = "";
  history.replaceState(null, "", url);
  window.dispatchEvent(new Event(JOB_TAB_EVENT));
}

/** The job's Photos part, from the top (its Add Photo is the first thing there). */
export function showPhotos() {
  showJobTab("photos");
  window.scrollTo({ top: 0 });
}
