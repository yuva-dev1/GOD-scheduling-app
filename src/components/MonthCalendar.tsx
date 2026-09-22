import { useRef, useState, type ReactNode } from "react";
import { getCalendarDays, monthLabel } from "../lib/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthCalendarProps {
  month: Date;
  selectedDates: string[];
  onMonthChange: (offset: number) => void;
  onDateClick: (date: string) => void;
  onDateRange: (startDate: string, endDate: string) => void;
  renderDay: (date: string) => ReactNode;
  getDayLabel?: (date: string) => string;
  isDateDisabled?: (date: string) => boolean;
}

export default function MonthCalendar({
  month,
  selectedDates,
  onMonthChange,
  onDateClick,
  onDateRange,
  renderDay,
  getDayLabel,
  isDateDisabled,
}: MonthCalendarProps) {
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const dragStarted = useRef(false);
  const days = getCalendarDays(month);

  function handlePointerDown(date: string) {
    dragStarted.current = false;
    setDragStart(date);
    setDragEnd(date);
  }

  function handlePointerEnter(date: string) {
    if (!dragStart) return;
    if (date !== dragStart) dragStarted.current = true;
    setDragEnd(date);
  }

  function handleClick(date: string) {
    if (dragStarted.current && dragStart && dragEnd) {
      onDateRange(dragStart, dragEnd);
    } else {
      onDateClick(date);
    }
    setDragStart(null);
    setDragEnd(null);
    dragStarted.current = false;
  }

  return (
    <section className="calendar-shell" aria-label={`${monthLabel(month)} calendar`}>
      <div className="calendar-toolbar">
        <div>
          <p className="eyebrow">Monthly view</p>
          <h2>{monthLabel(month)}</h2>
        </div>
        <div className="calendar-nav" aria-label="Change month">
          <button type="button" onClick={() => onMonthChange(-1)}>Previous</button>
          <button type="button" onClick={() => onMonthChange(1)}>Next</button>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>

      <div className="calendar-grid" role="grid" aria-label={monthLabel(month)}>
        {days.map((day) => {
          const isDisabled = isDateDisabled?.(day.date) ?? false;
          const isSelected = selectedDates.includes(day.date);
          const isDragPreview = Boolean(
            dragStart && dragEnd &&
            day.date >= (dragStart < dragEnd ? dragStart : dragEnd) &&
            day.date <= (dragStart < dragEnd ? dragEnd : dragStart),
          );
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              className={`calendar-day ${day.isCurrentMonth ? "" : "outside-month"} ${
                day.isToday ? "today" : ""
              } ${isSelected ? "selected" : ""} ${isDragPreview ? "drag-preview" : ""} ${isDisabled ? "disabled" : ""}`}
              aria-label={getDayLabel?.(day.date) ?? day.date}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onPointerDown={() => handlePointerDown(day.date)}
              onPointerEnter={() => handlePointerEnter(day.date)}
              onClick={() => handleClick(day.date)}
            >
              <span className="calendar-day-number">{Number(day.date.slice(-2))}</span>
              <span className="calendar-day-content">{renderDay(day.date)}</span>
            </button>
          );
        })}
      </div>

      <p className="calendar-hint">Click a day, or drag across several days to select a range.</p>
    </section>
  );
}
