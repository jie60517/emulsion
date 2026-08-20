import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack, LayoutHeader, LayoutPanel, VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { ChainEditor } from './ChainEditor';
import { Histogram } from './Histogram';
import { PresetPicker } from './PresetPicker';
import type { ChainNode } from '../render/effects';
import type { Preset } from '../state/presets';
import type { CustomLook } from '../state/persistence';
import type { Histogram as HistogramData } from '../render/Pipeline';

type Props = {
  chain: ChainNode[];
  disabled: boolean;
  isDefault: boolean;
  onValueChange: (nodeId: string, key: string, value: number) => void;
  onToggle: (nodeId: string, enabled: boolean) => void;
  onMove: (nodeId: string, delta: number) => void;
  onRemove: (nodeId: string) => void;
  onAdd: (effectId: string) => void;
  onReset: () => void;

  activePresetId: string | null;
  hasDrifted: boolean;
  intensity: number;
  onApplyPreset: (preset: Preset) => void;
  onRevertPreset: () => void;
  onIntensityChange: (value: number) => void;
  customLooks: CustomLook[];
  onApplyCustom: (look: CustomLook) => void;
  onSaveLook: (name: string) => void;
  onDeleteLook: (look: CustomLook) => void;
  onCopyLink: () => void;
  onExportFile: () => void;
  onImportFile: () => void;
  histogram: HistogramData | null;
};

export function ControlPanel({
  chain,
  disabled,
  isDefault,
  onValueChange,
  onToggle,
  onMove,
  onRemove,
  onAdd,
  onReset,
  activePresetId,
  hasDrifted,
  intensity,
  onApplyPreset,
  onRevertPreset,
  onIntensityChange,
  customLooks,
  onApplyCustom,
  onSaveLook,
  onDeleteLook,
  onCopyLink,
  onExportFile,
  onImportFile,
  histogram,
}: Props) {
  return (
    <LayoutPanel hasDivider padding={0} width={320} isScrollable label="Effects">
      <LayoutHeader hasDivider>
        <HStack gap={2} vAlign="center" hAlign="between">
          <Heading level={2}>Effects</Heading>
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={onReset}
            isDisabled={disabled || isDefault}
          />
        </HStack>
      </LayoutHeader>

      <VStack gap={0} padding={2}>
        <Histogram data={histogram} />

        <Collapsible
          defaultIsOpen
          trigger={
            <HStack gap={1} vAlign="center">
              <Text type="label">Looks</Text>
              {activePresetId && hasDrifted && <Badge variant="neutral" label="edited" />}
            </HStack>
          }
        >
          <PresetPicker
            activePresetId={activePresetId}
            hasDrifted={hasDrifted}
            intensity={intensity}
            disabled={disabled}
            onApply={onApplyPreset}
            onRevert={onRevertPreset}
            onIntensityChange={onIntensityChange}
            customLooks={customLooks}
            onApplyCustom={onApplyCustom}
            onSaveLook={onSaveLook}
            onDeleteLook={onDeleteLook}
            onCopyLink={onCopyLink}
            onExportFile={onExportFile}
            onImportFile={onImportFile}
          />
        </Collapsible>

        <Collapsible
          defaultIsOpen
          trigger={
            <HStack gap={1} vAlign="center">
              <Text type="label">Chain</Text>
              <Badge variant="neutral" label={chain.filter((n) => n.enabled).length} />
            </HStack>
          }
        >
          <ChainEditor
            chain={chain}
            disabled={disabled}
            onValueChange={onValueChange}
            onToggle={onToggle}
            onMove={onMove}
            onRemove={onRemove}
            onAdd={onAdd}
          />
        </Collapsible>
      </VStack>
    </LayoutPanel>
  );
}
