import { EtfDashboardClient } from "@/components/dashboard/EtfDashboardClient";
import { getEtfMarketSnapshot } from "@/lib/market-data/snapshot";
import { US_ETF_UNIVERSE } from "@/lib/portfolio/universe";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getEtfMarketSnapshot({
    symbols: US_ETF_UNIVERSE.join(","),
    returnBasis: "localPrice",
  });

  return <EtfDashboardClient initialSnapshot={snapshot} />;
}
