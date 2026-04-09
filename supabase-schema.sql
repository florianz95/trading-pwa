-- Benutzer-Einstellungen
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  default_order_fee DECIMAL(10,2) DEFAULT 0.99,
  default_spread_pct DECIMAL(5,4) DEFAULT 0.001,
  push_subscription JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Portfolio-Positionen
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  buy_price DECIMAL(12,4) NOT NULL,
  quantity DECIMAL(16,8) NOT NULL,
  buy_date DATE NOT NULL,
  order_fee DECIMAL(10,2) DEFAULT 0.99,
  asset_type VARCHAR(20) DEFAULT 'stock',
  notes TEXT,
  from_signal_id UUID REFERENCES signals,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration (run if table already exists):
-- ALTER TABLE positions ADD COLUMN IF NOT EXISTS from_signal_id UUID REFERENCES signals;

-- KI-Signale
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  ticker VARCHAR(20) NOT NULL,
  signal_type VARCHAR(10) NOT NULL CHECK (signal_type IN ('buy','sell','hold')),
  confidence DECIMAL(3,2),
  reasoning TEXT,
  current_price DECIMAL(12,4),
  target_price DECIMAL(12,4),
  news_summary TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration (run if table already exists):
-- ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;
-- ALTER TABLE signals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- Markt-Snapshots
CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(20) NOT NULL,
  price DECIMAL(12,4),
  change_pct DECIMAL(8,4),
  volume BIGINT,
  snapshot_at TIMESTAMPTZ DEFAULT now()
);

-- News-Archiv (für Backtesting)
CREATE TABLE news_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source VARCHAR(100),
  link TEXT UNIQUE,
  pub_date TIMESTAMPTZ,
  snippet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_signals_created ON signals(created_at DESC);
CREATE INDEX idx_signals_user_status ON signals(user_id, status, created_at DESC);
CREATE INDEX idx_snapshots_ticker ON market_snapshots(ticker, snapshot_at DESC);
CREATE INDEX idx_news_pubdate ON news_archive(pub_date DESC);
