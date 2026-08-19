import { Badge, Button, Collapsible, Divider, Section, Slider, Stack, Text } from '@astryxdesign/core';
import { GROUP_LABELS, PARAM_SPECS, type ParamKey, type ParamSpec, type Params } from '../state/params';

type Props = {
  params: Params;
  onChange: (key: ParamKey, value: number) => void;
  onReset: () => void;
  disabled: boolean;
};

const GROUP_ORDER: ParamSpec['group'][] = ['halation', 'grain', 'colour', 'tone'];

/** Halation is the reason this tool exists, so it is the one group that opens
 *  with the panel. Add a group here to have it start expanded. */
const OPEN_BY_DEFAULT: ParamSpec['group'][] = ['halation'];

export function ControlPanel({ params, onChange, onReset, disabled }: Props) {
  const isDefault = PARAM_SPECS.every((spec) => params[spec.key] === spec.neutral);

  return (
    <Section variant="section" width={300} height="100%" padding={0}>
      <Stack direction="vertical" height="100%" gap={0}>
        <Stack
          direction="horizontal"
          justify="between"
          align="center"
          paddingInline={2}
          paddingBlock={1}
        >
          <Text type="label" weight="medium">
            Adjustments
          </Text>
          <Button
            label="Reset"
            variant="ghost"
            size="sm"
            onClick={onReset}
            isDisabled={disabled || isDefault}
          />
        </Stack>

        <Divider />

        <Stack direction="vertical" isScrollable paddingInline={2} paddingBlock={1} gap={0}>
          {GROUP_ORDER.map((group) => {
            const specs = PARAM_SPECS.filter((spec) => spec.group === group);
            // A collapsed group must still admit that it is doing something,
            // otherwise folding the panel away hides state rather than noise.
            const touched = specs.filter((spec) => params[spec.key] !== spec.neutral).length;

            return (
              <Collapsible
                key={group}
                defaultIsOpen={OPEN_BY_DEFAULT.includes(group)}
                trigger={
                  <Stack direction="horizontal" gap={1} align="center">
                    <Text type="label">{GROUP_LABELS[group]}</Text>
                    {touched > 0 && <Badge variant="neutral" label={touched} />}
                  </Stack>
                }
              >
                <Stack direction="vertical" gap={2} paddingBlock={1}>
                  {specs.map((spec) => (
                    <Slider
                      key={spec.key}
                      label={spec.label}
                      value={params[spec.key]}
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      valueDisplay="text"
                      formatValue={spec.format}
                      isDisabled={disabled}
                      onChange={(value: number) => onChange(spec.key, value)}
                      width="100%"
                    />
                  ))}
                </Stack>
              </Collapsible>
            );
          })}
        </Stack>
      </Stack>
    </Section>
  );
}
