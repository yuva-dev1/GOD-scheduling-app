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
}: MonthCalendarProps) {
  const days = getCalendarDays(month);

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
            <button type="button" onClick={() => onMonthChange(-1)}>Previous</button>
            <button type="button" onClick={() => onMonthChange(1)}>Next</button>
          </div>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>

      <div className="calendar-grid" role="grid" aria-label={monthLabel(month)}>
        {days.map((day) => {
          const isDisabled = isDateDisabled?.(day.date) ?? false;
          const isSelected = selectedDates.includes(day.date);
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              className={`calendar-day ${day.isCurrentMonth ? "" : "outside-month"} ${
                day.isToday ? "today" : ""
              } ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}`}
              aria-label={getDayLabel?.(day.date) ?? day.date}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => handleClick(day.date)}
            >
              <span className="calendar-day-number">{Number(day.date.slice(-2))}</span>
              <span className="calendar-day-content">{renderDay(day.date)}</span>
            </button>
          );
        })}
      </div>

      <p className="calendar-hint">Select a day. Booking options open below.</p>
    </section>
  );
}
