import { EtfDashboardClient } from "@/components/dashboard/EtfDashboardClient";
import { getEtfMarketSnapshot } from "@/lib/market-data/snapshot";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getEtfMarketSnapshot();

  return <EtfDashboardClient initialSnapshot={snapshot} />;
}
