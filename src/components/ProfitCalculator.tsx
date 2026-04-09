'use client';

import { useState, useMemo } from 'react';
import { calculateProfit } from '@/lib/fees';

interface Position {
  id: string;
  ticker: string;
  name: string;
  buy_price: number;
  quantity: number;
  order_fee: number;
}

export default function ProfitCalculator({
  position,
  currentPrice,
  onClose,
}: {
  position: Position;
  currentPrice: number;
  onClose: () => void;
}) {
  const [sellPrice, setSellPrice] = useState(currentPrice);
  const [orderFee, setOrderFee] = useState(position.order_fee);
  const [spreadPct, setSpreadPct] = useState(0.1);

  const result = useMemo(
    () =>
      calculateProfit({
        buyPrice: position.buy_price,
        currentPrice: sellPrice,
        quantity: position.quantity,
        orderFee,
        spreadPct: spreadPct / 100,
      }),
    [position, sellPrice, orderFee, spreadPct]
  );

  const fmt = (n: number) =>
    n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
      <div className="bg-gray-900 rounded-t-2xl w-full max-w-lg p-5 pb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">
            Verkaufsrechner – {position.ticker}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">
            ×
          </button>
        </div>

        {/* Sliders */}
        <div className="space-y-4 mb-5">
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Verkaufskurs</span>
              <span>{sellPrice.toFixed(2)}€</span>
            </div>
            <input
              type="range"
              min={position.buy_price * 0.5}
              max={position.buy_price * 2}
              step={0.01}
              value={sellPrice}
              onChange={(e) => setSellPrice(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Ordergebühr</span>
              <span>{orderFee.toFixed(2)}€</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={0.01}
              value={orderFee}
              onChange={(e) => setOrderFee(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Spread</span>
              <span>{spreadPct.toFixed(2)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={spreadPct}
              onChange={(e) => setSpreadPct(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Results */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Investiert (inkl. Gebühr)</span>
            <span>{fmt(result.investedTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Aktueller Wert</span>
            <span>{fmt(result.currentValue)}</span>
          </div>
          <div className="border-t border-gray-800 my-2" />
          <div className="flex justify-between">
            <span className="text-gray-400">Brutto-Gewinn</span>
            <span className={result.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {fmt(result.grossProfit)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">– Verkaufsgebühr</span>
            <span className="text-gray-500">-{fmt(result.sellFee)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">– Spread-Kosten</span>
            <span className="text-gray-500">-{fmt(result.spreadCost)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">– KESt (26,375%)</span>
            <span className="text-gray-500">-{fmt(result.taxAmount)}</span>
          </div>
          <div className="border-t border-gray-800 my-2" />
          <div className="flex justify-between font-semibold text-base">
            <span>Netto-Gewinn</span>
            <span className={result.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {fmt(result.netProfit)} ({result.netProfitPct >= 0 ? '+' : ''}{result.netProfitPct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-500">Break-Even Kurs</span>
            <span className="text-gray-400">{result.breakEvenPrice.toFixed(2)}€</span>
          </div>
        </div>
      </div>
    </div>
  );
}
