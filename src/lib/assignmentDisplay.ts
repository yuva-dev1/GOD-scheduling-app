// The calendar is intentionally compact. These fragments match the volunteer
// names used by the scheduling group; unknown accounts still get a readable
// two-letter fallback from their email address.
const KNOWN_INITIALS: Array<{ fragment: string; initials: string }> = [
  { fragment: "aravind", initials: "AT" },
  { fragment: "sriram", initials: "SR" },
  { fragment: "srinan", initials: "SK" },
  { fragment: "dnanirs", initials: "SK" },
  { fragment: "dwaraka", initials: "DV" },
  { fragment: "krishna", initials: "KC" },
  { fragment: "swathik", initials: "ST" },
  { fragment: "srinivasan", initials: "SA" },
];

export function assignmentInitials(email: string): string {
  const localPart = email.split("@", 1)[0].toLowerCase();
  const known = KNOWN_INITIALS.find((entry) => localPart.includes(entry.fragment));
  if (known) return known.initials;

  const words = localPart.split(/[^a-z]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}
