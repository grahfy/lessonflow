import { Booking, BookingRequestStatus } from "@prisma/client";

import { sendEmail } from "@/lib/email/service";
import { customerBookingStatusTemplate } from "@/lib/email/templates";

export async function sendCustomerBookingStatusEmail(input: {
  email: string;
  name: string;
  status: BookingRequestStatus;
  when: Date;
}) {
  const template = customerBookingStatusTemplate({
    name: input.name,
    status: input.status,
    when: input.when
  });
  await sendEmail({
    to: input.email,
    subject: template.subject,
    html: template.html
  });
}

export type BookingDigestRow = Pick<Booking, "name" | "startAt" | "lessonDuration" | "lessonMode" | "status">;
