import type { Metadata } from "next";
import { StockAnalysisView } from "@/components/StockAnalysisView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} · Phân tích` };
}

export default async function StockSymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <StockAnalysisView symbol={symbol.toUpperCase()} />;
}
