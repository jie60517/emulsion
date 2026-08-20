import { useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Grid } from '@astryxdesign/core/Grid';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { SelectableCard } from '@astryxdesign/core/SelectableCard';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  PRESETS,
  PRESET_GROUP_LABELS,
  PRESET_GROUP_ORDER,
  type Preset,
} from '../state/presets';
import type { CustomLook } from '../state/persistence';

type Props = {
  activePresetId: string | null;
  hasDrifted: boolean;
  disabled: boolean;
  customLooks: CustomLook[];
  onApply: (preset: Preset) => void;
  onApplyCustom: (look: CustomLook) => void;
  onRevert: () => void;
  onSaveLook: (name: string) => void;
  onDeleteLook: (look: CustomLook) => void;
  onCopyLink: () => void;
  onExportFile: () => void;
  onImportFile: () => void;
};

export function PresetPicker({
  activePresetId,
  hasDrifted,
  disabled,
  customLooks,
  onApply,
  onApplyCustom,
  onRevert,
  onSaveLook,
  onDeleteLook,
  onCopyLink,
  onExportFile,
  onImportFile,
}: Props) {
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  function commitSave() {
    if (!draftName.trim()) return;
    onSaveLook(draftName);
    setDraftName('');
    setIsSaveOpen(false);
  }

  return (
    <VStack gap={2} paddingBlock={1}>
      {PRESET_GROUP_ORDER.map((group) => (
        <VStack key={group} gap={1}>
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
                <Text type="label">{preset.name}</Text>
              </SelectableCard>
            ))}
          </Grid>
        </VStack>
      ))}

      {customLooks.length > 0 && (
        <VStack gap={1}>
          <HStack hAlign="between" vAlign="center">
            <Text type="supporting" color="secondary">
              Saved
            </Text>
            {/* Delete lives in a menu rather than on the card: a card that is
                itself a checkbox cannot safely nest another control. */}
            <DropdownMenu
              hasChevron={false}
              alignment="end"
              button={{
                label: 'Manage saved looks',
                icon: <Icon icon="moreHorizontal" />,
                isIconOnly: true,
                variant: 'ghost',
                size: 'sm',
              }}
              items={customLooks.map((look) => ({
                id: look.id,
                label: `Delete ${look.name}`,
                variant: 'destructive' as const,
                onClick: () => onDeleteLook(look),
              }))}
            />
          </HStack>
          <Grid columns={2} gap={1}>
            {customLooks.map((look) => (
              <SelectableCard
                key={look.id}
                label={look.name}
                isSelected={look.id === activePresetId}
                isDisabled={disabled}
                padding={1}
                onChange={() => onApplyCustom(look)}
              >
                <Text type="label">{look.name}</Text>
              </SelectableCard>
            ))}
          </Grid>
        </VStack>
      )}

      {activePresetId && hasDrifted && (
        <HStack gap={1} hAlign="between" vAlign="center">
          <Badge variant="neutral" label="Edited" />
          <Button label="Back to preset" variant="ghost" size="sm" onClick={onRevert} />
        </HStack>
      )}

      <HStack gap={1} vAlign="center" hAlign="between">
        <Button
          label="Save look"
          variant="secondary"
          size="sm"
          isDisabled={disabled}
          onClick={() => setIsSaveOpen(true)}
        />
        <DropdownMenu
          hasChevron={false}
          alignment="end"
          button={{
            label: 'Share and transfer',
            icon: <Icon icon="moreHorizontal" />,
            isIconOnly: true,
            variant: 'ghost',
            size: 'sm',
          }}
          items={[
            { id: 'link', label: 'Copy share link', onClick: onCopyLink },
            { id: 'export', label: 'Export .json', onClick: onExportFile },
            { id: 'import', label: 'Import .json', onClick: onImportFile },
          ]}
        />
      </HStack>

      <Dialog isOpen={isSaveOpen} onOpenChange={setIsSaveOpen} width={340} padding={3}>
        <VStack gap={3}>
          <TextInput
            label="Name"
            value={draftName}
            placeholder="Neon rain"
            hasAutoFocus
            onChange={(value: string) => setDraftName(value)}
            onEnter={commitSave}
            width="100%"
          />
          <HStack gap={1} hAlign="end">
            <Button label="Cancel" variant="ghost" size="sm" onClick={() => setIsSaveOpen(false)} />
            <Button
              label="Save"
              variant="primary"
              size="sm"
              isDisabled={!draftName.trim()}
              onClick={commitSave}
            />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  );
}
