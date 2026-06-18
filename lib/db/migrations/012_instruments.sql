-- Migration 012: Forex / Stocks / Commodities instruments
-- broker_config: Angel One / Zerodha API credentials (one row)
CREATE TABLE IF NOT EXISTS broker_config (
  id                SERIAL PRIMARY KEY,
  broker            TEXT NOT NULL DEFAULT 'angelone',
  api_key           TEXT,
  client_id         TEXT,
  totp_secret       TEXT,
  api_secret_enc    TEXT,
  jwt_token         TEXT,
  jwt_expires_at    TIMESTAMPTZ,
  refresh_token     TEXT,
  feed_token        TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  sandbox_mode      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- instruments: forex pairs, stocks, gold, silver, etc.
CREATE TABLE IF NOT EXISTS instruments (
  id                SERIAL PRIMARY KEY,
  symbol            TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  asset_class       TEXT NOT NULL,          -- forex | stock | commodity | index
  exchange          TEXT NOT NULL DEFAULT 'NSE',
  broker_symbol     TEXT,
  broker_token      TEXT,
  lot_size          NUMERIC(18,4) NOT NULL DEFAULT 1,
  tick_size         NUMERIC(18,8) NOT NULL DEFAULT 0.01,
  price_precision   INT NOT NULL DEFAULT 2,
  qty_precision     INT NOT NULL DEFAULT 4,
  min_qty           NUMERIC(18,4) NOT NULL DEFAULT 1,
  max_qty           NUMERIC(18,4) NOT NULL DEFAULT 10000,
  margin_required   NUMERIC(8,4) NOT NULL DEFAULT 0.10,
  max_leverage      INT NOT NULL DEFAULT 10,
  taker_fee         NUMERIC(8,6) NOT NULL DEFAULT 0.0003,
  maker_fee         NUMERIC(8,6) NOT NULL DEFAULT 0.0002,
  quote_currency    TEXT NOT NULL DEFAULT 'INR',
  current_price     NUMERIC(24,8) NOT NULL DEFAULT 0,
  previous_close    NUMERIC(24,8) NOT NULL DEFAULT 0,
  change_24h        NUMERIC(10,4) NOT NULL DEFAULT 0,
  high_24h          NUMERIC(24,8) NOT NULL DEFAULT 0,
  low_24h           NUMERIC(24,8) NOT NULL DEFAULT 0,
  volume_24h        NUMERIC(28,4) NOT NULL DEFAULT 0,
  trading_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  description       TEXT,
  logo_url          TEXT,
  sector            TEXT,
  isin              TEXT,
  country_code      TEXT NOT NULL DEFAULT 'IN',
  price_source      TEXT NOT NULL DEFAULT 'broker',
  manual_price      NUMERIC(24,8),
  price_updated_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instruments_asset_class ON instruments(asset_class);
CREATE INDEX IF NOT EXISTS idx_instruments_trading_enabled ON instruments(trading_enabled);

-- instrument_orders: user orders for forex/stocks/commodities
CREATE TABLE IF NOT EXISTS instrument_orders (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL,
  instrument_id     INT NOT NULL REFERENCES instruments(id),
  side              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'market',
  qty               NUMERIC(18,4) NOT NULL,
  price             NUMERIC(24,8),
  stop_price        NUMERIC(24,8),
  filled_qty        NUMERIC(18,4) NOT NULL DEFAULT 0,
  avg_fill_price    NUMERIC(24,8),
  status            TEXT NOT NULL DEFAULT 'pending',
  broker_order_id   TEXT,
  broker_status     TEXT,
  leverage          INT NOT NULL DEFAULT 1,
  margin_used       NUMERIC(24,8) NOT NULL DEFAULT 0,
  fee               NUMERIC(24,8) NOT NULL DEFAULT 0,
  pnl               NUMERIC(24,8) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrument_orders_user_id ON instrument_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_instrument_orders_status ON instrument_orders(status);

-- instrument_positions: open positions
CREATE TABLE IF NOT EXISTS instrument_positions (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL,
  instrument_id     INT NOT NULL REFERENCES instruments(id),
  side              TEXT NOT NULL,
  qty               NUMERIC(18,4) NOT NULL,
  avg_entry_price   NUMERIC(24,8) NOT NULL,
  current_price     NUMERIC(24,8) NOT NULL DEFAULT 0,
  unrealized_pnl    NUMERIC(24,8) NOT NULL DEFAULT 0,
  realized_pnl      NUMERIC(24,8) NOT NULL DEFAULT 0,
  margin_used       NUMERIC(24,8) NOT NULL DEFAULT 0,
  leverage          INT NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'open',
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instrument_positions_user_id ON instrument_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_instrument_positions_status ON instrument_positions(status);

-- Seed default instruments (forex, commodities, popular stocks)
INSERT INTO instruments (symbol, name, asset_class, exchange, broker_symbol, lot_size, tick_size, price_precision, min_qty, max_qty, margin_required, max_leverage, quote_currency, current_price, previous_close, country_code, sector) VALUES
-- Forex Pairs
('EURINR', 'Euro / Indian Rupee',      'forex', 'NSE', 'EURINR',  1, 0.25, 4, 1, 10000, 0.02, 50, 'INR', 93.50,  93.20, 'IN', 'Forex'),
('USDINR', 'US Dollar / Indian Rupee', 'forex', 'NSE', 'USDINR',  1, 0.25, 4, 1, 10000, 0.02, 50, 'INR', 83.45,  83.30, 'IN', 'Forex'),
('GBPINR', 'British Pound / Indian Rupee','forex','NSE','GBPINR', 1, 0.25, 4, 1, 10000, 0.02, 50, 'INR', 105.80, 105.40,'IN', 'Forex'),
('JPYINR', 'Japanese Yen / Indian Rupee','forex','NSE','JPYINR',  1, 0.25, 6, 1, 50000, 0.02, 50, 'INR', 0.5521, 0.5505,'IN', 'Forex'),
('EURUSD', 'Euro / US Dollar',         'forex', 'FOREX', 'EURUSD', 1000, 0.00001, 5, 1000, 1000000, 0.02, 50, 'USD', 1.0842, 1.0815, 'GLOBAL', 'Forex'),
('GBPUSD', 'British Pound / US Dollar','forex', 'FOREX', 'GBPUSD', 1000, 0.00001, 5, 1000, 1000000, 0.02, 50, 'USD', 1.2685, 1.2650, 'GLOBAL', 'Forex'),
('USDJPY', 'US Dollar / Japanese Yen','forex',  'FOREX', 'USDJPY', 1000, 0.001, 3, 1000, 1000000, 0.02, 50, 'JPY', 151.35, 150.90, 'GLOBAL', 'Forex'),
('AUDUSD', 'Australian Dollar / USD',  'forex', 'FOREX', 'AUDUSD', 1000, 0.00001, 5, 1000, 1000000, 0.02, 50, 'USD', 0.6523, 0.6501, 'GLOBAL', 'Forex'),
-- Commodities
('GOLD',   'Gold (MCX)',               'commodity', 'MCX', 'GOLD',   1,  1.0, 0, 1, 100, 0.04, 25, 'INR', 72450, 72100, 'IN', 'Precious Metals'),
('SILVER', 'Silver (MCX)',             'commodity', 'MCX', 'SILVER', 30, 1.0, 0, 30, 3000, 0.04, 25, 'INR', 87500, 87000, 'IN', 'Precious Metals'),
('CRUDEOIL','Crude Oil (MCX)',         'commodity', 'MCX', 'CRUDEOIL',100,1.0, 0, 100, 5000, 0.05, 20, 'INR', 6850,  6800, 'IN', 'Energy'),
('NATURALGAS','Natural Gas (MCX)',     'commodity', 'MCX', 'NATURALGAS',1250,0.1,1,1250,62500,0.05, 20, 'INR', 175.5, 173.0, 'IN', 'Energy'),
('COPPER', 'Copper (MCX)',             'commodity', 'MCX', 'COPPER', 2500, 0.05, 2, 2500, 50000, 0.04, 25, 'INR', 795.5, 793.0, 'IN', 'Base Metals'),
-- Indian Stocks (NSE)
('RELIANCE','Reliance Industries Ltd', 'stock', 'NSE', 'RELIANCE', 1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 2945.50, 2930.0, 'IN', 'Conglomerate'),
('TCS',    'Tata Consultancy Services','stock', 'NSE', 'TCS',       1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 3875.0,  3850.0, 'IN', 'Technology'),
('INFY',   'Infosys Limited',          'stock', 'NSE', 'INFY',      1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 1725.0,  1710.0, 'IN', 'Technology'),
('HDFCBANK','HDFC Bank Limited',       'stock', 'NSE', 'HDFCBANK',  1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 1625.0,  1615.0, 'IN', 'Banking'),
('ICICIBANK','ICICI Bank Limited',     'stock', 'NSE', 'ICICIBANK', 1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 1245.0,  1235.0, 'IN', 'Banking'),
('WIPRO',  'Wipro Limited',            'stock', 'NSE', 'WIPRO',     1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 480.5,   477.0,  'IN', 'Technology'),
('SBIN',   'State Bank of India',      'stock', 'NSE', 'SBIN',      1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 825.0,   820.0,  'IN', 'Banking'),
('BAJFINANCE','Bajaj Finance Limited', 'stock', 'NSE', 'BAJFINANCE',1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 7250.0,  7200.0, 'IN', 'Finance'),
('MARUTI', 'Maruti Suzuki India Ltd',  'stock', 'NSE', 'MARUTI',    1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 12800.0, 12700.0,'IN', 'Automobile'),
('TATASTEEL','Tata Steel Limited',     'stock', 'NSE', 'TATASTEEL', 1, 0.05, 2, 1, 10000, 0.10, 10, 'INR', 168.5,   167.0,  'IN', 'Metals'),
-- International Stocks (US)
('AAPL',   'Apple Inc.',               'stock', 'NASDAQ', 'AAPL',   1, 0.01, 2, 1, 10000, 0.25, 4, 'USD', 189.50, 188.20, 'US', 'Technology'),
('GOOGL',  'Alphabet Inc. (Google)',   'stock', 'NASDAQ', 'GOOGL',  1, 0.01, 2, 1, 10000, 0.25, 4, 'USD', 175.30, 174.10, 'US', 'Technology'),
('MSFT',   'Microsoft Corporation',    'stock', 'NASDAQ', 'MSFT',   1, 0.01, 2, 1, 10000, 0.25, 4, 'USD', 415.50, 413.80, 'US', 'Technology'),
('TSLA',   'Tesla Inc.',               'stock', 'NASDAQ', 'TSLA',   1, 0.01, 2, 1, 10000, 0.30, 4, 'USD', 172.40, 170.80, 'US', 'Automobile'),
('AMZN',   'Amazon.com Inc.',          'stock', 'NASDAQ', 'AMZN',   1, 0.01, 2, 1, 10000, 0.25, 4, 'USD', 192.80, 191.50, 'US', 'Technology'),
('META',   'Meta Platforms Inc.',      'stock', 'NASDAQ', 'META',   1, 0.01, 2, 1, 10000, 0.25, 4, 'USD', 505.20, 503.10, 'US', 'Technology'),
('NVDA',   'NVIDIA Corporation',       'stock', 'NASDAQ', 'NVDA',   1, 0.01, 2, 1, 10000, 0.30, 4, 'USD', 875.50, 870.20, 'US', 'Technology')
ON CONFLICT (symbol) DO NOTHING;
