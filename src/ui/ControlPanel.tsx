import { Button, Collapsible, Slider, Text } from '@astryxdesign/core';
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
    <div className="panel">
      <div className="panel-head">
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
      </div>

      <div className="panel-body">
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
                <span className="panel-group-trigger">
                  <Text type="label">{GROUP_LABELS[group]}</Text>
                  {touched > 0 && (
                    <Text type="supporting" color="secondary">
                      {touched}
                    </Text>
                  )}
                </span>
              }
            >
              <div className="panel-group">
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
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
