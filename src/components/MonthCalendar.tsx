import type { ReactNode } from "react";
import { getCalendarDays, monthLabel } from "../lib/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthCalendarProps {
  month: Date;
  selectedDates: string[];
  onMonthChange: (offset: number) => void;
  onDateClick: (date: string) => void;
  onSelectionComplete?: () => void;
  renderDay: (date: string) => ReactNode;
  getDayLabel?: (date: string) => string;
  isDateDisabled?: (date: string) => boolean;
  isDateVisible?: (date: string) => boolean;
  minMonth?: Date;
  maxMonth?: Date;
}

export default function MonthCalendar({
  month,
  selectedDates,
  onMonthChange,
  onDateClick,
  onSelectionComplete,
  renderDay,
  getDayLabel,
  isDateDisabled,
  isDateVisible,
  minMonth,
  maxMonth,
}: MonthCalendarProps) {
  const days = getCalendarDays(month);
  const canGoPrevious = !minMonth || month.getFullYear() > minMonth.getFullYear() || (
    month.getFullYear() === minMonth.getFullYear() && month.getMonth() > minMonth.getMonth()
  );
  const canGoNext = !maxMonth || month.getFullYear() < maxMonth.getFullYear() || (
    month.getFullYear() === maxMonth.getFullYear() && month.getMonth() < maxMonth.getMonth()
  );

  function handleClick(date: string) {
    onDateClick(date);
    onSelectionComplete?.();
  }

  return (
    <section
      className="calendar-shell"
      aria-label={`${monthLabel(month)} calendar`}
    >
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">Monthly view</p>
          <h2>{monthLabel(month)}</h2>
        </div>
        <div className="calendar-toolbar-actions">
          <div className="calendar-nav" aria-label="Change month">
            <button type="button" disabled={!canGoPrevious} onClick={() => onMonthChange(-1)}>Previous</button>
            <button type="button" disabled={!canGoNext} onClick={() => onMonthChange(1)}>Next</button>
          </div>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>

      <div className="calendar-grid" role="grid" aria-label={monthLabel(month)}>
        {days.map((day) => {
          const isDisabled = isDateDisabled?.(day.date) ?? false;
          const isVisible = isDateVisible?.(day.date) ?? true;
          const isSelected = selectedDates.includes(day.date);
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              className={`calendar-day ${day.isCurrentMonth ? "" : "outside-month"} ${!isVisible ? "out-of-range" : ""} ${
                day.isToday ? "today" : ""
              } ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
              aria-label={isVisible ? (getDayLabel?.(day.date) ?? day.date) : `${day.date}, outside displayed range`}
              aria-pressed={isSelected}
              disabled={isDisabled || !isVisible}
              onClick={() => handleClick(day.date)}
            >
              <span className="calendar-day-number">{isVisible ? Number(day.date.slice(-2)) : null}</span>
              <span className="calendar-day-content">{isVisible ? renderDay(day.date) : null}</span>
            </button>
          );
        })}
      </div>

      <p className="calendar-hint">Select a day. Booking options open below.</p>
    </section>
  );
}
