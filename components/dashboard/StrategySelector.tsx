"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { strategyOrder, strategyPresets } from "@/lib/strategy-presets";
import type { StrategyType } from "@/types/etf";

type StrategySelectorProps = {
  value: StrategyType;
  onChange: (value: StrategyType) => void;
};

export function StrategySelector({ value, onChange }: StrategySelectorProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as StrategyType)}>
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/70 p-1 sm:w-fit">
        {strategyOrder.map((strategy) => {
          const preset = strategyPresets[strategy];

          return (
            <TabsTrigger
              key={strategy}
              value={strategy}
              className="min-h-8 min-w-24 whitespace-normal px-3 py-1 text-center"
            >
              {preset.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
