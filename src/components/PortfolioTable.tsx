interface Position {
  id: string;
  ticker: string;
  name: string;
  buy_price: number;
  quantity: number;
  buy_date: string;
  order_fee: number;
  asset_type: string;
}

interface Quote {
  ticker: string;
  price: number;
  change: number;
  name: string;
}

export default function PortfolioTable({
  positions,
  quotes,
  onSelect,
}: {
  positions: Position[];
  quotes: Record<string, Quote>;
  onSelect: (p: Position) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <p className="text-sm">Noch keine Positionen.</p>
        <a href="/portfolio" className="text-xs text-blue-400 mt-1 inline-block">
          Position hinzufügen →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {positions.map((p) => {
        const q = quotes[p.ticker];
        const currentPrice = q?.price ?? p.buy_price;
        const invested = p.buy_price * p.quantity;
        const current = currentPrice * p.quantity;
        const profitPct = invested > 0 ? ((current - invested) / invested) * 100 : 0;
        const profitAbs = current - invested;
        const isUp = profitPct >= 0;

        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="w-full text-left bg-gray-900 active:bg-gray-800 transition-colors rounded-2xl px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{p.ticker}</span>
                  {q?.change !== undefined && (
                    <span className={`text-[10px] font-medium ${q.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {q.change >= 0 ? '+' : ''}{q.change.toFixed(2)}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5 truncate">
                  {p.quantity.toFixed(4)}× · Ø {p.buy_price.toFixed(2)}€
                </p>
              </div>
              <div className="text-right ml-4 shrink-0">
                <p className="text-sm font-semibold tabular-nums">
                  {current.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                </p>
                <p className={`text-xs font-medium tabular-nums ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isUp ? '+' : ''}{profitPct.toFixed(1)}%
                  <span className="text-[10px] text-gray-600 ml-1">
                    ({isUp ? '+' : ''}{profitAbs.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })})
                  </span>
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
