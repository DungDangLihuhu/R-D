import { StockAnalysisView } from "@/components/StockAnalysisView";

export default async function StockSymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <StockAnalysisView symbol={symbol.toUpperCase()} />;
}
