import type { EndpointSummary, Level } from '../../schemas/src/index.js';

export interface CaptureInput {
  endpoint?: string;
  path?: string;
  url?: string;
  status?: number;
  capturedAt?: string;
  symbol?: string;
  body?: unknown;
}

export interface NormalizedCapture {
  endpoint: EndpointSummary;
  capturedAt: string;
  symbols: Record<string, Level[]>;
  warnings: string[];
}

export function normalizeCapture(capture?: CaptureInput): NormalizedCapture;
export function parseBody(body: unknown, warnings?: string[]): unknown;
export function collectLevels(root: unknown, options?: Record<string, unknown>): Level[];
export function endpointKey(capture?: CaptureInput): string;

