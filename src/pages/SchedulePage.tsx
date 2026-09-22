import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_LABELS } from "../config/roles";
import { formatDate, type WindowName } from "../config/schedulingRules";
import { bookSlot, cancelSlot, listSlots } from "../services/slotsApi";
import type { Slot } from "../types/slots";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_TO_SHOW = 14;

function slotKey(date: string, window: WindowName) {
  return `${date}|${window}`;
}

export default function SchedulePage() {
  const { user, token } = useAuth();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const result = await listSlots(token, formatDate(new Date()), DAYS_TO_SHOW);
    setLoading(false);
    if (!result.success || !result.slots) {
      setError(result.message ?? "Could not load slots");
      return;
    }
    setSlots(result.slots);
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggle(slot: Slot) {
    if (!token) return;
    setPending(slotKey(slot.date, slot.window));
    setError(null);
    const result = slot.bookedByMe
      ? await cancelSlot(token, slot.date, slot.window)
      : await bookSlot(token, slot.date, slot.window);
    setPending(null);
    if (!result.success) {
      setError(result.message ?? "That didn't work");
      return;
    }
    refresh();
  }

  const dates = [...new Set(slots.map((s) => s.date))];

  return (
    <main className="page">
      <h1>Schedule</h1>
      {user && <p className="subtitle">Showing open {ROLE_LABELS[user.role]} slots.</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && dates.length === 0 && <p>No open slots for your role right now.</p>}

      {!loading && dates.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Morning</th>
              <th>Evening</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const daySlots = slots.filter((s) => s.date === date);
              const day = daySlots[0].day;
              return (
                <tr key={date}>
                  <td>
                    {DAY_NAMES[day]} {date}
                  </td>
                  {(["morning", "evening"] as WindowName[]).map((window) => {
                    const slot = daySlots.find((s) => s.window === window);
                    if (!slot) return <td key={window}>—</td>;
                    const isPending = pending === slotKey(slot.date, slot.window);
                    return (
                      <td key={window}>
                        {slot.window === "morning" ? "AM" : `${slot.start}–${slot.end}`} {" "}
                        {slot.bookedByMe ? (
                          <>
                            <span className="note">Booked by you</span>{" "}
                            <button type="button" disabled={isPending} onClick={() => handleToggle(slot)}>
                              {isPending ? "..." : "Cancel"}
                            </button>
                          </>
                        ) : (
                          <>
                            {slot.bookedCount > 0 && (
                              <span className="note">{slot.bookedCount} already booked</span>
                            )}{" "}
                            <button type="button" disabled={isPending} onClick={() => handleToggle(slot)}>
                              {isPending ? "..." : "Book"}
                            </button>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
