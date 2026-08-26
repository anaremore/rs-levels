export interface TradingViewExportOptions {
  symbol?: string;
  capturedAt?: string;
  generatedAt?: string;
  maxLevels?: number;
}

export interface ThinkorswimExportOptions {
  symbol?: string;
  capturedAt?: string;
  generatedAt?: string;
  maxLevels?: number;
}

export function createTradingViewPayloadExport(symbolSnapshot: unknown, options?: TradingViewExportOptions): string;
export function createTradingViewBundlePayloadExport(snapshot: unknown, options?: TradingViewExportOptions): string;
export function createThinkorswimStudyExport(symbolSnapshot: unknown, options?: ThinkorswimExportOptions): string;
