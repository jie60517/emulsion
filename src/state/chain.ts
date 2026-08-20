import { REGISTRY, defaultValues, makeNode, type ChainNode } from '../render/effects';

/** Wire format. Sparse on purpose: only values that differ from an effect's
 *  neutral are carried, which keeps a shared URL short enough to paste. */
export type SerialisedNode = {
  e: string;
  /** Present and 0 only when the node is muted. */
  on?: 0;
  v?: Record<string, number>;
};

export function serialiseChain(chain: ChainNode[]): SerialisedNode[] {
  const out: SerialisedNode[] = [];
  for (const node of chain) {
    const def = REGISTRY.get(node.effectId);
    if (!def) continue;
    const values: Record<string, number> = {};
    for (const spec of def.params) {
      const value = node.values[spec.key];
      if (typeof value === 'number' && value !== spec.neutral) values[spec.key] = value;
    }
    const entry: SerialisedNode = { e: node.effectId };
    if (!node.enabled) entry.on = 0;
    if (Object.keys(values).length > 0) entry.v = values;
    out.push(entry);
  }
  return out;
}

/**
 * Rebuilds a chain from untrusted input — a URL somebody else wrote, or a file.
 * Unknown effects are dropped rather than faked, unknown keys ignored, and every
 * value clamped to the range its own effect declares.
 */
export function deserialiseChain(raw: unknown): ChainNode[] | null {
  if (!Array.isArray(raw)) return null;
  const chain: ChainNode[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as SerialisedNode;
    const def = REGISTRY.get(String(record.e));
    if (!def) continue;

    const node = makeNode(def.id);
    if (!node) continue;
    node.enabled = record.on !== 0;
    node.values = defaultValues(def);

    const values = record.v;
    if (values && typeof values === 'object') {
      for (const spec of def.params) {
        const value = (values as Record<string, unknown>)[spec.key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          node.values[spec.key] = Math.min(spec.max, Math.max(spec.min, value));
        }
      }
    }
    chain.push(node);
  }

  return chain.length > 0 ? chain : null;
}

export function isChainNeutral(chain: ChainNode[]): boolean {
  return chain.every((node) => {
    const def = REGISTRY.get(node.effectId);
    if (!def) return true;
    return !node.enabled || def.params.every((spec) => node.values[spec.key] === spec.neutral);
  });
}

export function chainsEqual(a: ChainNode[], b: ChainNode[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((node, i) => {
    const other = b[i];
    if (node.effectId !== other.effectId || node.enabled !== other.enabled) return false;
    const def = REGISTRY.get(node.effectId);
    if (!def) return true;
    return def.params.every((spec) => node.values[spec.key] === other.values[spec.key]);
  });
}

export function moveNode(chain: ChainNode[], nodeId: string, delta: number): ChainNode[] {
  const index = chain.findIndex((n) => n.nodeId === nodeId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= chain.length) return chain;
  const next = [...chain];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
