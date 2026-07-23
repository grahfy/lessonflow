import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { GET as chordsGET } from "@/app/api/student/chords/route";
import * as chordsRouteModule from "@/app/api/student/chords/route";
import { GET as chordChartsGET } from "@/app/api/student/chord-charts/route";
import * as chordChartsRouteModule from "@/app/api/student/chord-charts/route";
import { GET as chordChartByIdGET } from "@/app/api/student/chord-charts/[id]/route";
import * as chordChartByIdRouteModule from "@/app/api/student/chord-charts/[id]/route";
import { ensureOwnerAdmin } from "@/lib/admin-auth";
import { createEmptyChordDiagram } from "@/lib/chords/chord-types";
import { customerSnapshotFromInput } from "@/lib/customer-match";
import { prisma } from "@/lib/db";
import { createStudentSessionToken, getStudentSessionCookieName } from "@/lib/student-portal/session";

describe("student-chord-api", () => {
  beforeEach(async () => {
    await prisma.chordChartItem.deleteMany();
    await prisma.chordChart.deleteMany();
    await prisma.chord.deleteMany();
    await prisma.customer.deleteMany();
  });

  async function createStudent(name: string, email: string, phone: string) {
    return prisma.customer.create({
      data: customerSnapshotFromInput({
        name,
        email,
        phone,
        lessonMode: "in_person",
        skillLevel: "beginner",
        unitNumber: undefined,
        houseNumber: "12",
        streetName: "Smith",
        streetType: "Street",
        suburb: "Northcote",
        state: "VIC",
        postcode: "3070"
      })
    });
  }

  function cookieFor(customerId: string) {
    return `${getStudentSessionCookieName()}=${createStudentSessionToken(customerId)}`;
  }

  async function createChord(overrides: { name: string; root: string; quality: string; isArchived?: boolean }) {
    const admin = await ensureOwnerAdmin();
    return prisma.chord.create({
      data: {
        name: overrides.name,
        root: overrides.root,
        quality: overrides.quality,
        diagram: createEmptyChordDiagram() as object,
        isArchived: overrides.isArchived ?? false,
        createdById: admin.id
      }
    });
  }

  async function createChart(overrides: { title: string; isArchived?: boolean; chordIds: string[] }) {
    const admin = await ensureOwnerAdmin();
    return prisma.chordChart.create({
      data: {
        title: overrides.title,
        isArchived: overrides.isArchived ?? false,
        createdById: admin.id,
        items: {
          create: overrides.chordIds.map((chordId, index) => ({ chordId, sortOrder: index }))
        }
      }
    });
  }

  function chordsRequest(cookie: string | null, search = "") {
    return new NextRequest(`http://localhost/api/student/chords${search}`, {
      headers: cookie ? { cookie } : {}
    });
  }

  function chartsRequest(cookie: string | null) {
    return new NextRequest("http://localhost/api/student/chord-charts", {
      headers: cookie ? { cookie } : {}
    });
  }

  function chartByIdRequest(cookie: string | null, id: string) {
    return new NextRequest(`http://localhost/api/student/chord-charts/${id}`, {
      headers: cookie ? { cookie } : {}
    });
  }

  it("rejects an unauthenticated request on every route (AC-1)", async () => {
    expect((await chordsGET(chordsRequest(null))).status).toBe(401);
    expect((await chordChartsGET(chartsRequest(null))).status).toBe(401);
    expect(
      (await chordChartByIdGET(chartByIdRequest(null, "missing"), { params: Promise.resolve({ id: "missing" }) })).status
    ).toBe(401);
  });

  it("excludes archived chords from the list (AC-2)", async () => {
    const student = await createStudent("Ada", "ada@example.com", "0400400001");
    const cookie = cookieFor(student.id);
    const active = await createChord({ name: "C Major", root: "C", quality: "major" });
    await createChord({ name: "Archived C", root: "C", quality: "major", isArchived: true });

    const response = await chordsGET(chordsRequest(cookie));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { chords: { id: string }[] };
    expect(payload.chords.map((c) => c.id)).toEqual([active.id]);
  });

  it("keeps an archived chord inside a live chart, unlike the chord list (AC-2 boundary)", async () => {
    const student = await createStudent("Cleo", "cleo@example.com", "0400400009");
    const cookie = cookieFor(student.id);
    const active = await createChord({ name: "G Major", root: "G", quality: "major" });
    const retired = await createChord({ name: "Retired D", root: "D", quality: "major", isArchived: true });
    const chart = await createChart({ title: "Progression", chordIds: [active.id, retired.id] });

    // Deliberate asymmetry, not an oversight: archiving means "stop offering
    // this when browsing", not "delete it". Filtering the chart would leave a
    // hole in a progression a teacher assigned and shift everything after it.
    // If this ever changes, the route comment has to change with it.
    const listPayload = (await (await chordsGET(chordsRequest(cookie))).json()) as { chords: { id: string }[] };
    expect(listPayload.chords.map((c) => c.id)).not.toContain(retired.id);

    const chartResponse = await chordChartByIdGET(chartByIdRequest(cookie, chart.id), {
      params: Promise.resolve({ id: chart.id })
    });
    expect(chartResponse.status).toBe(200);
    const chartPayload = (await chartResponse.json()) as { chart: { items: { chordId: string }[] } };
    expect(chartPayload.chart.items.map((item) => item.chordId)).toEqual([active.id, retired.id]);
  });

  it("excludes archived charts from the list and 404s the archived chart by id (AC-3)", async () => {
    const student = await createStudent("Ben", "ben@example.com", "0400400002");
    const cookie = cookieFor(student.id);
    const chord = await createChord({ name: "C Major", root: "C", quality: "major" });
    const active = await createChart({ title: "Practice Chart", chordIds: [chord.id] });
    const archived = await createChart({ title: "Old Chart", isArchived: true, chordIds: [chord.id] });

    const listResponse = await chordChartsGET(chartsRequest(cookie));
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as { charts: { id: string }[] };
    expect(listPayload.charts.map((c) => c.id)).toEqual([active.id]);

    const archivedResponse = await chordChartByIdGET(chartByIdRequest(cookie, archived.id), {
      params: Promise.resolve({ id: archived.id })
    });
    expect(archivedResponse.status).toBe(404);

    const activeResponse = await chordChartByIdGET(chartByIdRequest(cookie, active.id), {
      params: Promise.resolve({ id: active.id })
    });
    expect(activeResponse.status).toBe(200);
    const activePayload = (await activeResponse.json()) as {
      chart: { id: string; items: { chordId: string; chord: { id: string } }[] };
    };
    expect(activePayload.chart.id).toBe(active.id);
    expect(activePayload.chart.items.map((i) => i.chordId)).toEqual([chord.id]);
    expect(activePayload.chart.items.map((i) => i.chord.id)).toEqual([chord.id]);
  });

  it("combines search, root and quality filters in the database query (AC-4, AC-5)", async () => {
    const student = await createStudent("Cy", "cy@example.com", "0400400003");
    const cookie = cookieFor(student.id);
    const cMajor = await createChord({ name: "C Major", root: "C", quality: "major" });
    await createChord({ name: "C Minor", root: "C", quality: "minor" });
    await createChord({ name: "G Major", root: "G", quality: "major" });
    await createChord({ name: "Archived C", root: "C", quality: "major", isArchived: true });

    const rootQuality = await chordsGET(chordsRequest(cookie, "?root=C&quality=major"));
    const rootQualityPayload = (await rootQuality.json()) as { chords: { id: string }[]; total: number };
    expect(rootQualityPayload.chords.map((c) => c.id)).toEqual([cMajor.id]);
    expect(rootQualityPayload.total).toBe(1);

    const search = await chordsGET(chordsRequest(cookie, "?search=Minor"));
    const searchPayload = (await search.json()) as { chords: { name: string }[] };
    expect(searchPayload.chords.map((c) => c.name)).toEqual(["C Minor"]);

    const combined = await chordsGET(chordsRequest(cookie, "?search=C&root=C&quality=major"));
    const combinedPayload = (await combined.json()) as { chords: { id: string }[] };
    expect(combinedPayload.chords.map((c) => c.id)).toEqual([cMajor.id]);
  });

  it("exposes no write handler on any student chord route (AC-11)", () => {
    expect(Object.keys(chordsRouteModule).sort()).toEqual(["GET"]);
    expect(Object.keys(chordChartsRouteModule).sort()).toEqual(["GET"]);
    expect(Object.keys(chordChartByIdRouteModule).sort()).toEqual(["GET"]);
  });
});
