import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Slider } from '@astryxdesign/core/Slider';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import {
  CATEGORY_LABELS,
  EFFECTS,
  REGISTRY,
  type ChainNode,
  type EffectCategory,
} from '../render/effects';

type Props = {
  chain: ChainNode[];
  disabled: boolean;
  onValueChange: (nodeId: string, key: string, value: number) => void;
  onToggle: (nodeId: string, enabled: boolean) => void;
  onMove: (nodeId: string, delta: number) => void;
  onRemove: (nodeId: string) => void;
  onAdd: (effectId: string) => void;
};

const CATEGORY_ORDER: EffectCategory[] = ['film', 'colour', 'blur', 'stylise', 'retro', 'distort'];

export function ChainEditor({
  chain,
  disabled,
  onValueChange,
  onToggle,
  onMove,
  onRemove,
  onAdd,
}: Props) {
  // Only the first effect opens by default; a chain of ten fully expanded is a
  // wall of sliders nobody can scan.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(chain.slice(0, 1).map((n) => n.nodeId)),
  );

  const toggleExpanded = (nodeId: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(nodeId)) next.add(nodeId);
      return next;
    });

  return (
    <VStack gap={1}>
      {chain.map((node, index) => {
        const def = REGISTRY.get(node.effectId);
        if (!def) return null;
        const isOpen = expanded.has(node.nodeId);
        const touched = def.params.filter((spec) => node.values[spec.key] !== spec.neutral).length;

        return (
          <VStack key={node.nodeId} gap={0}>
            <HStack gap={1} vAlign="center" hAlign="between">
              <HStack gap={1} vAlign="center">
                <Switch
                  label={def.name}
                  isLabelHidden
                  size="sm"
                  value={node.enabled}
                  isDisabled={disabled}
                  onChange={(checked: boolean) => onToggle(node.nodeId, checked)}
                />
                <Button
                  label={def.name}
                  variant="ghost"
                  size="sm"
                  isDisabled={disabled}
                  onClick={() => toggleExpanded(node.nodeId)}
                />
                {touched > 0 && !isOpen && <Badge variant="neutral" label={touched} />}
              </HStack>
              <DropdownMenu
                hasChevron={false}
                alignment="end"
                button={{
                  label: `${def.name} options`,
                  icon: <Icon icon="moreHorizontal" />,
                  isIconOnly: true,
                  variant: 'ghost',
                  size: 'sm',
                  isDisabled: disabled,
                }}
                items={[
                  {
                    id: 'up',
                    label: 'Move up',
                    isDisabled: index === 0,
                    onClick: () => onMove(node.nodeId, -1),
                  },
                  {
                    id: 'down',
                    label: 'Move down',
                    isDisabled: index === chain.length - 1,
                    onClick: () => onMove(node.nodeId, 1),
                  },
                  {
                    id: 'remove',
                    label: 'Remove',
                    variant: 'destructive' as const,
                    onClick: () => onRemove(node.nodeId),
                  },
                ]}
              />
            </HStack>

            {isOpen && (
              <VStack gap={2} paddingBlock={1}>
                {def.params.map((spec) => (
                  <Slider
                    key={spec.key}
                    label={spec.label}
                    value={node.values[spec.key] ?? spec.neutral}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    valueDisplay="text"
                    formatValue={spec.format}
                    isDisabled={disabled || !node.enabled}
                    onChange={(value: number) => onValueChange(node.nodeId, spec.key, value)}
                    width="100%"
                  />
                ))}
              </VStack>
            )}
          </VStack>
        );
      })}

      <DropdownMenu
        alignment="start"
        button={{ label: 'Add effect', variant: 'secondary', size: 'sm', isDisabled: disabled }}
        items={CATEGORY_ORDER.filter((category) =>
          EFFECTS.some((effect) => effect.category === category),
        ).map((category) => ({
          id: category,
          label: CATEGORY_LABELS[category],
          items: EFFECTS.filter((effect) => effect.category === category).map((effect) => ({
            id: effect.id,
            label: effect.name,
            onClick: () => onAdd(effect.id),
          })),
        }))}
      />

      {chain.length === 0 && (
        <Text type="supporting" color="secondary">
          No effects
        </Text>
      )}
    </VStack>
  );
}
