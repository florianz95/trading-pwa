import yahooFinance from 'yahoo-finance2';

export async function getQuote(ticker: string) {
  const quote = await yahooFinance.quote(ticker);
  return {
    ticker,
    price: quote.regularMarketPrice ?? 0,
    change: quote.regularMarketChangePercent ?? 0,
    volume: quote.regularMarketVolume ?? 0,
    name: quote.shortName ?? ticker,
    currency: quote.currency ?? 'USD',
  };
}

export async function getHistorical(ticker: string, days = 90) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const result = await yahooFinance.chart(ticker, {
    period1: start,
    period2: end,
    interval: '1d',
  });

  return result.quotes.map((q) => ({
    date: q.date,
    close: q.close,
    volume: q.volume,
  }));
}

export async function getMultipleQuotes(tickers: string[]) {
  return Promise.all(tickers.map(getQuote));
}
