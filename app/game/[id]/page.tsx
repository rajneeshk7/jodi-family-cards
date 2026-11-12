"use client";
import { use } from "react";
import GameTable from "@/components/GameTable";

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <GameTable key={id} id={Number(id)} />;
}
