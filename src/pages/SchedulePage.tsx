import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import MonthCalendar from "../components/MonthCalendar";
import RecurringRangePicker from "../components/RecurringRangePicker";
import { ROLE_LABELS, ROLES, SELF_SERVE_ROLES, type Role } from "../config/roles";
import { MAX_DISPLAY_MONTH, isDisplayDate, isMonthAfter, isMonthBefore } from "../config/calendarDisplay";
import { isShravanamDate } from "../config/specialDates";
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
import { availablePerumalCount, coverageStatus, monthCoverageRisk } from "../lib/coverage";
import { vacationAppliesToWindow, vacationSessionLabel } from "../lib/vacation";
import { bookSlot, cancelSlot, listSlots, notifyBookingSeries } from "../services/slotsApi";
import { listCoverage } from "../services/coverageApi";
import { createVacation, deleteVacation, listVacations } from "../services/vacationsApi";
import type { CoverageSlot } from "../types/coverage";
import type { Slot } from "../types/slots";
import type { Vacation, VacationSession } from "../types/vacations";
import { useAuth } from "../features/auth/AuthContext";

const DAYS_IN_CALENDAR = 42;
const WINDOWS: WindowName[] = ["morning", "evening"];

function windowLabel(window: WindowName) {
  return window === "morning" ? "Morning" : "Evening";
}

function roleClassName(role: Role) {
  if (role === ROLES.TIRTHA_KAINKARYAM) return "role-tirtha";
  if (role === ROLES.COORDINATOR) return "role-coordinator";
  return "role-perumal";
}

function isDateInVacation(date: string, vacations: Vacation[], window?: WindowName) {
  return vacations.some((vacation) => date >= vacation.startDate && date <= vacation.endDate && (!window || vacationAppliesToWindow(vacation.session, window)));
}

export default function SchedulePage() {
  const { user, token } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDates, setSelectedDates] = useState<string[]>([formatDate(new Date())]);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatStartDate, setRepeatStartDate] = useState(() => formatDate(new Date()));
  const [repeatEndDate, setRepeatEndDate] = useState(() => addMonthsToDate(formatDate(new Date()), 6));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [coverageSlots, setCoverageSlots] = useState<CoverageSlot[]>([]);
  const [coverageVacations, setCoverageVacations] = useState<NonNullable<Awaited<ReturnType<typeof listCoverage>>["vacations"]>>([]);
  const [perumalUserCount, setPerumalUserCount] = useState<number | null>(null);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [vacationStartDate, setVacationStartDate] = useState(() => formatDate(new Date()));
  const [vacationEndDate, setVacationEndDate] = useState(() => formatDate(new Date()));
  const [vacationSession, setVacationSession] = useState<VacationSession>("full_day");
  const [vacationNote, setVacationNote] = useState("");
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
    const [result, coverageResult, vacationResult] = await Promise.all([
      listSlots(token, calendarGridStart(month), DAYS_IN_CALENDAR),
      listCoverage(token, calendarGridStart(month), DAYS_IN_CALENDAR),
      listVacations(token),
    ]);
    setLoading(false);
    if (
      !result.success || !result.slots ||
      !coverageResult.success || !coverageResult.slots || !coverageResult.vacations ||
      !vacationResult.success || !vacationResult.vacations
    ) {
      setError(result.message ?? coverageResult.message ?? "Could not load your schedule");
      return;
    }
    setSlots(result.slots);
    setCoverageSlots(coverageResult.slots);
    setCoverageVacations(coverageResult.vacations);
    setPerumalUserCount(typeof coverageResult.perumalUserCount === "number" ? coverageResult.perumalUserCount : null);
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
    setMonth((current) => {
      const next = addCalendarMonths(current, offset);
      if (isMonthBefore(next, startOfMonth(new Date())) || isMonthAfter(next, MAX_DISPLAY_MONTH)) return current;
      return next;
    });
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
    const result = await createVacation(token, vacationStartDate, vacationEndDate, vacationSession, vacationNote);
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
      ? targetDates.filter((date) => isDateInVacation(date, vacations, window))
      : [];
    const actionableDates = action === "book"
      ? targetDates.filter((date) => !isDateInVacation(date, vacations, window))
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
    if (isRecurring && action === "book" && successfulCount > 0 && repeatStartDate && repeatEndDate) {
      const notification = await notifyBookingSeries(token, repeatStartDate, window, repeatEndDate);
      if (!notification.success) {
        setError(notification.message ?? "Bookings were saved, but the confirmation email could not be sent.");
        await refresh();
        return;
      }
    }
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
    const daySlots = coverageSlots.filter((slot) => slot.date === date);
    const dayVacations = coverageVacations.filter((vacation) => date >= vacation.startDate && date <= vacation.endDate);
    const perumalVacations = dayVacations.filter((vacation) => vacation.role === ROLES.PERUMAL_KAINKARYAM);
    const availablePeople = perumalUserCount === null
      ? null
      : availablePerumalCount(perumalUserCount, date, perumalVacations);
    const status = availablePeople === null ? null : coverageStatus(availablePeople);
    const vacationMarkerFor = (window: WindowName) => {
      const windowVacations = dayVacations.filter((vacation) => vacationAppliesToWindow(vacation.session, window));
      const initials = Array.from(new Set(windowVacations.map((vacation) => assignmentInitials(vacation.email))));
      return initials.length > 0
        ? <span className="calendar-vacation-marker" title={`Vacation: ${windowVacations.map((vacation) => vacation.email).join(", ")}`}>OUT · {initials.join(", ")}</span>
        : null;
    };
    const fullDayInitials = Array.from(new Set(dayVacations.filter((vacation) => vacation.session === "full_day").map((vacation) => assignmentInitials(vacation.email))));
    const fullDayVacationMarker = fullDayInitials.length > 0
      ? <span className="calendar-vacation-marker">OUT · {fullDayInitials.join(", ")}</span>
      : null;

    const period = (window: WindowName) => {
      const periodSlots = daySlots.filter((slot) => slot.window === window);
      const assignmentRows = SELF_SERVE_ROLES.map((role) => {
        const roleSlots = periodSlots.filter((slot) => slot.role === role);
        const emails = Array.from(new Set(roleSlots.flatMap((slot) => slot.assignedEmails)));
        return { role, emails, initials: emails.map((email) => assignmentInitials(email)) };
      }).filter((row) => row.initials.length > 0);
      return (
        <span className={`calendar-day-period ${window === "morning" ? "am" : "pm"}`}>
          <span className="calendar-day-period-label">{window === "morning" ? "AM" : "PM"}</span>
          {periodSlots.length === 0 ? (
            <span className="calendar-day-empty">Closed</span>
          ) : assignmentRows.length === 0 ? (
            <span className="calendar-day-empty">Open</span>
          ) : (
            <span className="calendar-assignment-rows">
              {assignmentRows.map((row) => (
                <span
                  key={row.role}
                  className={`calendar-assignment-row ${roleClassName(row.role)}`}
                  title={`${ROLE_LABELS[row.role]} ${windowLabel(window)}: ${row.emails.join(", ")}`}
                >
                  {row.initials.join(", ")}
                </span>
              ))}
            </span>
          )}
          {vacationMarkerFor(window)}
        </span>
      );
    };

    return (
      <span className="calendar-day-stack">
        {status && availablePeople !== null && (
          <span className="calendar-day-status-line">
            <span
              className={`coverage-light ${status}`}
              title={`${availablePeople} of ${perumalUserCount} Perumal volunteers available`}
              aria-label={`${status} coverage: ${availablePeople} of ${perumalUserCount} Perumal volunteers available`}
              role="img"
            >{status === "red" ? "R" : status === "yellow" ? "Y" : "G"}</span>
            <span className="coverage-light-count">{availablePeople}</span>
          </span>
        )}
        {period("morning")}
        {period("evening")}
        {fullDayVacationMarker}
        {isShravanamDate(date) && <span className="calendar-special-marker" title="Shravanam" aria-label="Shravanam">☸</span>}
      </span>
    );
  }

  const selectedSlotGroups = WINDOWS.map((window) => ({
    window,
    slots: selectedDates
      .map((date) => slots.find((slot) => slot.date === date && slot.window === window))
      .filter((slot): slot is Slot => Boolean(slot)),
  }));
  const selectedDate = selectedDates[0];
  const selectedCoverageSlots = selectedDate
    ? coverageSlots
        .filter((slot) => slot.date === selectedDate)
        .sort((a, b) => a.role.localeCompare(b.role) || WINDOWS.indexOf(a.window) - WINDOWS.indexOf(b.window))
    : [];
  const selectedCoverageVacations = selectedDate
    ? coverageVacations.filter((vacation) => selectedDate >= vacation.startDate && selectedDate <= vacation.endDate)
    : [];
  const perumalVacations = coverageVacations.filter((vacation) => vacation.role === ROLES.PERUMAL_KAINKARYAM);
  const risk = perumalUserCount === null ? null : monthCoverageRisk(month, perumalUserCount, perumalVacations);

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
        <div className="schedule-header-summaries">
          {risk && (
            <div className="coverage-summary" aria-label="Monthly Perumal coverage risk">
              <strong>{risk.red} red · {risk.yellow} yellow</strong>
              <span>Perumal risk days this month</span>
            </div>
          )}
          <div className="selection-summary" aria-live="polite">
            <span className="selection-summary-label">Your selection</span>
            <strong>{selectedDates.length === 1 ? "1 day selected" : "No day selected"}</strong>
          </div>
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
          <label>
            <span>Session</span>
            <select value={vacationSession} onChange={(event) => setVacationSession(event.target.value as VacationSession)}>
              <option value="full_day">All day</option>
              <option value="morning">AM only</option>
              <option value="evening">PM only</option>
            </select>
          </label>
          <label>
            <span>Note <small>(optional, max 30)</small></span>
            <input type="text" maxLength={30} value={vacationNote} onChange={(event) => setVacationNote(event.target.value)} />
          </label>
          <button type="submit" className="primary-button" disabled={vacationPending !== null}>
            {vacationPending === "add" ? "Adding..." : "Add vacation"}
          </button>
        </form>
        {vacations.length > 0 && (
          <div className="vacation-list" aria-label="Your planned vacations">
            {vacations.map((vacation) => (
              <div className="vacation-row" key={vacation.vacationId}>
                <span>{shortDateLabel(vacation.startDate)} – {shortDateLabel(vacation.endDate)} · {vacationSessionLabel(vacation.session)}{vacation.note ? ` · ${vacation.note}` : ""}</span>
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
            getDayLabel={(date) => {
              if (perumalUserCount === null) {
                return `${shortDateLabel(date)}. AM and PM coverage with vacation markers. Click to choose this day.`;
              }
              const availablePeople = availablePerumalCount(
                perumalUserCount,
                date,
                perumalVacations.filter((vacation) => date >= vacation.startDate && date <= vacation.endDate),
              );
              return `${shortDateLabel(date)}. ${coverageStatus(availablePeople)} Perumal coverage, ${availablePeople} available. AM and PM coverage with vacation markers. Click to choose this day.`;
            }}
          minMonth={startOfMonth(new Date())}
          maxMonth={MAX_DISPLAY_MONTH}
          isDateVisible={isDisplayDate}
          isDateDisabled={(date) => !isDisplayDate(date)}
        />

        <div className="calendar-legend" aria-label="Calendar legend">
          <span className="calendar-legend-title">Legend</span>
          <span className="calendar-legend-item"><span className="coverage-light red" aria-hidden="true">R</span> Red: 0–1 available</span>
          <span className="calendar-legend-item"><span className="coverage-light yellow" aria-hidden="true">Y</span> Yellow: 2 available</span>
          <span className="calendar-legend-item"><span className="coverage-light green" aria-hidden="true">G</span> Green: 3+ available</span>
          <span className="calendar-legend-item calendar-legend-vacation">OUT: vacation block</span>
          <span className="calendar-legend-item calendar-legend-special"><span className="calendar-special-icon" aria-hidden="true">☸</span> Shravanam</span>
        </div>

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

          <section className="coverage-read-only" aria-labelledby="coverage-detail-heading">
            <div className="coverage-read-only-heading">
              <div>
                <p className="eyebrow">Everyone&apos;s schedule</p>
                <h3 id="coverage-detail-heading">Coverage overview</h3>
              </div>
              <span className="read-only-badge">Read-only</span>
            </div>
            <p className="note">Assignments and vacations for other people can be viewed here, but only your own booking controls below can change data.</p>
            {selectedCoverageSlots.map((slot) => (
              <div className="coverage-read-only-row" key={`${slot.date}|${slot.window}|${slot.role}`}>
                <div>
                  <span className={`service-label ${roleClassName(slot.role)}`}>{ROLE_LABELS[slot.role]}</span>
                  <strong>{windowLabel(slot.window)}</strong>
                  <span className="note">{slot.start}–{slot.end}</span>
                </div>
                <div className="coverage-assignees">
                  {slot.assignedAssignments.length === 0 ? (
                    <span className="note">Open</span>
                  ) : (
                    slot.assignedAssignments.map((assignment) => (
                      <span key={assignment.email} title={assignment.email}>
                        {assignmentInitials(assignment.email)} <small>{assignment.email}</small>
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
            {selectedCoverageVacations.length > 0 && (
              <div className="coverage-read-only-vacations">
                <strong>On vacation</strong>
                <span>{selectedCoverageVacations.map((vacation) => `${vacation.email} (${vacationSessionLabel(vacation.session)}${vacation.note ? ` — ${vacation.note}` : ""})`).join(", ")}</span>
              </div>
            )}
          </section>

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

      <section className="calendar-vacation-summary coverage-vacation-summary" aria-labelledby="coverage-vacation-heading">
        <div className="calendar-vacation-summary-heading">
          <div>
            <p className="eyebrow">Read-only view</p>
            <h2 id="coverage-vacation-heading">Vacations in view</h2>
            <p className="note">Everyone&apos;s vacation ranges are visible here. You can manage only your own ranges above.</p>
          </div>
          <span className="vacation-badge">{coverageVacations.length} range{coverageVacations.length === 1 ? "" : "s"}</span>
        </div>
        {coverageVacations.length === 0 ? (
          <p className="note">No vacations are recorded in this calendar range.</p>
        ) : (
          <div className="calendar-vacation-groups">
            {coverageVacations.map((vacation) => (
              <div className="calendar-vacation-group" key={vacation.vacationId}>
                <div className="calendar-vacation-person">
                  <span className="calendar-vacation-initials">{assignmentInitials(vacation.email)}</span>
                  <span>
                    <strong>{vacation.email}</strong>
                    <small>{ROLE_LABELS[vacation.role]}</small>
                  </span>
                </div>
                <div className="calendar-vacation-ranges">
                  <span className="calendar-vacation-range">{shortDateLabel(vacation.startDate)} – {shortDateLabel(vacation.endDate)} · {vacationSessionLabel(vacation.session)}{vacation.note ? ` · ${vacation.note}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
