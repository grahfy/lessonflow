"use client";

import { CheckCircle2, Circle, Clock } from "lucide-react";
import type { LessonSeriesState } from "@/lib/lesson-series";
import type { LessonPlanV2State } from "@/lib/lesson-plan-contract";

interface LessonSeriesDetailProps {
  series: LessonSeriesState;
  plans: LessonPlanV2State[];
}

/**
 * Timeline view of a lesson series showing each lesson plan's status
 * and a progress indicator.
 */
export function LessonSeriesDetail({
  series,
  plans,
}: LessonSeriesDetailProps) {
  const sortedPlans = [...plans].sort((a, b) => (a.seriesSequence ?? 0) - (b.seriesSequence ?? 0));
  const totalSlots = series.totalLessons;

  return (
    <div className="lesson-series-detail">
      <div className="lesson-series-detail-header">
        <h3 className="manual-section-title">{series.title}</h3>
        {series.description && (
          <p className="helper-text">{series.description}</p>
        )}
        <div className="lesson-series-detail-meta">
          <span>{series.customerName ?? "No student assigned"}</span>
          <span>{series.teacherName ?? "No teacher assigned"}</span>
          <span className="lesson-series-detail-progress">
            {series.completedLessons}/{totalSlots} lessons
          </span>
        </div>
      </div>

      <div className="lesson-series-timeline">
        {Array.from({ length: totalSlots }, (_, i) => {
          const seq = i + 1;
          const plan = sortedPlans.find((p) => p.seriesSequence === seq);

          return (
            <div
              key={seq}
              className={`lesson-series-timeline-item${plan ? ` is-${plan.status}` : ""}`}
            >
              <div className="lesson-series-timeline-marker">
                {plan?.status === "complete" ? (
                  <CheckCircle2 size={16} className="timeline-icon-complete" />
                ) : plan ? (
                  <Clock size={16} className="timeline-icon-progress" />
                ) : (
                  <Circle size={16} className="timeline-icon-empty" />
                )}
              </div>
              <div className="lesson-series-timeline-content">
                <span className="lesson-series-timeline-seq">Lesson {seq}</span>
                {plan ? (
                  <span className="lesson-series-timeline-status">
                    {plan.status === "complete" ? "Complete" : plan.status === "in_progress" ? "In Progress" : "Draft"}
                  </span>
                ) : (
                  <span className="lesson-series-timeline-status lesson-series-timeline-pending">
                    Not yet planned
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
