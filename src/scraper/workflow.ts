import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";
import type { Env } from "../types";

const WORKER_URL = "https://oshicardapi.luisrvervaet.workers.dev";

export class ScrapeWorkflow extends WorkflowEntrypoint<Env, void> {
  async run(_event: WorkflowEvent<void>, step: WorkflowStep) {
    let page = 0;
    let totalSaved = 0;

    while (true) {
      const saved = await step.do(`page-${page}`, async () => {
        const res = await fetch(`${WORKER_URL}/scrape-page?page=${page}`);
        const data = await res.json() as { saved: number };
        return data.saved;
      });

      if (saved === 0) break;

      totalSaved += saved;
      page++;

      // Wait between pages to avoid rate limiting from source site
      await step.sleep(`delay-${page}`, "5 seconds");
    }

    return { totalSaved, pagesScraped: page };
  }
}
