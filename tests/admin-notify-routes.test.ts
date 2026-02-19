import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as bookingNotifyPost } from "@/app/api/admin/bookings/[id]/notify/route";
import { POST as bookingRequestNotifyPost } from "@/app/api/admin/booking-requests/[id]/notify/route";

describe("admin-notify-routes", () => {
  it("rejects unauthenticated booking notify requests", async () => {
    const req = new NextRequest("http://localhost/api/admin/bookings/booking_1/notify", {
      method: "POST",
      body: JSON.stringify({ action: "reminder" }),
      headers: {
        "content-type": "application/json"
      }
    });
    const res = await bookingNotifyPost(req, { params: Promise.resolve({ id: "booking_1" }) });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated booking-request notify requests", async () => {
    const req = new NextRequest("http://localhost/api/admin/booking-requests/request_1/notify", {
      method: "POST",
      body: JSON.stringify({ action: "reminder" }),
      headers: {
        "content-type": "application/json"
      }
    });
    const res = await bookingRequestNotifyPost(req, { params: Promise.resolve({ id: "request_1" }) });
    expect(res.status).toBe(401);
  });
});
