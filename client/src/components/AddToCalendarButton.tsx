import { CalendarPlus } from "lucide-react";
import { eventEndsAt, eventStartsAt, type EventTimeLike } from "@shared/eventTime";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { nativeApp } from "@/lib/nativeApp";

type CalendarExperience = EventTimeLike & {
  id: string;
  title: string;
  location?: string | null;
  venue?: string | null;
};

/**
 * "Add to calendar" for a booked experience. In the iOS/Android app it opens
 * the phone's own new-event sheet, prefilled. In a browser it downloads an
 * .ics file, which every calendar app (and iOS Safari directly) can import.
 */
export default function AddToCalendarButton({ experience }: { experience: CalendarExperience }) {
  const { toast } = useToast();
  const start = eventStartsAt(experience);
  if (!start) return null;
  const endCandidate = eventEndsAt(experience);
  const end = endCandidate && endCandidate > start ? endCandidate : new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const location = [experience.venue, experience.location].filter(Boolean).join(", ");
  const url = `${window.location.origin}/experience/${experience.id}`;

  async function add() {
    const calendar = nativeApp()?.calendar;
    try {
      if (calendar) {
        await calendar.add({
          title: experience.title,
          start: start!.toISOString(),
          end: end.toISOString(),
          location,
          notes: "Booked on Great.",
          url,
        });
        return;
      }
      downloadIcs({ uid: `${experience.id}@greatexperiences.ai`, title: experience.title, start: start!, end, location, url });
    } catch (error) {
      toast({ title: "Couldn't add to your calendar", description: String((error as any)?.message ?? error), variant: "destructive" });
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={add} className="gap-2" data-testid={`button-add-calendar-${experience.id}`}>
      <CalendarPlus className="h-4 w-4" />
      Add to calendar
    </Button>
  );
}

function downloadIcs(event: { uid: string; title: string; start: Date; end: Date; location: string; url: string }) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Great Experiences//EN",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    event.location ? `LOCATION:${escape(event.location)}` : "",
    `URL:${event.url}`,
    `DESCRIPTION:${escape(`Booked on Great.\n${event.url}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  link.download = `${event.title.replace(/[^\w\- ]+/g, "").trim() || "experience"}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
