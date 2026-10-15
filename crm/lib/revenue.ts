import { query } from "./db";

// Recurring and one-off money are always reported apart: they behave differently (one recurs, the other doesn't).
export type Revenue = {
  mrr: number; activeClients: number;                     // from active client records
  oneOffMonth: number; oneOffTotal: number; wonDeals: number; // one-off and setup fees from Won deals, net of audit credits
  pipelineOneOff: number; pipelineMonthly: number; openDeals: number;
};

export async function loadRevenue(): Promise<Revenue> {
  const [rec, won, pipe] = await Promise.all([
    query<{ mrr: number; clients: string }>(`SELECT coalesce(sum(monthly_fee_gbp), 0)::float AS mrr, count(DISTINCT company_id) AS clients FROM client_services WHERE status = 'Active'`),
    // A deal's one-off value is already net of credits (it is recalculated from its offer lines), so an audit credited against a build is counted once.
    query<{ month: number; total: number; n: string }>(
      `WITH won AS (SELECT d.setup_value_gbp::float AS oneoff,
                           COALESCE((SELECT min(h.changed_at) FROM stage_history h WHERE h.deal_id = d.id AND h.to_stage = 'Won' AND h.source = 'app'), d.updated_at) AS won_at
                      FROM deals d WHERE d.stage = 'Won')
       SELECT coalesce(sum(oneoff) FILTER (WHERE won_at >= date_trunc('month', now())), 0)::float AS month, coalesce(sum(oneoff), 0)::float AS total, count(*) AS n FROM won`),
    query<{ oneoff: number; monthly: number; n: string }>(
      `SELECT coalesce(sum(setup_value_gbp), 0)::float AS oneoff, coalesce(sum(monthly_value_gbp), 0)::float AS monthly, count(*) AS n FROM deals WHERE stage NOT IN ('Won', 'Lost')`),
  ]);
  return {
    mrr: rec[0].mrr, activeClients: Number(rec[0].clients), oneOffMonth: won[0].month, oneOffTotal: won[0].total, wonDeals: Number(won[0].n),
    pipelineOneOff: pipe[0].oneoff, pipelineMonthly: pipe[0].monthly, openDeals: Number(pipe[0].n),
  };
}
