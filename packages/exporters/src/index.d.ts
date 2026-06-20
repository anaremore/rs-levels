export const TRADINGVIEW_PAYLOAD_PREFIX: 'RSLEVELS';

export interface TradingViewExportOptions {
  symbol?: string;
  capturedAt?: string;
  generatedAt?: string;
  maxLevels?: number;
}

export interface TradingViewJsonLevel {
  name: string;
  price: number;
  kind: string;
  color: string;
}

export interface TradingViewJsonExport {
  schemaVersion: string;
  exportFormat: 'tradingview-json';
  payloadVersion: 1;
  generatedAt: string;
  symbol: string;
  capturedAt: string;
  compactPayload: string;
  levels: TradingViewJsonLevel[];
  notes: string[];
}

export interface TradingViewBundleJsonSymbol {
  symbol: string;
  capturedAt: string;
  levelCount: number;
  levels: TradingViewJsonLevel[];
}

export interface TradingViewBundleJsonExport {
  schemaVersion: string;
  exportFormat: 'tradingview-bundle-json';
  payloadVersion: 2;
  generatedAt: string;
  compactPayload: string;
  symbols: TradingViewBundleJsonSymbol[];
  notes: string[];
}

export function createTradingViewPayload(symbolSnapshot: unknown, options?: TradingViewExportOptions): string;
export function createTradingViewBundlePayload(snapshot: unknown, options?: TradingViewExportOptions): string;
export function createTradingViewJsonExport(symbolSnapshot: unknown, options?: TradingViewExportOptions): TradingViewJsonExport;
export function createTradingViewBundleJsonExport(snapshot: unknown, options?: TradingViewExportOptions): TradingViewBundleJsonExport;
