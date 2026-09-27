import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import MonthCalendar from "../components/MonthCalendar";
import RecurringRangePicker from "../components/RecurringRangePicker";
import { ROLE_LABELS } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import {
  addCalendarMonths,
  addMonthsToDate,
  calendarGridStart,
  shortDateLabel,
  startOfMonth,
  weeklyRecurrenceLabel,
  weeklyDates,
} from "../lib/calendar";
import { assignmentInitials } from "../lib/assignmentDisplay";
import { bookSlot, cancelSlot, listSlots } from "../services/slotsApi";
import { createVacation, deleteVacation, listVacations } from "../services/vacationsApi";
import type { Slot } from "../types/slots";
import type { Vacation } from "../types/vacations";
import { useAuth } from "../features/auth/AuthContext";

const DAYS_IN_CALENDAR = 42;
const WINDOWS: WindowName[] = ["morning", "evening"];

function slotKey(date: string, window: WindowName) {
  return `${date}|${window}`;
}

function windowLabel(window: WindowName) {
  return window === "morning" ? "Morning" : "Evening";
}

function isDateInVacation(date: string, vacations: Vacation[]) {
  return vacations.some((vacation) => date >= vacation.startDate && date <= vacation.endDate);
}

export default function SchedulePage() {
  const { user, token } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDates, setSelectedDates] = useState<string[]>([formatDate(new Date())]);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatStartDate, setRepeatStartDate] = useState(() => formatDate(new Date()));
  const [repeatEndDate, setRepeatEndDate] = useState(() => addMonthsToDate(formatDate(new Date()), 6));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [vacationStartDate, setVacationStartDate] = useState(() => formatDate(new Date()));
  const [vacationEndDate, setVacationEndDate] = useState(() => formatDate(new Date()));
  const [vacationPending, setVacationPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectionRevealRequest, setSelectionRevealRequest] = useState(0);
  const selectionPanelRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [result, vacationResult] = await Promise.all([
      listSlots(token, calendarGridStart(month), DAYS_IN_CALENDAR),
      listVacations(token),
    ]);
    setLoading(false);
    if (!result.success || !result.slots || !vacationResult.success || !vacationResult.vacations) {
      setError(result.message ?? "Could not load your schedule");
      return;
    }
    setSlots(result.slots);
    setVacations(vacationResult.vacations);
  }, [month, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectionRevealRequest === 0 || !window.matchMedia("(max-width: 900px)").matches) return;
    const panel = selectionPanelRef.current;
    if (!panel) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = window.requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      panel.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectionRevealRequest]);

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

  async function handleAddVacation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    if (!vacationStartDate || !vacationEndDate || vacationEndDate < vacationStartDate) {
      setError("Choose a valid vacation start and end date.");
      return;
    }
    if (vacationStartDate < formatDate(new Date())) {
      setError("Vacation must start today or later.");
      return;
    }

    setVacationPending("add");
    setError(null);
    setNotice(null);
    const result = await createVacation(token, vacationStartDate, vacationEndDate);
    setVacationPending(null);
    if (!result.success || !result.vacation) {
      setError(result.message ?? "Could not add vacation");
      return;
    }
    setVacations((current) => [...current, result.vacation!].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    const clearedCount = result.clearedAssignmentCount ?? 0;
    setNotice(
      clearedCount > 0
        ? `Vacation added. ${clearedCount} assignment${clearedCount === 1 ? "" : "s"} cleared for those dates.`
        : "Vacation added. New bookings are blocked for those dates.",
    );
    setVacationStartDate(vacationEndDate);
    setVacationEndDate(vacationEndDate);
  }

  async function handleDeleteVacation(vacation: Vacation) {
    if (!token) return;
    setVacationPending(vacation.vacationId);
    setError(null);
    setNotice(null);
    const result = await deleteVacation(token, vacation.vacationId);
    setVacationPending(null);
    if (!result.success) {
      setError(result.message ?? "Could not remove vacation");
      return;
    }
    setVacations((current) => current.filter((item) => item.vacationId !== vacation.vacationId));
    setNotice("Vacation removed. Booking is available again for those dates.");
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
    const vacationDates = action === "book"
      ? targetDates.filter((date) => isDateInVacation(date, vacations))
      : [];
    const actionableDates = action === "book"
      ? targetDates.filter((date) => !isDateInVacation(date, vacations))
      : targetDates;
    if (actionableDates.length === 0) {
      setError("All selected dates fall within your vacation.");
      return;
    }

    setPending(`${action}|${window}`);
    setError(null);
    setNotice(null);
    const results = await Promise.all(
      actionableDates.map((date) =>
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
    if (vacationDates.length > 0) {
      setNotice(`Booked ${successfulCount} weekly dates; skipped ${vacationDates.length} vacation date${vacationDates.length === 1 ? "" : "s"}.`);
    }
    if (isRecurring) setRepeatEnabled(false);
    await refresh();
  }

  function renderDay(date: string) {
    const daySlots = slots.filter((slot) => slot.date === date);
    const vacation = isDateInVacation(date, vacations);
    const vacationMarker = vacation
      ? <span className="calendar-vacation-marker">OUT · {assignmentInitials(user?.email ?? "")}</span>
      : null;

    const period = (window: WindowName) => {
      const periodSlots = daySlots.filter((slot) => slot.window === window);
      return (
        <span className={`calendar-day-period ${window === "morning" ? "am" : "pm"}`}>
          <span className="calendar-day-period-label">{window === "morning" ? "AM" : "PM"}</span>
          {periodSlots.length === 0 ? (
            <span className="calendar-day-empty">Closed</span>
          ) : (
            <span className="calendar-slot-markers">
              {periodSlots.map((slot) => (
                <span
                  key={slotKey(slot.date, slot.window)}
                  className={`calendar-slot-marker ${slot.bookedByMe ? "mine" : ""} ${slot.isOnVacation ? "vacation" : ""}`}
                  title={`${windowLabel(slot.window)}${slot.bookedByMe ? ": booked by you" : " available"}${slot.isOnVacation ? " — vacation" : ""}`}
                >
                  {slot.bookedByMe ? "Booked" : slot.bookedCount > 0 ? `${slot.bookedCount} booked` : "Open"}
                </span>
              ))}
            </span>
          )}
        </span>
      );
    };

    return (
      <span className="calendar-day-stack">
        {period("morning")}
        {period("evening")}
        {vacationMarker}
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
              Select a day, then choose a time for your {ROLE_LABELS[user.role].toLowerCase()} service.
            </p>
          )}
        </div>
        <div className="selection-summary" aria-live="polite">
          <span className="selection-summary-label">Your selection</span>
          <strong>{selectedDates.length === 1 ? "1 day selected" : "No day selected"}</strong>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {loading && <p className="loading-state">Loading this month...</p>}

      <section className="vacation-panel" aria-labelledby="vacation-heading">
        <div className="vacation-panel-heading">
          <div>
            <p className="eyebrow">Availability</p>
            <h2 id="vacation-heading">Plan a vacation</h2>
            <p className="note">Add dates when you cannot serve. New bookings and admin assignments will be blocked during that range.</p>
          </div>
          <span className="vacation-badge">Your time away</span>
        </div>
        <form className="vacation-form" onSubmit={handleAddVacation}>
          <label>
            <span>From</span>
            <input
              type="date"
              value={vacationStartDate}
              min={formatDate(new Date())}
              onChange={(event) => {
                setVacationStartDate(event.target.value);
                if (event.target.value && vacationEndDate < event.target.value) setVacationEndDate(event.target.value);
              }}
            />
          </label>
          <label>
            <span>Through</span>
            <input
              type="date"
              value={vacationEndDate}
              min={vacationStartDate || formatDate(new Date())}
              onChange={(event) => setVacationEndDate(event.target.value)}
            />
          </label>
          <button type="submit" className="primary-button" disabled={vacationPending !== null}>
            {vacationPending === "add" ? "Adding..." : "Add vacation"}
          </button>
        </form>
        {vacations.length > 0 && (
          <div className="vacation-list" aria-label="Your planned vacations">
            {vacations.map((vacation) => (
              <div className="vacation-row" key={vacation.vacationId}>
                <span>{shortDateLabel(vacation.startDate)} – {shortDateLabel(vacation.endDate)}</span>
                <button
                  type="button"
                  className="text-button"
                  disabled={vacationPending === vacation.vacationId}
                  onClick={() => handleDeleteVacation(vacation)}
                >
                  {vacationPending === vacation.vacationId ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="schedule-layout">
        <MonthCalendar
          month={month}
          selectedDates={selectedDates}
          onMonthChange={handleMonthChange}
          onDateClick={handleDateClick}
          onSelectionComplete={() => setSelectionRevealRequest((request) => request + 1)}
          renderDay={renderDay}
          getDayLabel={(date) => `${shortDateLabel(date)}. AM and PM coverage with vacation markers. Click to choose this day.`}
          isDateDisabled={(date) => date < formatDate(new Date())}
        />

        <aside ref={selectionPanelRef} className="selection-panel" tabIndex={-1} aria-label="Selected days and time windows">
          <div className="selection-panel-heading">
            <p className="eyebrow">Selected days</p>
            <h2>
              {selectedDates.length === 1 ? shortDateLabel(selectedDates[0]) : `${selectedDates.length} days`}
            </h2>
            <p className="note">Booking options are here. Pick a time block to book all selected days that are available.</p>
            {selectedDates.some((date) => isDateInVacation(date, vacations)) && (
              <p className="vacation-inline-note">Vacation dates cannot be newly booked. Existing bookings can still be cancelled.</p>
            )}
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
              const availableSlots = windowSlots.filter((slot) => !slot.bookedByMe && slot.bookable !== false);
              const bookedSlots = windowSlots.filter((slot) => slot.bookedByMe);
              const firstSlot = windowSlots[0];
              const recurrenceLabel = bookedSlots
                .map((slot) => weeklyRecurrenceLabel(slot.recurrenceStartDate ?? slot.date, slot.recurrenceEndDate))
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
