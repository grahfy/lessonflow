"use client";

import { BookOpen, CheckCircle2, Archive } from "lucide-react";
import type { LessonSeriesState } from "@/lib/lesson-series";

interface LessonSeriesListProps {
  series: LessonSeriesState[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const STATUS_ICONS = {
  active: BookOpen,
  completed: CheckCircle2,
  archived: Archive,
};

/**
 * Sidebar list of lesson series with status indicators and progress bars.
 */
export function LessonSeriesList({
  series,
  selectedId,
  onSelect,
}: LessonSeriesListProps) {
  if (series.length === 0) {
    return <p className="helper-text">No lesson series found.</p>;
  }

  return (
    <div className="lesson-series-list" role="list">
      {series.map((s) => {
        const Icon = STATUS_ICONS[s.status as keyof typeof STATUS_ICONS] ?? BookOpen;
        const progress = s.totalLessons > 0
          ? Math.round((s.completedLessons / s.totalLessons) * 100)
          : 0;

        return (
          <button
            key={s.id}
            type="button"
            className={`lesson-series-list-item${s.id === selectedId ? " is-active" : ""}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="lesson-series-list-item-header">
              <Icon size={14} />
              <span className="lesson-series-list-item-title">{s.title}</span>
            </div>
            <span className="helper-text">
              {s.customerName ?? "Unassigned"} · {s.completedLessons}/{s.totalLessons} lessons
            </span>
            <div className="lesson-series-progress-bar">
              <div
                className="lesson-series-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
