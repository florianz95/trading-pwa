export interface FeeCalculation {
  buyPrice: number;
  currentPrice: number;
  quantity: number;
  orderFee: number;       // z.B. 0.99€ pro Trade
  spreadPct: number;      // z.B. 0.001 = 0.1%
  taxRate?: number;        // Kapitalertragssteuer DE: 0.26375
}

export interface ProfitResult {
  investedTotal: number;     // Kaufkurs × Menge + Kaufgebühr
  currentValue: number;      // Aktueller Kurs × Menge
  grossProfit: number;       // Vor Gebühren
  sellFee: number;           // Verkaufsgebühr
  spreadCost: number;        // Spread-Kosten beim Verkauf
  taxAmount: number;         // Steuer auf Gewinn (nur bei Gewinn)
  netProfit: number;         // Nach allen Abzügen
  netProfitPct: number;      // Netto-Rendite in %
  breakEvenPrice: number;    // Kurs ab dem Gewinn entsteht
}

export function calculateProfit(params: FeeCalculation): ProfitResult {
  const { buyPrice, currentPrice, quantity, orderFee, spreadPct, taxRate = 0.26375 } = params;

  const investedTotal = buyPrice * quantity + orderFee;
  const currentValue = currentPrice * quantity;
  const grossProfit = currentValue - investedTotal;

  const sellFee = orderFee;
  const spreadCost = currentValue * spreadPct;

  const profitBeforeTax = grossProfit - sellFee - spreadCost;
  const taxAmount = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;
  const netProfit = profitBeforeTax - taxAmount;
  const netProfitPct = investedTotal > 0 ? (netProfit / investedTotal) * 100 : 0;

  // Break-even: bei welchem Kurs ist netProfit = 0?
  // (price * qty) - investedTotal - sellFee - (price * qty * spreadPct) - tax = 0
  const effectiveQty = quantity * (1 - spreadPct);
  const totalCosts = investedTotal + sellFee;
  const breakEvenPrice = totalCosts / (effectiveQty * (1 - taxRate));

  return {
    investedTotal: round(investedTotal),
    currentValue: round(currentValue),
    grossProfit: round(grossProfit),
    sellFee: round(sellFee),
    spreadCost: round(spreadCost),
    taxAmount: round(taxAmount),
    netProfit: round(netProfit),
    netProfitPct: round(netProfitPct),
    breakEvenPrice: round(breakEvenPrice),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
