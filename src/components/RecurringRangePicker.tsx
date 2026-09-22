import { addMonthsToDate, shortDateLabel } from "../lib/calendar";

interface RecurringRangePickerProps {
  enabled: boolean;
  startDate: string;
  endDate: string;
  minDate: string;
  onEnabledChange: (enabled: boolean) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  disabled?: boolean;
}

export default function RecurringRangePicker({
  enabled,
  startDate,
  endDate,
  minDate,
  onEnabledChange,
  onStartDateChange,
  onEndDateChange,
  disabled = false,
}: RecurringRangePickerProps) {
  function handleStartDateChange(date: string) {
    onStartDateChange(date);
    if (date && (!endDate || endDate < date)) {
      onEndDateChange(addMonthsToDate(date, 6));
    }
  }

  return (
    <div className="recurring-picker">
      <label className="recurring-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>
          <strong>For all</strong>
          <span>Repeat this time every week</span>
        </span>
      </label>

      {enabled && !disabled && (
        <div className="recurring-fields">
          <label>
            <span>From</span>
            <input
              type="date"
              value={startDate}
              min={minDate}
              max={endDate || undefined}
              onChange={(event) => handleStartDateChange(event.target.value)}
            />
          </label>
          <label>
            <span>Through</span>
            <input
              type="date"
              value={endDate}
              min={startDate || minDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </label>
          <p className="note">
            Defaults to six months, repeating on the same weekday. {startDate && endDate && `${shortDateLabel(startDate)} through ${shortDateLabel(endDate)}.`}
          </p>
        </div>
      )}
      {disabled && <p className="note recurring-disabled-note">Choose a future date to use “For all”.</p>}
    </div>
  );
}
