import { EtfDashboardClient } from "@/components/dashboard/EtfDashboardClient";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AUTH_COOKIE_NAME } from "@/lib/auth/session";
import { getEtfMarketSnapshot } from "@/lib/market-data/snapshot";
import { isValidAuthSession } from "@/lib/portfolio/repository";
import { US_ETF_UNIVERSE } from "@/lib/portfolio/universe";

export const dynamic = "force-dynamic";

export default async function Home() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!isValidAuthSession(token)) {
    redirect("/login");
  }

  const snapshot = await getEtfMarketSnapshot({
    symbols: US_ETF_UNIVERSE.join(","),
    returnBasis: "localPrice",
  });

  return <EtfDashboardClient initialSnapshot={snapshot} />;
}
