import { useCallback, useEffect, useState } from "react";
import MonthCalendar from "../components/MonthCalendar";
import RecurringRangePicker from "../components/RecurringRangePicker";
import { ROLE_LABELS, ROLES, SELF_SERVE_ROLES, type Role } from "../config/roles";
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
import { assignSlot, listAdminSlots, listAdminUsers, unassignSlot } from "../services/adminApi";
import type { AdminSlot, AdminUser } from "../types/admin";
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const roles = viewRole === "all" ? SELF_SERVE_ROLES : [viewRole];
    const results = await Promise.all(
      roles.map(async (role) => {
        const [slotsResult, usersResult] = await Promise.all([
          listAdminSlots(token, role, calendarGridStart(month), DAYS_IN_CALENDAR),
          listAdminUsers(token, role),
        ]);
        return { role, slotsResult, usersResult };
      }),
    );
    setLoading(false);

    const failed = results.find(({ slotsResult, usersResult }) =>
      !slotsResult.success || !slotsResult.slots || !usersResult.success,
    );
    if (failed) {
      setError(failed.slotsResult.message ?? "Could not load the admin calendar");
      return;
    }

    const nextSlots = results.flatMap(({ role, slotsResult }) =>
      (slotsResult.slots ?? []).map((slot) => ({ ...slot, role })),
    );
    const nextUsers = results.flatMap(({ usersResult }) => usersResult.users ?? []);
    setSlots(nextSlots);
    setUsers(Array.from(new Map(nextUsers.map((user) => [user.email, user])).values()));
  }, [month, token, viewRole]);

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

  function handleDateRange(_startDate: string, endDate: string) {
    setSelectedDates([endDate]);
    setRepeatStartDate(endDate);
    setRepeatEndDate(addMonthsToDate(endDate, 6));
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

  function renderDay(date: string) {
    const daySlots = slots.filter((slot) => slot.date === date);
    if (daySlots.length === 0) {
      return <span className="calendar-day-empty">Closed</span>;
    }

    return (
      <span className="calendar-slot-markers">
        {daySlots.map((slot) => (
          <span
            key={slotKey(slot)}
            className={`calendar-slot-marker ${ROLE_INDICATORS[slot.role].className}`}
            title={`${ROLE_LABELS[slot.role]}, ${windowLabel(slot.window)}`}
          >
            {ROLE_INDICATORS[slot.role].shortLabel} {slot.window === "morning" ? "AM" : "PM"}
            {slot.assignedCount > 0 ? ` · ${slot.assignedCount}` : ""}
          </span>
        ))}
      </span>
    );
  }

  const selectedDate = selectedDates[0];
  const selectedDaySlots = selectedDate
    ? slots
        .filter((slot) => slot.date === selectedDate)
        .sort((a, b) => a.role.localeCompare(b.role) || WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window])
    : [];

  return (
    <main className="page admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operations calendar</p>
          <h1>Schedule coverage</h1>
          <p className="subtitle">See every scheduled person for the month, then add or drop assignments from the selected day.</p>
        </div>
        <div className="coverage-summary">
          <strong>{slots.filter((slot) => slot.assignedCount > 0).length}</strong>
          <span>covered windows in view</span>
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
      {loading && <p className="loading-state">Loading this month...</p>}

      <div className={`admin-calendar-layout ${selectedDate ? "has-selection" : ""}`}>
        <MonthCalendar
          month={month}
          selectedDates={selectedDates}
          onMonthChange={handleMonthChange}
          onDateClick={handleDateClick}
          onDateRange={handleDateRange}
          renderDay={renderDay}
          getDayLabel={(date) => `${shortDateLabel(date)}. Click to inspect assignments.`}
        />

        {selectedDate && (
          <aside className="admin-detail-panel" aria-label="Assignments for selected day">
            <div className="selection-panel-heading">
              <p className="eyebrow">Selected day</p>
              <h2>{shortDateLabel(selectedDate)}</h2>
              <p className="note">Add a person to an open window or remove an existing assignment.</p>
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
                        const recurrenceLabel = weeklyRecurrenceLabel(slot.date, assignment.recurrenceEndDate);
                        const isUnassignPending = pending === unassignKey;
                        return (
                          <div className="assignment-row" key={assignment.email}>
                              <span className="assignment-person-wrap">
                                <span className="assignment-person">{assignment.email}</span>
                                {recurrenceLabel && <span className="assignment-recurring">{recurrenceLabel}</span>}
                              </span>
                              <button type="button" className="text-button" disabled={isUnassignPending || isAssignPending} onClick={() => handleUnassign(slot, assignment.email)}>
                              {isUnassignPending ? "Removing..." : repeatEnabled ? "Remove every week" : "Remove"}
                              </button>
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
    </main>
  );
}
