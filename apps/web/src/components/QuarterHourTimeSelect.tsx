const QUARTER_HOUR_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = [0, 15, 30, 45][index % 4];
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { value, label: formatTimeLabel(value) };
});

interface QuarterHourTimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export default function QuarterHourTimeSelect({
  value,
  onChange,
  disabled = false,
  required = false,
}: QuarterHourTimeSelectProps) {
  return (
    <select
      className="input"
      value={normalizeTimeValue(value)}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      required={required}
    >
      <option value="">Select time</option>
      {QUARTER_HOUR_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function normalizeTimeValue(value: string) {
  return value ? value.slice(0, 5) : '';
}

function formatTimeLabel(value: string) {
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText} ${period}`;
}
