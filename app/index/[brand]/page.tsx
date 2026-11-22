"use client";

import { use } from "react";
import { IndexBoard } from "@/components/tracker/index-board";

export default function IndexBrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand } = use(params);
  return <IndexBoard brandParam={decodeURIComponent(brand)} />;
}
