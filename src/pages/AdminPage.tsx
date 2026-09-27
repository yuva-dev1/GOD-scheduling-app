import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import MonthCalendar from "../components/MonthCalendar";
import RecurringRangePicker from "../components/RecurringRangePicker";
import { ROLE_LABELS, ROLES, SELF_SERVE_ROLES, type Role } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import {
  addCalendarMonths,
  addMonthsToDate,
  calendarGridStart,
  formatShortMonthDay,
  shortDateLabel,
  startOfMonth,
  weeklyRecurrenceLabel,
  weeklyDates,
} from "../lib/calendar";
import { assignmentInitials } from "../lib/assignmentDisplay";
import { availablePerumalCount, coverageStatus, monthCoverageRisk } from "../lib/coverage";
import {
  assignSlot,
  createAdminVacation,
  deleteAdminVacation,
  listAdminSlots,
  listAdminUsers,
  listAdminVacations,
  unassignSlot,
  updateAdminVacation,
} from "../services/adminApi";
import type { AdminSlot, AdminUser, AdminVacation } from "../types/admin";
import { useAuth } from "../features/auth/AuthContext";

const DAYS_IN_CALENDAR = 42;
type AdminViewRole = Role | "all";
type CalendarAdminSlot = AdminSlot & { role: Role };

const ROLE_INDICATORS: Record<Role, { shortLabel: string; className: string; description: string }> = {
  [ROLES.PERUMAL_KAINKARYAM]: {
    shortLabel: "Perumal",
    className: "role-perumal",
    description: "Perumal service",
  },
  [ROLES.TIRTHA_KAINKARYAM]: {
    shortLabel: "Tirtha",
    className: "role-tirtha",
    description: "Tirtha service",
  },
  [ROLES.COORDINATOR]: {
    shortLabel: "Coordinator",
    className: "role-coordinator",
    description: "Coordinator service",
  },
  [ROLES.ADMIN]: {
    shortLabel: "Admin",
    className: "role-admin",
    description: "Administrator",
  },
};

function slotKey(slot: CalendarAdminSlot) {
  return `${slot.role}|${slot.date}|${slot.window}`;
}

function assignmentKey(slot: CalendarAdminSlot, email: string) {
  return `${slotKey(slot)}|${email}`;
}

function windowLabel(window: WindowName) {
  return window === "morning" ? "Morning" : "Evening";
}

function groupVacations(vacations: AdminVacation[]) {
  const groups = new Map<string, { email: string; initials: string; role: Role; ranges: AdminVacation[] }>();
  vacations.forEach((vacation) => {
    const current = groups.get(vacation.email) ?? {
      email: vacation.email,
      initials: assignmentInitials(vacation.email),
      role: vacation.role,
      ranges: [],
    };
    current.ranges.push(vacation);
    groups.set(vacation.email, current);
  });
  return Array.from(groups.values()).sort((a, b) => a.initials.localeCompare(b.initials));
}

const WINDOW_ORDER: Record<WindowName, number> = { morning: 0, evening: 1 };

export default function AdminPage() {
  const { token } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [viewRole, setViewRole] = useState<AdminViewRole>("all");
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatStartDate, setRepeatStartDate] = useState("");
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [slots, setSlots] = useState<CalendarAdminSlot[]>([]);
  const [vacations, setVacations] = useState<AdminVacation[]>([]);
  const [perumalUsers, setPerumalUsers] = useState<AdminUser[]>([]);
  const [perumalVacations, setPerumalVacations] = useState<AdminVacation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Record<string, string>>({});
  const [vacationFormEmail, setVacationFormEmail] = useState("");
  const [vacationFormStart, setVacationFormStart] = useState(() => formatDate(new Date()));
  const [vacationFormEnd, setVacationFormEnd] = useState(() => formatDate(new Date()));
  const [editingVacationId, setEditingVacationId] = useState<string | null>(null);
  const [selectionRevealRequest, setSelectionRevealRequest] = useState(0);
  const selectionPanelRef = useRef<HTMLElement | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const roles = viewRole === "all" ? SELF_SERVE_ROLES : [viewRole];
    const [results, vacationResult, usersResult] = await Promise.all([
      Promise.all(
        roles.map(async (role) => {
          const slotsResult = await listAdminSlots(token, role, calendarGridStart(month), DAYS_IN_CALENDAR);
          return { role, slotsResult };
        }),
      ),
      listAdminVacations(token, undefined, calendarGridStart(month), DAYS_IN_CALENDAR),
      listAdminUsers(token),
    ]);
    setLoading(false);

    const failed = results.find(({ slotsResult }) => !slotsResult.success || !slotsResult.slots);
    if (failed) {
      setError(failed.slotsResult.message ?? "Could not load the admin calendar");
      return;
    }
    if (!vacationResult.success || !vacationResult.vacations) {
      setError(vacationResult.message ?? "Could not load vacation dates");
      return;
    }
    if (!usersResult.success || !usersResult.users) {
      setError(usersResult.message ?? "Could not load the volunteer list");
      return;
    }

    const nextSlots = results.flatMap(({ role, slotsResult }) =>
      (slotsResult.slots ?? []).map((slot) => ({ ...slot, role })),
    );
    const allUsers = usersResult.users;
    const allVacations = vacationResult.vacations;
    const visibleVacations = viewRole === "all"
      ? allVacations
      : allVacations.filter((vacation) => vacation.role === viewRole);
    setSlots(nextSlots);
    setVacations(visibleVacations);
    setPerumalUsers(allUsers.filter((user) => user.role === ROLES.PERUMAL_KAINKARYAM));
    setPerumalVacations(allVacations.filter((vacation) => vacation.role === ROLES.PERUMAL_KAINKARYAM));
    setUsers(allUsers);
  }, [month, token, viewRole]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!users.some((user) => user.email === vacationFormEmail)) {
      setVacationFormEmail(users[0]?.email ?? "");
    }
  }, [users, vacationFormEmail]);

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

  async function handleAssign(slot: CalendarAdminSlot) {
    if (!token) return;
    const email = selectedEmail[slotKey(slot)];
    if (!email) return;
    setPending(slotKey(slot));
    setError(null);
    const recurringDates = repeatEnabled && repeatStartDate && repeatEndDate
      ? weeklyDates(repeatStartDate, repeatEndDate)
      : [slot.date];
    const results = await Promise.all(
      recurringDates.map((date) => assignSlot(
        token,
        date,
        slot.window,
        slot.role,
        email,
        repeatEnabled ? repeatEndDate : undefined,
      )),
    );
    setPending(null);
    const successfulCount = results.filter((result) => result.success).length;
    if (successfulCount !== results.length) {
      setError(
        repeatEnabled
          ? `Assigned ${successfulCount} of ${results.length} weekly dates. Some dates could not be assigned.`
          : results.find((result) => !result.success)?.message ?? "Assignment failed",
      );
      await refresh();
      return;
    }
    if (repeatEnabled) setRepeatEnabled(false);
    await refresh();
  }

  async function handleUnassign(slot: CalendarAdminSlot, email: string) {
    if (!token) return;
    setPending(assignmentKey(slot, email));
    setError(null);
    const recurringDates = repeatEnabled && repeatStartDate && repeatEndDate
      ? weeklyDates(repeatStartDate, repeatEndDate)
      : [slot.date];
    const results = await Promise.all(
      recurringDates.map((date) => unassignSlot(token, date, slot.window, slot.role, email)),
    );
    setPending(null);
    const successfulCount = results.filter((result) => result.success).length;
    const missingCount = results.filter((result) =>
      !result.success && result.message === "No active assignment found",
    ).length;
    if (successfulCount + missingCount !== results.length) {
      setError(
        repeatEnabled
          ? `Removed ${successfulCount} of ${results.length} weekly dates. Some dates could not be removed.`
          : results.find((result) => !result.success)?.message ?? "Remove failed",
      );
      return;
    }
    if (repeatEnabled) setRepeatEnabled(false);
    await refresh();
  }

  function handleEditVacation(vacation: AdminVacation) {
    setEditingVacationId(vacation.vacationId);
    setVacationFormEmail(vacation.email);
    setVacationFormStart(vacation.startDate);
    setVacationFormEnd(vacation.endDate);
    setError(null);
    setNotice(null);
  }

  function cancelVacationEdit() {
    setEditingVacationId(null);
    setVacationFormStart(formatDate(new Date()));
    setVacationFormEnd(formatDate(new Date()));
    setNotice(null);
  }

  async function handleVacationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !vacationFormEmail || !vacationFormStart || !vacationFormEnd) return;
    setPending(`vacation:${editingVacationId ?? "new"}`);
    setError(null);
    setNotice(null);
    const result = editingVacationId
      ? await updateAdminVacation(token, editingVacationId, vacationFormStart, vacationFormEnd)
      : await createAdminVacation(token, vacationFormEmail, vacationFormStart, vacationFormEnd);
    setPending(null);
    if (!result.success) {
      setError(result.message ?? "Vacation update failed");
      return;
    }
    const cleared = typeof result.clearedAssignmentCount === "number"
      ? ` ${result.clearedAssignmentCount} assignment${result.clearedAssignmentCount === 1 ? "" : "s"} cleared.`
      : "";
    setNotice(`${editingVacationId ? "Vacation updated." : "Vacation added."}${cleared}`);
    setEditingVacationId(null);
    setVacationFormStart(formatDate(new Date()));
    setVacationFormEnd(formatDate(new Date()));
    await refresh();
  }

  async function handleDeleteVacation(vacation: AdminVacation) {
    if (!token || !window.confirm(`Remove the vacation for ${vacation.email}?`)) return;
    setPending(`vacation:${vacation.vacationId}`);
    setError(null);
    setNotice(null);
    const result = await deleteAdminVacation(token, vacation.vacationId);
    setPending(null);
    if (!result.success) {
      setError(result.message ?? "Vacation removal failed");
      return;
    }
    if (editingVacationId === vacation.vacationId) cancelVacationEdit();
    setNotice("Vacation removed. Existing assignments were not recreated.");
    await refresh();
  }

  function renderDay(date: string) {
    const daySlots = slots.filter((slot) => slot.date === date);
    const dayVacations = vacations.filter((vacation) => date >= vacation.startDate && date <= vacation.endDate);
    const vacationInitials = Array.from(new Set(dayVacations.map((vacation) => assignmentInitials(vacation.email))));
    const vacationMarker = vacationInitials.length > 0
      ? <span className="calendar-vacation-marker">OUT · {vacationInitials.join(", ")}</span>
      : null;
    const availablePeople = availablePerumalCount(perumalUsers.length, date, perumalVacations);
    const status = coverageStatus(availablePeople);

    const period = (window: WindowName) => {
      const assignmentRows = SELF_SERVE_ROLES.map((role) => {
        const roleSlots = daySlots.filter((slot) => slot.role === role && slot.window === window);
        const assignments = roleSlots
          .flatMap((slot) => slot.assignedAssignments?.map((assignment) => assignment.email)
            ?? slot.assignedEmails
            ?? (slot.assignedEmail ? [slot.assignedEmail] : []));
        const emails = Array.from(new Set(assignments));
        return {
          role,
          emails,
          initials: emails.map((email) => assignmentInitials(email)),
        };
      }).filter((row) => row.initials.length > 0);

      const periodSlots = daySlots.filter((slot) => slot.window === window);
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
                  className={`calendar-assignment-row ${ROLE_INDICATORS[row.role].className}`}
                  title={`${ROLE_LABELS[row.role]} coverage: ${row.emails.join(", ")}`}
                >
                  {row.initials.join(", ")}
                </span>
              ))}
            </span>
          )}
        </span>
      );
    };

    return (
      <span className="calendar-day-stack">
        <span className="calendar-day-status-line">
          <span
            className={`coverage-light ${status}`}
            title={`${availablePeople} of ${perumalUsers.length} Perumal volunteers available`}
            aria-label={`${status} coverage: ${availablePeople} of ${perumalUsers.length} Perumal volunteers available`}
            role="img"
          />
          <span className="coverage-light-count">{availablePeople}</span>
        </span>
        {period("morning")}
        {period("evening")}
        {vacationMarker}
      </span>
    );
  }

  const selectedDate = selectedDates[0];
  const selectedDaySlots = selectedDate
    ? slots
        .filter((slot) => slot.date === selectedDate)
        .sort((a, b) => a.role.localeCompare(b.role) || WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window])
    : [];
  const selectedDayVacations = selectedDate
    ? vacations.filter((vacation) => selectedDate >= vacation.startDate && selectedDate <= vacation.endDate)
    : [];
  const vacationGroups = groupVacations(vacations);
  const risk = monthCoverageRisk(month, perumalUsers.length, perumalVacations);

  return (
    <main className="page admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations calendar</p>
          <h1>Schedule coverage</h1>
          <p className="subtitle">See every scheduled person for the month, then add or drop assignments from the selected day.</p>
        </div>
        <div className="coverage-summary" aria-label="Monthly Perumal coverage risk">
          <strong>{risk.red} red · {risk.yellow} yellow</strong>
          <span>Perumal risk days this month</span>
        </div>
      </div>

      <div className="role-tabs" aria-label="Filter services">
        <button type="button" className={viewRole === "all" ? "active" : ""} onClick={() => setViewRole("all")}>
          <span className="role-tab-dot all" aria-hidden="true" />
          <span>All services</span>
        </button>
        {SELF_SERVE_ROLES.map((role) => (
          <button key={role} type="button" className={viewRole === role ? "active" : ""} onClick={() => setViewRole(role)}>
            <span className={`role-tab-dot ${ROLE_INDICATORS[role].className}`} aria-hidden="true" />
            <span>{ROLE_LABELS[role]}</span>
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      {loading && <p className="loading-state">Loading this month...</p>}

      <div className={`admin-calendar-layout ${selectedDate ? "has-selection" : ""}`}>
        <div className="admin-calendar-main">
          <MonthCalendar
            month={month}
            selectedDates={selectedDates}
            onMonthChange={handleMonthChange}
            onDateClick={handleDateClick}
            onSelectionComplete={() => setSelectionRevealRequest((request) => request + 1)}
            renderDay={renderDay}
            getDayLabel={(date) => {
              const availablePeople = availablePerumalCount(perumalUsers.length, date, perumalVacations);
              return `${shortDateLabel(date)}. ${coverageStatus(availablePeople)} Perumal coverage, ${availablePeople} available. AM and PM coverage shown. Click to inspect assignments.`;
            }}
          />
          <div className="calendar-legend" aria-label="Calendar coverage legend">
            <span className="calendar-legend-title">Coverage</span>
            <span className="calendar-legend-item"><span className="coverage-light red" aria-hidden="true" /> Red: 0–1 available</span>
            <span className="calendar-legend-item"><span className="coverage-light yellow" aria-hidden="true" /> Yellow: 2 available</span>
            <span className="calendar-legend-item"><span className="coverage-light green" aria-hidden="true" /> Green: 3+ available</span>
            <span className="calendar-legend-item calendar-legend-vacation">OUT: vacation block</span>
          </div>
        </div>

        {selectedDate && (
          <aside ref={selectionPanelRef} className="admin-detail-panel" tabIndex={-1} aria-label="Assignments for selected day">
            <div className="selection-panel-heading">
              <p className="eyebrow">Selected day</p>
              <h2>{shortDateLabel(selectedDate)}</h2>
            <p className="note">Add a person to an open window or remove an existing assignment.</p>
            {selectedDayVacations.length > 0 && (
              <p className="vacation-inline-note">
                Vacation: {selectedDayVacations.map((vacation) => vacation.email).join(", ")}. New assignments are blocked for these people.
              </p>
            )}
            </div>
            <RecurringRangePicker
              enabled={repeatEnabled}
              startDate={repeatStartDate || selectedDate}
              endDate={repeatEndDate || addMonthsToDate(selectedDate, 6)}
              minDate={formatDate(new Date())}
              disabled={selectedDate < formatDate(new Date())}
              onEnabledChange={setRepeatEnabled}
              onStartDateChange={(date) => {
                setRepeatStartDate(date);
                setSelectedDates(date ? [date] : []);
                if (date) setMonth(startOfMonth(new Date(`${date}T12:00:00`)));
              }}
              onEndDateChange={setRepeatEndDate}
            />
            <div className="admin-slot-list">
              {selectedDaySlots.length === 0 && <p className="note">No service windows are open on this day.</p>}
              {selectedDaySlots.map((slot) => {
                const assignedAssignments = slot.assignedAssignments ?? (slot.assignedEmails ?? (slot.assignedEmail ? [slot.assignedEmail] : [])).map((email) => ({
                  email,
                  recurrenceStartDate: null,
                  recurrenceEndDate: null,
                }));
                const isAssignPending = pending === slotKey(slot);
                const roleUsers = users.filter((user) => user.role === slot.role);
                return (
                  <section className="admin-slot-card" key={slotKey(slot)}>
                    <div className="admin-slot-card-heading">
                      <div>
                        <span className={`service-label ${ROLE_INDICATORS[slot.role].className}`}>
                          {ROLE_INDICATORS[slot.role].shortLabel}
                        </span>
                        <h3>{windowLabel(slot.window)}</h3>
                        <span className="note">{slot.start}–{slot.end}</span>
                      </div>
                      <strong className="assignment-count">{slot.assignedCount}</strong>
                    </div>

                    <div className="assignment-list">
                      {assignedAssignments.length === 0 && <p className="note">No one assigned yet.</p>}
                      {assignedAssignments.map((assignment) => {
                        const unassignKey = assignmentKey(slot, assignment.email);
                        const recurrenceLabel = weeklyRecurrenceLabel(assignment.recurrenceStartDate ?? slot.date, assignment.recurrenceEndDate);
                        const isUnassignPending = pending === unassignKey;
                        return (
                          <div className="assignment-row" key={assignment.email}>
                              <span className="assignment-person-wrap">
                                <span className="assignment-person">
                                  {assignment.email}
                                </span>
                                {recurrenceLabel && <span className="assignment-recurring">{recurrenceLabel}</span>}
                              </span>
                               <span className="assignment-actions">
                                 <button type="button" className="text-button" disabled={isUnassignPending || isAssignPending || pending !== null} onClick={() => handleUnassign(slot, assignment.email)}>
                                   {isUnassignPending ? "Removing..." : repeatEnabled ? "Remove every week" : "Remove"}
                                 </button>
                               </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="assign-row">
                      <select
                        aria-label={`Choose a person for ${ROLE_LABELS[slot.role]} ${windowLabel(slot.window)}`}
                        value={selectedEmail[slotKey(slot)] ?? ""}
                        onChange={(event) => setSelectedEmail((current) => ({ ...current, [slotKey(slot)]: event.target.value }))}
                      >
                        <option value="">Add a person...</option>
                        {roleUsers.map((user) => <option key={user.userId} value={user.email}>{user.email}</option>)}
                      </select>
                      <button type="button" className="primary-button compact" disabled={isAssignPending || !selectedEmail[slotKey(slot)]} onClick={() => handleAssign(slot)}>
                        {isAssignPending ? "Adding..." : "Add"}
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      <section className="calendar-vacation-summary" aria-labelledby="calendar-vacation-heading">
        <div className="calendar-vacation-summary-heading">
          <div>
            <p className="eyebrow">Separate list</p>
            <h2 id="calendar-vacation-heading">Vacations in view</h2>
            <p className="note">Vacation ranges are listed here so the date grid stays focused on coverage.</p>
          </div>
          <span className="vacation-badge">{vacations.length} range{vacations.length === 1 ? "" : "s"}</span>
        </div>
        <form className="admin-vacation-form" onSubmit={handleVacationSubmit}>
          <div>
            <p className="eyebrow">Admin vacation controls</p>
            <h3>{editingVacationId ? "Edit vacation" : "Add vacation"}</h3>
            <p className="note">Adding or changing a range clears that person&apos;s assignments inside the vacation dates.</p>
          </div>
          <label>
            Person
            <select
              required
              value={vacationFormEmail}
              disabled={editingVacationId !== null || pending !== null || users.length === 0}
              onChange={(event) => setVacationFormEmail(event.target.value)}
            >
              <option value="">Choose a person...</option>
              {users.map((user) => <option key={user.userId} value={user.email}>{user.email}</option>)}
            </select>
          </label>
          <label>
            From
            <input
              required
              type="date"
              min={formatDate(new Date())}
              value={vacationFormStart}
              disabled={pending !== null}
              onChange={(event) => setVacationFormStart(event.target.value)}
            />
          </label>
          <label>
            Through
            <input
              required
              type="date"
              min={vacationFormStart || formatDate(new Date())}
              value={vacationFormEnd}
              disabled={pending !== null}
              onChange={(event) => setVacationFormEnd(event.target.value)}
            />
          </label>
          <div className="admin-vacation-form-actions">
            <button type="submit" className="primary-button compact" disabled={pending !== null || !vacationFormEmail}>
              {pending === `vacation:${editingVacationId ?? "new"}` ? "Saving..." : editingVacationId ? "Save changes" : "Add vacation"}
            </button>
            {editingVacationId && (
              <button type="button" className="text-button" disabled={pending !== null} onClick={cancelVacationEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {vacationGroups.length === 0 ? (
          <p className="note">No vacation ranges overlap this calendar view.</p>
        ) : (
          <div className="calendar-vacation-groups">
            {vacationGroups.map((group) => (
              <div className="calendar-vacation-group" key={group.email}>
                <div className="calendar-vacation-person">
                  <span className="calendar-vacation-initials">{group.initials}</span>
                  <span>
                    <strong>{group.initials}</strong>
                    <small>{ROLE_LABELS[group.role]}</small>
                  </span>
                </div>
                <div className="calendar-vacation-ranges">
                  {group.ranges.map((vacation) => (
                    <div className="calendar-vacation-range" key={vacation.vacationId}>
                      <span>{formatShortMonthDay(vacation.startDate)} – {formatShortMonthDay(vacation.endDate)}</span>
                      <button
                        type="button"
                        className="text-button"
                        disabled={pending !== null}
                        onClick={() => handleEditVacation(vacation)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-button danger-button"
                        disabled={pending !== null}
                        onClick={() => handleDeleteVacation(vacation)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="calendar-legend" aria-label="Calendar legend">
        <span className="calendar-legend-title">Legend</span>
        <span className="calendar-legend-item role-perumal">
          <span className="calendar-legend-swatch" aria-hidden="true" />
          Perumal Kainkaryam
        </span>
        <span className="calendar-legend-item role-tirtha">
          <span className="calendar-legend-swatch" aria-hidden="true" />
          Tirtha Kainkaryam
        </span>
        <span className="calendar-legend-item role-coordinator">
          <span className="calendar-legend-swatch" aria-hidden="true" />
          Coordinator
        </span>
      </div>
    </main>
  );
}
