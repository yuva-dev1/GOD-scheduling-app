import { useCallback, useEffect, useState } from "react";
import MonthCalendar from "../components/MonthCalendar";
import RecurringRangePicker from "../components/RecurringRangePicker";
import { ROLE_LABELS } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import {
  addCalendarMonths,
  addMonthsToDate,
  calendarGridStart,
  rangeBetweenDates,
  shortDateLabel,
  startOfMonth,
  weeklyRecurrenceLabel,
  weeklyDates,
} from "../lib/calendar";
import { bookSlot, cancelSlot, listSlots } from "../services/slotsApi";
import type { Slot } from "../types/slots";
import { useAuth } from "../features/auth/AuthContext";

const DAYS_IN_CALENDAR = 42;
const WINDOWS: WindowName[] = ["morning", "evening"];

function slotKey(date: string, window: WindowName) {
  return `${date}|${window}`;
}

function windowLabel(window: WindowName) {
  return window === "morning" ? "Morning" : "Evening";
}

function selectedCountLabel(count: number) {
  return count === 1 ? "1 day selected" : `${count} days selected`;
}

export default function SchedulePage() {
  const { user, token } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDates, setSelectedDates] = useState<string[]>([formatDate(new Date())]);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatStartDate, setRepeatStartDate] = useState(() => formatDate(new Date()));
  const [repeatEndDate, setRepeatEndDate] = useState(() => addMonthsToDate(formatDate(new Date()), 6));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const result = await listSlots(token, calendarGridStart(month), DAYS_IN_CALENDAR);
    setLoading(false);
    if (!result.success || !result.slots) {
      setError(result.message ?? "Could not load your schedule");
      return;
    }
    setSlots(result.slots);
  }, [month, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function handleMonthChange(offset: number) {
    setMonth((current) => addCalendarMonths(current, offset));
    setSelectedDates([]);
    setRepeatEnabled(false);
  }

  function handleDateClick(date: string) {
    setSelectedDates([date]);
    setRepeatStartDate(date);
    setRepeatEndDate(addMonthsToDate(date, 6));
    setRepeatEnabled(false);
  }

  function handleDateRange(startDate: string, endDate: string) {
    const selected = rangeBetweenDates(startDate, endDate).filter((date) =>
      date >= formatDate(new Date()) && slots.some((slot) => slot.date === date),
    );
    setSelectedDates(selected.length > 0 ? selected : [startDate]);
    setRepeatEnabled(false);
  }

  async function updateWindow(window: WindowName, action: "book" | "cancel") {
    if (!token) return;
    const isRecurring = repeatEnabled && selectedDates.length === 1 && Boolean(repeatStartDate && repeatEndDate);
    const targetDates = isRecurring
      ? weeklyDates(repeatStartDate, repeatEndDate)
      : selectedDates.filter((date) => {
          const slot = slots.find((candidate) => candidate.date === date && candidate.window === window);
          return action === "book" ? Boolean(slot && !slot.bookedByMe) : Boolean(slot?.bookedByMe);
        });
    if (targetDates.length === 0) return;

    setPending(`${action}|${window}`);
    setError(null);
    const results = await Promise.all(
      targetDates.map((date) =>
        action === "book"
          ? bookSlot(token, date, window, isRecurring ? repeatEndDate : undefined)
          : cancelSlot(token, date, window),
      ),
    );
    setPending(null);
    const successfulCount = results.filter((result) => result.success).length;
    const missingCount = action === "cancel"
      ? results.filter((result) => !result.success && result.message === "No active booking found").length
      : 0;
    if (successfulCount + missingCount !== results.length || (action === "cancel" && isRecurring && successfulCount === 0)) {
      setError(
        isRecurring
          ? action === "book"
            ? `Scheduled ${successfulCount} of ${results.length} weekly dates. Some dates could not be scheduled.`
            : "No matching weekly bookings were found to cancel."
          : `Could not ${action} every selected day`,
      );
      await refresh();
      return;
    }
    if (isRecurring) setRepeatEnabled(false);
    await refresh();
  }

  function renderDay(date: string) {
    const daySlots = slots.filter((slot) => slot.date === date);
    if (daySlots.length === 0) {
      return <span className="calendar-day-empty">Closed</span>;
    }
    return (
      <span className="calendar-slot-markers">
        {daySlots.map((slot) => (
          <span
            key={slotKey(slot.date, slot.window)}
            className={`calendar-slot-marker ${slot.bookedByMe ? "mine" : ""}`}
            title={`${windowLabel(slot.window)}${slot.bookedByMe ? ": booked by you" : " available"}`}
          >
            {slot.window === "morning" ? "AM" : "PM"}
            {slot.bookedByMe ? " · booked" : slot.bookedCount > 0 ? ` · ${slot.bookedCount}` : ""}
          </span>
        ))}
      </span>
    );
  }

  const selectedSlotGroups = WINDOWS.map((window) => ({
    window,
    slots: selectedDates
      .map((date) => slots.find((slot) => slot.date === date && slot.window === window))
      .filter((slot): slot is Slot => Boolean(slot)),
  }));

  return (
    <main className="page schedule-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Volunteer calendar</p>
          <h1>Choose your Kainkaryam days</h1>
          {user && (
            <p className="subtitle">
              Select one day or drag across a range, then choose a time for your {ROLE_LABELS[user.role].toLowerCase()} service.
            </p>
          )}
        </div>
        <div className="selection-summary" aria-live="polite">
          <span className="selection-summary-label">Your selection</span>
          <strong>{selectedCountLabel(selectedDates.length)}</strong>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="loading-state">Loading this month...</p>}

      <div className="schedule-layout">
        <MonthCalendar
          month={month}
          selectedDates={selectedDates}
          onMonthChange={handleMonthChange}
          onDateClick={handleDateClick}
          onDateRange={handleDateRange}
          renderDay={renderDay}
          getDayLabel={(date) => `${shortDateLabel(date)}. Click to choose this day.`}
          isDateDisabled={(date) => date < formatDate(new Date())}
        />

        <aside className="selection-panel" aria-label="Selected days and time windows">
          <div className="selection-panel-heading">
            <p className="eyebrow">Selected days</p>
            <h2>
              {selectedDates.length === 1 ? shortDateLabel(selectedDates[0]) : `${selectedDates.length} days`}
            </h2>
            <p className="note">Pick a time block to book all selected days that are available.</p>
          </div>

          <div className="window-options">
            {selectedDates.length === 1 && (
              <RecurringRangePicker
                enabled={repeatEnabled}
                startDate={repeatStartDate}
                endDate={repeatEndDate}
                minDate={formatDate(new Date())}
                onEnabledChange={setRepeatEnabled}
                onStartDateChange={(date) => {
                  setRepeatStartDate(date);
                  setSelectedDates(date ? [date] : []);
                  if (date) setMonth(startOfMonth(new Date(`${date}T12:00:00`)));
                }}
                onEndDateChange={setRepeatEndDate}
              />
            )}
            {selectedSlotGroups.map(({ window, slots: windowSlots }) => {
              const availableSlots = windowSlots.filter((slot) => !slot.bookedByMe);
              const bookedSlots = windowSlots.filter((slot) => slot.bookedByMe);
              const firstSlot = windowSlots[0];
              const recurrenceLabel = bookedSlots
                .map((slot) => weeklyRecurrenceLabel(slot.date, slot.recurrenceEndDate))
                .find((label): label is string => Boolean(label));
              const bookPending = pending === `book|${window}`;
              const cancelPending = pending === `cancel|${window}`;
              return (
                <div className="window-option" key={window}>
                  <div className="window-option-heading">
                    <div>
                      <strong>{windowLabel(window)}</strong>
                      <span>
                        {firstSlot ? `${firstSlot.start}–${firstSlot.end}` : "Not open on selected days"}
                      </span>
                    </div>
                    <span className={`window-dot ${window}`} aria-hidden="true" />
                  </div>
                  <div className="window-option-actions">
                    {recurrenceLabel && <span className="recurring-status">{recurrenceLabel}</span>}
                    {availableSlots.length > 0 && (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={Boolean(pending)}
                        onClick={() => updateWindow(window, "book")}
                      >
                        {bookPending
                          ? "Booking..."
                          : repeatEnabled
                            ? "Book every week"
                          : selectedDates.length === 1
                            ? "Book this time"
                            : `Book ${availableSlots.length} days`}
                      </button>
                    )}
                    {bookedSlots.length > 0 && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={Boolean(pending)}
                        onClick={() => updateWindow(window, "cancel")}
                      >
                        {cancelPending
                          ? "Cancelling..."
                          : repeatEnabled && selectedDates.length === 1
                            ? "Cancel every week"
                          : selectedDates.length === 1
                            ? "Cancel booking"
                            : `Cancel ${bookedSlots.length} days`}
                      </button>
                    )}
                    {windowSlots.length === 0 && <span className="note">This service is not open on these days.</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}
