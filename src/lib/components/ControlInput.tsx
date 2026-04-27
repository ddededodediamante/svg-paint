import { useState } from "preact/hooks";

interface ControlInputProps {
  name: string;
  control: any;
  actualValue: number;
  onValueChange: (value: number) => void;
}

export function ControlInput({
  name,
  control,
  actualValue,
  onValueChange,
}: ControlInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(String(actualValue));

  const handleFocus = () => {
    setDisplayValue(String(actualValue));
  };

  const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const typed = input.value;

    setDisplayValue(typed);

    const numValue = Number(typed);
    if (!isNaN(numValue)) {
      const clamped = Math.max(
        control.min ?? -Infinity,
        Math.min(control.max ?? Infinity, numValue),
      );
      onValueChange(clamped);
    }
  };

  const handleBlur = () => {
    setDisplayValue(String(actualValue));
  };

  return (
    <label>
      <span>{name}</span>
      <input
        type="number"
        min={control.min}
        max={control.max}
        step={control.step}
        value={displayValue}
        onFocus={handleFocus}
        onInput={handleInput}
        onBlur={handleBlur}
      />
    </label>
  );
}
