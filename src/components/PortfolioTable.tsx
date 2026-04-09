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
        const isUp = profitPct >= 0;

        return (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className="w-full text-left bg-gray-900 hover:bg-gray-800 transition-colors rounded-xl p-3 flex items-center justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{p.ticker}</span>
                <span className="text-[11px] text-gray-500">{p.name}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {p.quantity}× @ {p.buy_price.toFixed(2)}€
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{current.toFixed(2)}€</p>
              <p className={`text-xs ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '+' : ''}{profitPct.toFixed(2)}%
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
