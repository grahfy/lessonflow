import Link from "next/link";

import { PanelLayout } from "@/components/panel-layout";

export default function TeacherPage() {
  return (
    <PanelLayout
      kicker="Your Teacher"
      title="Learn with Jon, an experienced guitarist and mentor."
      lead="Jon has over 30 years of guitar experience, a music production background, and a long teaching history with students of different ages and levels."
      visualLabel="Teacher playing guitar"
      visualClassName="teacher-hero"
      footerCopy="Clear instruction. Real-world musical outcomes."
      leadJustified
    >
      <ul className="list">
        <li>Local endorsement history with Ernie Ball Musicman Guitars Australia.</li>
        <li>Touring experience across Europe and live performance with major acts.</li>
        <li>Focus on practical progress, musical confidence, and long-term technique.</li>
      </ul>

      <div className="button-row">
        <Link className="btn btn-primary" href="/book">
          Work With Jon
        </Link>
        <Link className="btn btn-secondary" href="/lessons">
          See Learning Paths
        </Link>
      </div>
    </PanelLayout>
  );
}
