import { Button, Divider, Slider, Text } from '@astryxdesign/core';
import { GROUP_LABELS, PARAM_SPECS, type ParamKey, type ParamSpec, type Params } from '../state/params';

type Props = {
  params: Params;
  onChange: (key: ParamKey, value: number) => void;
  onReset: () => void;
  disabled: boolean;
};

const GROUP_ORDER: ParamSpec['group'][] = ['halation', 'grain', 'colour', 'tone'];

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
        {GROUP_ORDER.map((group, index) => (
          <section key={group} className="panel-group">
            {index > 0 && <Divider />}
            <Text type="supporting" color="secondary" className="panel-group-title">
              {GROUP_LABELS[group]}
            </Text>
            {PARAM_SPECS.filter((spec) => spec.group === group).map((spec) => (
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
          </section>
        ))}
      </div>
    </div>
  );
}
