import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { cn, formatDate } from "@/lib/utils";

export interface EntryCardData {
  id: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  category: { id: string; name: string; parentId?: string | null } | null;
  sourceDocument: { id: string; url: string; title: string } | null;
  insightEvidence: Array<{ insight: { id: string; title: string } | null }>;
}

/** Category controls on a card — present in the Library, where entries can be (re)categorized. */
export interface EntryCardCategoryControls {
  categories: Array<{ id: string; name: string }>;
  /** The top-level category this entry is shown under, or null for Uncategorized. */
  currentCategoryId: string | null;
  onChange: (categoryId: string | null) => void;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  busy: boolean;
}

export function EntryCard({
  entry,
  highlighted = false,
  categoryControls,
}: {
  entry: EntryCardData;
  highlighted?: boolean;
  categoryControls?: EntryCardCategoryControls;
}) {
  const c = categoryControls;
  return (
    // `entry-<id>` is the deep-link target used by global search results (/kb/:id/library#entry-<id>).
    <Card
      id={`entry-${entry.id}`}
      tabIndex={-1}
      className={cn(
        "scroll-mt-6 outline-none transition-shadow",
        highlighted && "border-accent/50 ring-2 ring-accent/30",
        c?.selected && "border-accent/50"
      )}
    >
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {c && (
            <Checkbox
              checked={c.selected}
              onChange={(e) => c.onSelectedChange(e.target.checked)}
              aria-label={`Select “${entry.title}”`}
              className="mt-1 shrink-0"
            />
          )}
          <div>
            <div className="mb-1 flex items-center gap-2">
              {/* Category is conveyed by the section heading this card is grouped under
                  (see LibraryBrowser) — no need to repeat it on every card. */}
              <Badge variant={entry.status === "VERIFIED" ? "success" : entry.status === "OUTDATED" ? "warning" : "neutral"}>
                {entry.status}
              </Badge>
            </div>
            <CardTitle className="text-base">{entry.title}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-foreground">{entry.summary}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>Created {formatDate(entry.createdAt)}</span>
          <span>Updated {formatDate(entry.updatedAt)}</span>
          {entry.sourceDocument && (
            <a href={entry.sourceDocument.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
              Source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {entry.insightEvidence.length > 0 && (
          <p className="text-xs text-muted">
            Related insight: {entry.insightEvidence.map((e) => e.insight?.title).filter(Boolean).join(", ")}
          </p>
        )}
        {c && (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            Category
            <Select
              value={c.currentCategoryId ?? ""}
              onChange={(e) => c.onChange(e.target.value || null)}
              disabled={c.busy}
              aria-label={`Category for “${entry.title}”`}
              className="h-8 w-auto max-w-[16rem] text-xs"
            >
              <option value="">Uncategorized</option>
              {c.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </Select>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
