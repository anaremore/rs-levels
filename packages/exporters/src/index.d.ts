export interface TradingViewExportOptions {
  symbol?: string;
  capturedAt?: string;
  generatedAt?: string;
  maxLevels?: number;
}

export type TradingViewJsonLevel = [name: string, price: number, kind: string];

export interface TradingViewJsonExport {
  schemaVersion: string;
  exportFormat: 'tradingview-json';
  payloadVersion: 1;
  generatedAt: string;
  symbol: string;
  capturedAt: string;
  levels: TradingViewJsonLevel[];
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
  symbols: TradingViewBundleJsonSymbol[];
}

export function createTradingViewJsonExport(symbolSnapshot: unknown, options?: TradingViewExportOptions): TradingViewJsonExport;
export function createTradingViewBundleJsonExport(snapshot: unknown, options?: TradingViewExportOptions): TradingViewBundleJsonExport;
