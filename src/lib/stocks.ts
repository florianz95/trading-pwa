export interface Stock {
  ticker: string;   // Yahoo Finance ticker
  name: string;
  category: 'us' | 'de' | 'etf' | 'crypto';
}

export const STOCKS: Stock[] = [
  // US Aktien
  { ticker: 'AAPL',  name: 'Apple',            category: 'us' },
  { ticker: 'MSFT',  name: 'Microsoft',         category: 'us' },
  { ticker: 'NVDA',  name: 'NVIDIA',            category: 'us' },
  { ticker: 'AMZN',  name: 'Amazon',            category: 'us' },
  { ticker: 'GOOGL', name: 'Alphabet (Google)', category: 'us' },
  { ticker: 'META',  name: 'Meta Platforms',    category: 'us' },
  { ticker: 'TSLA',  name: 'Tesla',             category: 'us' },
  { ticker: 'NFLX',  name: 'Netflix',           category: 'us' },
  { ticker: 'AMD',   name: 'AMD',               category: 'us' },
  { ticker: 'INTC',  name: 'Intel',             category: 'us' },
  { ticker: 'ORCL',  name: 'Oracle',            category: 'us' },
  { ticker: 'CRM',   name: 'Salesforce',        category: 'us' },
  { ticker: 'ADBE',  name: 'Adobe',             category: 'us' },
  { ticker: 'QCOM',  name: 'Qualcomm',          category: 'us' },
  { ticker: 'AVGO',  name: 'Broadcom',          category: 'us' },
  { ticker: 'TSM',   name: 'TSMC',              category: 'us' },
  { ticker: 'ASML',  name: 'ASML',              category: 'us' },
  { ticker: 'JPM',   name: 'JPMorgan Chase',    category: 'us' },
  { ticker: 'BAC',   name: 'Bank of America',   category: 'us' },
  { ticker: 'GS',    name: 'Goldman Sachs',     category: 'us' },
  { ticker: 'V',     name: 'Visa',              category: 'us' },
  { ticker: 'MA',    name: 'Mastercard',        category: 'us' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson', category: 'us' },
  { ticker: 'UNH',   name: 'UnitedHealth',      category: 'us' },
  { ticker: 'PFE',   name: 'Pfizer',            category: 'us' },
  { ticker: 'XOM',   name: 'ExxonMobil',        category: 'us' },
  { ticker: 'CVX',   name: 'Chevron',           category: 'us' },
  { ticker: 'NKE',   name: 'Nike',              category: 'us' },
  { ticker: 'DIS',   name: 'Disney',            category: 'us' },
  { ticker: 'SBUX',  name: 'Starbucks',         category: 'us' },
  { ticker: 'MCD',   name: "McDonald's",        category: 'us' },
  { ticker: 'WMT',   name: 'Walmart',           category: 'us' },
  { ticker: 'COST',  name: 'Costco',            category: 'us' },
  { ticker: 'PYPL',  name: 'PayPal',            category: 'us' },
  { ticker: 'SQ',    name: 'Block (Square)',     category: 'us' },
  { ticker: 'COIN',  name: 'Coinbase',          category: 'us' },
  { ticker: 'PLTR',  name: 'Palantir',          category: 'us' },
  { ticker: 'SPOT',  name: 'Spotify',           category: 'us' },
  { ticker: 'UBER',  name: 'Uber',              category: 'us' },
  { ticker: 'ABNB',  name: 'Airbnb',            category: 'us' },
  { ticker: 'SNOW',  name: 'Snowflake',         category: 'us' },
  { ticker: 'SHOP',  name: 'Shopify',           category: 'us' },
  { ticker: 'NET',   name: 'Cloudflare',        category: 'us' },
  { ticker: 'CRWD',  name: 'CrowdStrike',       category: 'us' },
  { ticker: 'ZM',    name: 'Zoom',              category: 'us' },
  { ticker: 'DDOG',  name: 'Datadog',           category: 'us' },
  { ticker: 'MU',    name: 'Micron Technology', category: 'us' },
  { ticker: 'SMCI',  name: 'Super Micro Computer', category: 'us' },
  { ticker: 'ARM',   name: 'Arm Holdings',      category: 'us' },

  // Deutsche / EU Aktien (XETRA, Yahoo-Ticker mit .DE)
  { ticker: 'SAP.DE',  name: 'SAP',             category: 'de' },
  { ticker: 'SIE.DE',  name: 'Siemens',         category: 'de' },
  { ticker: 'ALV.DE',  name: 'Allianz',         category: 'de' },
  { ticker: 'DTE.DE',  name: 'Deutsche Telekom',category: 'de' },
  { ticker: 'BMW.DE',  name: 'BMW',             category: 'de' },
  { ticker: 'MBG.DE',  name: 'Mercedes-Benz',   category: 'de' },
  { ticker: 'VOW3.DE', name: 'Volkswagen',      category: 'de' },
  { ticker: 'BAS.DE',  name: 'BASF',            category: 'de' },
  { ticker: 'BAYN.DE', name: 'Bayer',           category: 'de' },
  { ticker: 'ADS.DE',  name: 'Adidas',          category: 'de' },
  { ticker: 'RHM.DE',  name: 'Rheinmetall',     category: 'de' },
  { ticker: 'AIR.DE',  name: 'Airbus',          category: 'de' },
  { ticker: 'MUV2.DE', name: 'Munich Re',       category: 'de' },
  { ticker: 'DBK.DE',  name: 'Deutsche Bank',   category: 'de' },
  { ticker: 'DHL.DE',  name: 'DHL Group',       category: 'de' },
  { ticker: 'ENR.DE',  name: 'Siemens Energy',  category: 'de' },
  { ticker: 'EOAN.DE', name: 'E.ON',            category: 'de' },
  { ticker: 'RWE.DE',  name: 'RWE',             category: 'de' },
  { ticker: 'HEN3.DE', name: 'Henkel',          category: 'de' },
  { ticker: 'IFX.DE',  name: 'Infineon',        category: 'de' },
  { ticker: 'P911.DE', name: 'Porsche AG',      category: 'de' },
  { ticker: 'PAH3.DE', name: 'Porsche SE',      category: 'de' },
  { ticker: 'MTX.DE',  name: 'MTU Aero Engines',category: 'de' },
  { ticker: 'ZAL.DE',  name: 'Zalando',         category: 'de' },
  { ticker: 'DHER.DE', name: 'Delivery Hero',   category: 'de' },
  { ticker: '1COV.DE', name: 'Covestro',        category: 'de' },
  { ticker: 'SHL.DE',  name: 'Siemens Healthineers', category: 'de' },
  { ticker: 'FRE.DE',  name: 'Fresenius',       category: 'de' },
  { ticker: 'HEI.DE',  name: 'HeidelbergMaterials', category: 'de' },

  // ETFs
  { ticker: 'IWDA.AS', name: 'iShares MSCI World ETF',     category: 'etf' },
  { ticker: 'VUSA.AS', name: 'Vanguard S&P 500 ETF',       category: 'etf' },
  { ticker: 'CSPX.AS', name: 'iShares Core S&P 500 ETF',   category: 'etf' },
  { ticker: 'EUNL.DE', name: 'iShares Core MSCI World ETF',category: 'etf' },
  { ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World ETF',category: 'etf' },
  { ticker: 'EXXT.DE', name: 'iShares NASDAQ-100 ETF',     category: 'etf' },
  { ticker: 'SXRV.DE', name: 'iShares Core MSCI EM ETF',   category: 'etf' },
  { ticker: 'EXS1.DE', name: 'iShares Core DAX ETF',       category: 'etf' },
  { ticker: 'SPY',     name: 'SPDR S&P 500 ETF',           category: 'etf' },
  { ticker: 'QQQ',     name: 'Invesco Nasdaq-100 ETF',      category: 'etf' },

  // Krypto (via Yahoo Finance)
  { ticker: 'BTC-USD',  name: 'Bitcoin',    category: 'crypto' },
  { ticker: 'ETH-USD',  name: 'Ethereum',   category: 'crypto' },
  { ticker: 'SOL-USD',  name: 'Solana',     category: 'crypto' },
  { ticker: 'BNB-USD',  name: 'BNB',        category: 'crypto' },
  { ticker: 'XRP-USD',  name: 'XRP',        category: 'crypto' },
];

// Watchlist für den Cron-Bot (Top-Picks für Kaufgelegenheiten)
export const WATCHLIST_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META',
  'SAP.DE', 'RHM.DE',
  'PLTR', 'BTC-USD', 'ETH-USD',
];

export function searchStocks(query: string): Stock[] {
  const q = query.toLowerCase();
  return STOCKS.filter(
    (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  ).slice(0, 8);
}
