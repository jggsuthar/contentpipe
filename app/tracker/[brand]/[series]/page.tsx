"use client";

import { use } from "react";
import { IndexBoard } from "@/components/tracker/index-board";

export default function TrackerBrandSeriesPage({
  params,
}: {
  params: Promise<{ brand: string; series: string }>;
}) {
  const { brand, series } = use(params);
  return (
    <IndexBoard
      brandParam={decodeURIComponent(brand)}
      seriesParam={decodeURIComponent(series)}
    />
  );
}
