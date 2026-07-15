import type { Metadata } from "next";
import { SudokuApp } from "./SudokuApp";

export const metadata: Metadata = {
  title: "静数独",
  description: "安静、清晰、无广告的闯关式数独游戏。",
};

export default function Home() {
  return <SudokuApp />;
}
