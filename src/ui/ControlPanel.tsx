import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack, LayoutHeader, LayoutPanel, VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Heading';
import { Slider } from '@astryxdesign/core/Slider';
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

      <VStack gap={2} padding={2}>
        <Histogram data={histogram} />

        {/* Global, and applies whatever the chain happens to be — so it stays in
            the open rather than folded inside the looks it started with. */}
        <Slider
          label="Intensity"
          value={intensity}
          min={0}
          max={100}
          step={1}
          valueDisplay="text"
          formatValue={(v) => `${Math.round(v)}`}
          isDisabled={disabled}
          onChange={(value: number) => onIntensityChange(value)}
          width="100%"
        />

        <Divider />

        {/* A starting point rather than a daily control, so it opens closed and
            keeps eight preset cards out of the way of the chain. */}
        <Collapsible
          defaultIsOpen={false}
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
            disabled={disabled}
            onApply={onApplyPreset}
            onRevert={onRevertPreset}
            customLooks={customLooks}
            onApplyCustom={onApplyCustom}
            onSaveLook={onSaveLook}
            onDeleteLook={onDeleteLook}
            onCopyLink={onCopyLink}
            onExportFile={onExportFile}
            onImportFile={onImportFile}
          />
        </Collapsible>

        <Divider />

        <ChainEditor
          chain={chain}
          disabled={disabled}
          onValueChange={onValueChange}
          onToggle={onToggle}
          onMove={onMove}
          onRemove={onRemove}
          onAdd={onAdd}
        />
      </VStack>
    </LayoutPanel>
  );
}
