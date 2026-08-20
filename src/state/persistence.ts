import { PARAM_SPECS, clampParams, type Params } from './params';
import { deserialiseChain, serialiseChain } from './chain';
import { chainFromLegacyParams, type ChainNode } from '../render/effects';

export type CustomLook = {
  id: string;
  name: string;
  chain: ChainNode[];
  savedAt: number;
};

export type SharedState = {
  chain: ChainNode[];
  intensity: number;
  presetId: string | null;
};

const STORAGE_KEY = 'emulsion.custom-looks.v2';
const LEGACY_STORAGE_KEY = 'emulsion.custom-looks.v1';
const SHARE_PARAM = 'look';
const FILE_KIND = 'emulsion.look';

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareState(state: SharedState): string {
  return base64UrlEncode(
    JSON.stringify({
      c: serialiseChain(state.chain),
      i: state.intensity,
      k: state.presetId ?? undefined,
    }),
  );
}

/**
 * Everything here arrives from a URL somebody else wrote, so nothing is trusted:
 * unknown keys are dropped and every value is clamped to its declared range.
 */
export function decodeShareState(search: string): SharedState | null {
  const encoded = new URLSearchParams(search).get(SHARE_PARAM);
  if (!encoded) return null;

  try {
    const raw = JSON.parse(base64UrlDecode(encoded)) as {
      c?: unknown;
      p?: Record<string, unknown>;
      i?: unknown;
      k?: unknown;
    };
    return {
      chain: readChain(raw.c, raw.p),
      intensity: typeof raw.i === 'number' ? Math.min(100, Math.max(0, raw.i)) : 100,
      presetId: typeof raw.k === 'string' ? raw.k : null,
    };
  } catch {
    return null;
  }
}

export function buildShareUrl(state: SharedState): string {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, encodeShareState(state));
  return url.toString();
}

/** Drops the share parameter from the address bar without reloading, so the URL
 *  stops describing a look the user has since edited. */
export function clearShareParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(SHARE_PARAM)) return;
  url.searchParams.delete(SHARE_PARAM);
  window.history.replaceState(null, '', url.toString());
}

/** Accepts either the chain format or the flat parameter set that preceded it,
 *  so links and files written before effects became reorderable still open. */
function readChain(chain: unknown, legacy: unknown): ChainNode[] {
  const parsed = deserialiseChain(chain);
  if (parsed) return parsed;

  const numbers: Partial<Params> = {};
  const source = (legacy || {}) as Record<string, unknown>;
  for (const spec of PARAM_SPECS) {
    const value = source[spec.key];
    if (typeof value === 'number') numbers[spec.key] = value;
  }
  return chainFromLegacyParams(clampParams(numbers));
}

export function loadCustomLooks(): CustomLook[] {
  try {
    const stored =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = JSON.parse(stored ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      .map((entry) => ({
        id: String(entry.id ?? ''),
        name: String(entry.name ?? 'Untitled'),
        chain: readChain(entry.chain, entry.params),
        savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
      }))
      .filter((look) => look.id !== '');
  } catch {
    // A corrupt or unreadable store must not take the app down with it.
    return [];
  }
}

function persist(looks: CustomLook[]): CustomLook[] {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        looks.map((look) => ({
          id: look.id,
          name: look.name,
          savedAt: look.savedAt,
          chain: serialiseChain(look.chain),
        })),
      ),
    );
  } catch {
    // Private browsing and full quotas both throw here. The look still applies
    // for this session; only its persistence is lost.
  }
  return looks;
}

export function saveCustomLook(name: string, chain: ChainNode[]): CustomLook[] {
  const trimmed = name.trim() || 'Untitled';
  const existing = loadCustomLooks();
  const match = existing.find((look) => look.name.toLowerCase() === trimmed.toLowerCase());

  if (match) {
    return persist(
      existing.map((look) =>
        look.id === match.id ? { ...look, chain, savedAt: Date.now() } : look,
      ),
    );
  }

  return persist([
    ...existing,
    { id: `custom-${Date.now().toString(36)}`, name: trimmed, chain, savedAt: Date.now() },
  ]);
}

export function deleteCustomLook(id: string): CustomLook[] {
  return persist(loadCustomLooks().filter((look) => look.id !== id));
}

export function lookToFile(name: string, chain: ChainNode[], intensity: number): Blob {
  return new Blob(
    [
      JSON.stringify(
        { kind: FILE_KIND, version: 2, name, intensity, chain: serialiseChain(chain) },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
}

export type ParsedLookFile = { name: string; chain: ChainNode[]; intensity: number };

export class InvalidLookFileError extends Error {}

/** Same rule as the URL decoder: the file came from outside, so validate the
 *  shape and clamp every value rather than trusting what is in it. */
export function parseLookFile(text: string): ParsedLookFile {
  let raw: {
    kind?: unknown;
    name?: unknown;
    chain?: unknown;
    params?: unknown;
    intensity?: unknown;
  };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidLookFileError('That file is not valid JSON.');
  }

  if (raw.kind !== FILE_KIND) {
    throw new InvalidLookFileError('That file is not an Emulsion look.');
  }

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Imported look',
    chain: readChain(raw.chain, raw.params),
    intensity:
      typeof raw.intensity === 'number' ? Math.min(100, Math.max(0, raw.intensity)) : 100,
  };
}

