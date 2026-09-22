import { generateScheduledReport } from "./_shared/report-scheduler.mjs";

export default async function () {
  try {
    const result = await generateScheduledReport("monthly");
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("monthly-report", error);
    return new Response(JSON.stringify({ error: error.message || "Falha no relatório mensal." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
