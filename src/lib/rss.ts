import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'TradingAdvisor/1.0',
  },
});

// Default RSS feeds for general market overview
const GENERAL_FEEDS = [
  { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', source: 'CNBC' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
  { url: 'https://www.handelsblatt.com/contentexport/feed/top-themen/', source: 'Handelsblatt' },
];

export interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string;
  snippet: string;
}

/**
 * Fetch ticker-specific news from Yahoo Finance RSS
 */
async function fetchTickerNews(ticker: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(
      `https://finance.yahoo.com/rss/headline?s=${encodeURIComponent(ticker)}`
    );
    return (feed.items ?? []).slice(0, 5).map((item) => ({
      title: item.title ?? '',
      source: 'Yahoo Finance',
      link: item.link ?? '',
      pubDate: item.pubDate ?? '',
      snippet: (item.contentSnippet ?? '').slice(0, 200),
    }));
  } catch (err) {
    console.error(`RSS error for ${ticker}:`, err);
    return [];
  }
}

/**
 * Fetch general market news from configured RSS feeds
 */
async function fetchGeneralNews(): Promise<NewsItem[]> {
  const results: NewsItem[] = [];

  for (const feed of GENERAL_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items ?? []).slice(0, 5).map((item) => ({
        title: item.title ?? '',
        source: feed.source,
        link: item.link ?? '',
        pubDate: item.pubDate ?? '',
        snippet: (item.contentSnippet ?? '').slice(0, 200),
      }));
      results.push(...items);
    } catch (err) {
      console.error(`RSS error for ${feed.source}:`, err);
    }
  }

  return results;
}

/**
 * Main function: fetches ticker-specific + general market news
 */
export async function fetchAllNews(tickers: string[]): Promise<NewsItem[]> {
  const [tickerNews, generalNews] = await Promise.all([
    Promise.all(tickers.slice(0, 5).map(fetchTickerNews)),
    fetchGeneralNews(),
  ]);

  const allNews = [...tickerNews.flat(), ...generalNews];

  // Deduplicate by title
  const seen = new Set<string>();
  return allNews.filter((n) => {
    const key = n.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
