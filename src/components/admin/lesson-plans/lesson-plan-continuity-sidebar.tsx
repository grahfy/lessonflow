"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, CheckCircle2, Circle } from "lucide-react";
import { Tooltip } from "@/components/admin/ui/tooltip";
import type { LessonPlanSection, LessonPlanV2State } from "@/lib/lesson-plan-contract";
import type { HomeworkCompletionState } from "@/lib/homework-completions";

interface ContinuityPlan extends LessonPlanV2State {
  bookingStartAt?: string;
  homeworkCompletions?: HomeworkCompletionState[];
}

interface LessonPlanContinuitySidebarProps {
  previousPlans: ContinuityPlan[];
  loading: boolean;
  onCopyFromPlan: (sections: LessonPlanSection[]) => void;
}

/**
 * Collapsible sidebar showing the student's recent lesson history.
 * Each entry shows a summary of sections and homework completion status.
 * The "Copy" button clones sections from a previous plan into the
 * current draft.
 */
export function LessonPlanContinuitySidebar({
  previousPlans,
  loading,
  onCopyFromPlan,
}: LessonPlanContinuitySidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (loading) {
    return (
      <div className="continuity-sidebar">
        <div className="continuity-sidebar-header">
          <span className="continuity-sidebar-title">Previous Lessons</span>
        </div>
        <p className="helper-text">Loading history...</p>
      </div>
    );
  }

  if (previousPlans.length === 0) {
    return (
      <div className="continuity-sidebar">
        <div className="continuity-sidebar-header">
          <span className="continuity-sidebar-title">Previous Lessons</span>
        </div>
        <p className="helper-text">No previous lesson plans for this student.</p>
      </div>
    );
  }

  return (
    <div className="continuity-sidebar">
      <button
        type="button"
        className="continuity-sidebar-header"
        onClick={() => setIsOpen((o) => !o)}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="continuity-sidebar-title">
          Previous Lessons ({previousPlans.length})
        </span>
      </button>

      {isOpen && (
        <div className="continuity-sidebar-list">
          {previousPlans.map((plan) => (
            <ContinuityPlanCard
              key={plan.id}
              plan={plan}
              onCopy={() => onCopyFromPlan(plan.sections)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContinuityPlanCard({
  plan,
  onCopy,
}: {
  plan: ContinuityPlan;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const completedIds = new Set(
    (plan.homeworkCompletions ?? []).map((c) => c.checklistItemId)
  );

  // Extract homework checklist items from sections for display.
  const homeworkItems = extractChecklistItems(plan.sections);

  const dateStr = plan.bookingStartAt
    ? new Date(plan.bookingStartAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="continuity-plan-card">
      <div className="continuity-plan-card-header">
        <button
          type="button"
          className="continuity-plan-toggle"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="continuity-plan-date">{dateStr ?? "Unknown date"}</span>
          {plan.status === "complete" && (
            <span className="continuity-plan-status-badge">Complete</span>
          )}
        </button>
        <Tooltip content="Copy this lesson's sections into the current plan">
          <button
            type="button"
            className="tiptap-toolbar-btn"
            title="Copy sections"
            onClick={onCopy}
          >
            <Copy size={14} />
          </button>
        </Tooltip>
      </div>

      {expanded && (
        <div className="continuity-plan-card-body">
          {plan.sections
            .filter((s) => s.visibility === "student_visible")
            .slice(0, 4)
            .map((section) => (
              <div key={section.key} className="continuity-plan-section-preview">
                <span className="continuity-plan-section-label">{section.title}</span>
                <span className="continuity-plan-section-text">
                  {extractPlainText(section.content).slice(0, 120) || "(empty)"}
                </span>
              </div>
            ))}

          {homeworkItems.length > 0 && (
            <div className="continuity-plan-homework">
              <span className="continuity-plan-section-label">Homework</span>
              {homeworkItems.map((item) => {
                const done = completedIds.has(item.itemId);
                return (
                  <div key={item.itemId} className="continuity-plan-homework-item">
                    {done ? (
                      <CheckCircle2 size={14} className="continuity-hw-done" />
                    ) : (
                      <Circle size={14} className="continuity-hw-pending" />
                    )}
                    <span className={done ? "continuity-hw-done-text" : ""}>
                      {item.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ChecklistItem {
  itemId: string;
  text: string;
}

/**
 * Walks TipTap JSON to extract checklist (taskItem) entries.
 */
function extractChecklistItems(sections: LessonPlanSection[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  function walk(node: Record<string, unknown>) {
    if (node.type === "taskItem" && node.attrs) {
      const attrs = node.attrs as Record<string, unknown>;
      const itemId = attrs.itemId as string;
      if (itemId) {
        items.push({
          itemId,
          text: extractPlainText(node).slice(0, 100),
        });
      }
    }
    const content = node.content as Record<string, unknown>[] | undefined;
    if (content) {
      for (const child of content) {
        walk(child);
      }
    }
  }

  for (const section of sections) {
    walk(section.content as unknown as Record<string, unknown>);
  }

  return items;
}

/**
 * Extracts plain text from a TipTap JSON doc by concatenating all text nodes.
 */
function extractPlainText(node: Record<string, unknown>): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  const content = node.content as Record<string, unknown>[] | undefined;
  if (!content) return "";
  return content.map(extractPlainText).join("");
}
