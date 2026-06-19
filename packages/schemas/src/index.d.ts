export const SCHEMA_VERSION: '0.1.0';

export type LevelKind =
  | 'hp'
  | 'mhp'
  | 'zone'
  | 'dd-band'
  | 'reference'
  | 'open-close'
  | 'stat'
  | 'unknown';

export type SourceStateName = 'offline' | 'waiting' | 'capturing' | 'stale' | 'error';

export interface EndpointSummary {
  key: string;
  url: string;
  status: number | null;
  capturedAt: string;
  parser: string;
  ok: boolean;
}

export interface SourceState {
  state: SourceStateName;
  connected: boolean;
  lastCaptureAt: string;
  ageMs: number | null;
  endpoints: EndpointSummary[];
  warnings: string[];
}

export interface Level {
  id: string;
  symbol: string;
  name: string;
  price: number;
  kind: LevelKind;
  color: string;
  source: string;
  capturedAt: string;
  metadata: Record<string, unknown>;
}

export interface SymbolStats {
  dd: number | null;
  resilience: number | null;
  weeklyResilience: number | null;
  monthlyResilience: number | null;
  mapCode: string;
}

export interface SymbolSnapshot {
  symbol: string;
  displaySymbol: string;
  price: number | null;
  capturedAt: string;
  levels: Level[];
  stats: SymbolStats;
  warnings: string[];
}

export interface LevelsSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  capturedAt: string;
  source: SourceState;
  symbols: Record<string, SymbolSnapshot>;
  warnings: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function createEmptySnapshot(options?: Partial<LevelsSnapshot>): LevelsSnapshot;
export function normalizeSourceState(source?: Partial<SourceState>): SourceState;
export function normalizeEndpointSummary(endpoint?: Partial<EndpointSummary>): EndpointSummary;
export function normalizeSymbolSnapshot(symbol: string, input?: Partial<SymbolSnapshot>): SymbolSnapshot;
export function normalizeLevel(symbol: string, level?: Partial<Level>): Level;
export function normalizeStats(stats?: Partial<SymbolStats>): SymbolStats;
export function validateSnapshot(snapshot: unknown): ValidationResult;
export function validateSymbolSnapshot(symbol: string, snapshot: unknown): string[];
export function validateLevel(level: unknown): string[];
export function normalizeSymbol(value: unknown): string;
export function inferLevelKind(name: unknown): LevelKind;
export function stableLevelId(symbol: string, level?: Partial<Level>): string;

