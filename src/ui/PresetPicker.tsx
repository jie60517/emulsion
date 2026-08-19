import { Badge, Button, Grid, SelectableCard, Slider, Stack, Text } from '@astryxdesign/core';
import {
  PRESETS,
  PRESET_GROUP_LABELS,
  PRESET_GROUP_ORDER,
  type Preset,
} from '../state/presets';

type Props = {
  activePresetId: string | null;
  hasDrifted: boolean;
  intensity: number;
  disabled: boolean;
  onApply: (preset: Preset) => void;
  onRevert: () => void;
  onIntensityChange: (value: number) => void;
};

export function PresetPicker({
  activePresetId,
  hasDrifted,
  intensity,
  disabled,
  onApply,
  onRevert,
  onIntensityChange,
}: Props) {
  return (
    <Stack direction="vertical" gap={2} paddingBlock={1}>
      {PRESET_GROUP_ORDER.map((group) => (
        <Stack key={group} direction="vertical" gap={1}>
          <Text type="supporting" color="secondary">
            {PRESET_GROUP_LABELS[group]}
          </Text>
          <Grid columns={2} gap={1}>
            {PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <SelectableCard
                key={preset.id}
                label={preset.name}
                isSelected={preset.id === activePresetId}
                isDisabled={disabled}
                padding={1}
                onChange={() => onApply(preset)}
              >
                {/* SelectableCard's `label` only becomes the inner checkbox's
                    aria-label — unlike Button, it renders nothing. The visible
                    name has to be part of the children. */}
                <Stack direction="vertical" gap={0.5}>
                  <Text type="label">{preset.name}</Text>
                  <Text type="supporting" color="secondary">
                    {preset.note}
                  </Text>
                </Stack>
              </SelectableCard>
            ))}
          </Grid>
        </Stack>
      ))}

      {activePresetId && hasDrifted && (
        <Stack direction="horizontal" justify="between" align="center" gap={1}>
          <Badge variant="neutral" label="Edited" />
          <Button label="Back to preset" variant="ghost" size="sm" onClick={onRevert} />
        </Stack>
      )}

      {/* Blends the finished look back towards the untouched photo, so it stays
          meaningful after the individual sliders have been edited. */}
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
    </Stack>
  );
}
