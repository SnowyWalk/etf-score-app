import { EtfDashboardClient } from "@/components/dashboard/EtfDashboardClient";
import { sampleEtfs } from "@/data/sample-etfs";

export default function Home() {
  return <EtfDashboardClient etfs={sampleEtfs} />;
}
