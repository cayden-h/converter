import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { FormatGroup } from "../../shared/ipc";
import { MEDIA_GROUP_ORDER } from "../../shared/media";
import { computeFormatAvailability, type AvailableFormat } from "../formatAvailability";

interface FormatPickerProps {
  /** One entry per selected file, each that file's `groupedOutputsFor` result. */
  perFileGroups: FormatGroup[][];
  value: string;
  onChange(format: string): void;
}

interface MediumSection {
  medium: string;
  formats: AvailableFormat[];
}

export function FormatPicker({ perFileGroups, value, onChange }: FormatPickerProps) {
  const availability = useMemo(
    () => computeFormatAvailability(perFileGroups),
    [perFileGroups],
  );

  const sections = useMemo<MediumSection[]>(() => {
    const byMedium = new Map<string, AvailableFormat[]>();
    for (const item of availability) {
      const bucket = byMedium.get(item.medium);
      if (bucket) bucket.push(item);
      else byMedium.set(item.medium, [item]);
    }
    for (const bucket of byMedium.values()) {
      bucket.sort((a, b) => a.format.localeCompare(b.format));
    }
    return MEDIA_GROUP_ORDER.filter((medium) => byMedium.has(medium)).map((medium) => ({
      medium,
      formats: byMedium.get(medium)!,
    }));
  }, [availability]);

  const [search, setSearch] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const query = search.trim().toLowerCase();

  const visibleSections = useMemo(
    () =>
      sections
        .map((section) => ({
          medium: section.medium,
          formats: query
            ? section.formats.filter((item) => item.format.toLowerCase().includes(query))
            : section.formats,
        }))
        .filter((section) => section.formats.length > 0),
    [sections, query],
  );

  const commonSections = visibleSections.filter((section) => section.medium !== "Other");
  const otherSection = visibleSections.find((section) => section.medium === "Other");
  // Searching implicitly reveals "Other" - hiding a match because its group
  // is collapsed would make the search field lie.
  const otherExpanded = showOther || query.length > 0;

  const flatList = useMemo(() => {
    const list = commonSections.flatMap((section) => section.formats);
    if (otherSection && otherExpanded) list.push(...otherSection.formats);
    return list;
  }, [commonSections, otherSection, otherExpanded]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, perFileGroups]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(index + 1, Math.max(flatList.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flatList[highlighted];
      if (item?.enabled) onChange(item.format);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSearch("");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search formats..."
        aria-label="Search formats"
        className="rounded border border-border bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <div className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
        {commonSections.map((section) => (
          <FormatSection
            key={section.medium}
            heading={section.medium}
            items={section.formats}
            flatList={flatList}
            highlighted={highlighted}
            value={value}
            onChange={onChange}
            onHover={setHighlighted}
          />
        ))}

        {otherSection && (
          <div>
            <button
              type="button"
              onClick={() => setShowOther((prev) => !prev)}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
              aria-expanded={otherExpanded}
            >
              <span aria-hidden>{otherExpanded ? "▾" : "▸"}</span>
              Uncommon formats ({otherSection.formats.length})
            </button>
            {otherExpanded && (
              <div className="mt-2">
                <FormatSection
                  heading={null}
                  items={otherSection.formats}
                  flatList={flatList}
                  highlighted={highlighted}
                  value={value}
                  onChange={onChange}
                  onHover={setHighlighted}
                />
              </div>
            )}
          </div>
        )}

        {visibleSections.length === 0 && (
          <p className="text-sm text-muted">No formats match &ldquo;{search}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}

interface FormatSectionProps {
  heading: string | null;
  items: AvailableFormat[];
  flatList: AvailableFormat[];
  highlighted: number;
  value: string;
  onChange(format: string): void;
  onHover(index: number): void;
}

function FormatSection({
  heading,
  items,
  flatList,
  highlighted,
  value,
  onChange,
  onHover,
}: FormatSectionProps) {
  return (
    <div>
      {heading && (
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {heading}
        </h3>
      )}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const index = flatList.indexOf(item);
          const isHighlighted = index === highlighted && index >= 0;
          const isSelected = item.format === value;
          return (
            <button
              key={item.format}
              type="button"
              disabled={!item.enabled}
              title={item.reason}
              onMouseEnter={() => {
                if (index >= 0) onHover(index);
              }}
              onClick={() => item.enabled && onChange(item.format)}
              className={[
                "rounded-full border px-2.5 py-1 text-xs uppercase transition-colors",
                item.enabled
                  ? isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-elevated text-ink hover:border-accent"
                  : "cursor-not-allowed border-border bg-elevated text-muted opacity-50",
                isHighlighted && item.enabled ? "ring-2 ring-accent" : "",
              ].join(" ")}
            >
              {item.format}
            </button>
          );
        })}
      </div>
    </div>
  );
}
