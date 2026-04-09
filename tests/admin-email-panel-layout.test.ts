import * as React from "react";
import { createElement } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingDetailDialog } from "@/components/admin/bookings/booking-detail-dialog";
import type { BookingDialogForm } from "@/components/admin/bookings/types";
import { CustomerDialogWrapper } from "@/components/admin/customers/customer-dialog-wrapper";
import type { CustomerForm, CustomerRow } from "@/components/admin/customers/customer-profile-dialog";
import { AdminEmailPanel } from "@/components/admin/ui/admin-email-panel";
import type { EmailRecord } from "@/lib/admin/use-email-history";
import type { CustomerBookingHistoryRow } from "@/lib/admin/types";
import type { BookingEvent } from "@/lib/admin/use-bookings";

(globalThis as typeof globalThis & { React?: typeof React }).React = React;

function renderMarkup(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(TooltipPrimitive.Provider, null, node));
}

const noop = () => {};
const asyncNoop = async () => ({ success: true as const });
const rootRef = { current: null };
const emailHistory: ReadonlyArray<EmailRecord> = [
  {
    id: "email-1",
    fromEmail: "ava@example.com",
    toEmail: "teacher@example.com",
    subject: "Lesson follow-up",
    textBody: "Thanks for the lesson.",
    status: "delivered",
    createdAt: "2026-03-19T10:30:00.000Z",
    direction: "outbound"
  }
];

const customer: CustomerRow = {
  id: "cust-1",
  firstName: "Ava",
  lastName: "Student",
  fullName: "Ava Student",
  email: "ava@example.com",
  phone: "0400000000",
  skillLevel: "beginner",
  lessonMode: "in_person",
  unitNumber: null,
  houseNumber: "10",
  streetName: "Main",
  streetType: "Street",
  suburb: "Melbourne",
  state: "VIC",
  postcode: "3000",
  isArchived: false
};

const customerForm: CustomerForm = {
  firstName: "Ava",
  lastName: "Student",
  fullName: "Ava Student",
  email: "ava@example.com",
  phone: "0400000000",
  skillLevel: "beginner",
  lessonMode: "in_person",
  unitNumber: "",
  houseNumber: "10",
  streetName: "Main",
  streetType: "Street",
  suburb: "Melbourne",
  state: "VIC",
  postcode: "3000",
  primaryTeacherId: ""
};

const bookingEvent: BookingEvent = {
  id: "booking-1",
  entityType: "booking",
  startAt: "2026-03-19T10:00:00.000Z",
  endAt: "2026-03-19T11:00:00.000Z",
  status: "approved",
  customerName: "Ava Student",
  customerEmail: "ava@example.com",
  lessonMode: "in_person",
  lessonDuration: "min60",
  customDurationMinutes: null,
  isRecurring: false,
  seriesId: null,
  color: "green",
  title: "Ava Student",
  row: {}
};

const bookingDialogForm: BookingDialogForm = {
  notes: "",
  notesContent: null,
  startAtLocal: "2026-03-19T21:00",
  firstName: "Ava",
  lastName: "Student",
  email: "ava@example.com",
  phone: "0400000000",
  unitNumber: "",
  houseNumber: "10",
  streetName: "Main",
  streetType: "Street",
  suburb: "Melbourne",
  state: "VIC",
  postcode: "3000",
  lessonMode: "in_person",
  skillLevel: "beginner",
  assignedTeacherId: "",
  durationChoice: "min60",
  customDurationMinutes: ""
};

const customerBookingHistory: CustomerBookingHistoryRow[] = [
  {
    id: "booking-1",
    startAt: "2026-03-19T10:00:00.000Z",
    endAt: "2026-03-19T11:00:00.000Z",
    status: "approved",
    lessonMode: "in_person",
    lessonDuration: "min60",
    customDurationMinutes: null,
    notes: "Focused on chord transitions.",
    assignedTeacher: {
      id: "teacher-1",
      displayName: "Ava Teacher"
    }
  }
];

describe("admin-email-panel-layout", () => {
  it("renders the shared panel with a neutral shell class", () => {
    const markup = renderMarkup(
      createElement(AdminEmailPanel, {
        emptyLabel: "No emails",
        history: emailHistory,
        loadingHistory: false,
        subject: "",
        setSubject: noop,
        message: "",
        setMessage: noop,
        sending: false,
        onSend: asyncNoop,
        panelClassName: "booking-email-panel",
        captchaIdPrefix: "layout-test",
        renderHistoryHeader: () => null,
        renderHistoryMeta: () => null
      })
    );

    expect(markup).toContain("admin-email-panel-shell");
    expect(markup).not.toContain("customer-dialog-panel");
    expect(markup).toContain("admin-email-history-card");
    expect(markup).toContain("admin-email-history-list");
    expect(markup).toContain("admin-email-history-item");
    expect(markup).toContain("admin-email-history-preview");
    expect(markup).toContain("Thanks for the lesson.");
    expect(markup).not.toContain("Sync Now");
    expect(markup).not.toContain("Syncing...");
    expect(markup).not.toContain("Sync recent emails from connected providers.");
    expect(markup.indexOf("admin-email-history-list")).toBeGreaterThan(markup.indexOf("admin-email-history-card"));
    expect(markup.indexOf("admin-email-history-item")).toBeGreaterThan(markup.indexOf("admin-email-history-list"));
  });

  it("wraps customer communication in the dedicated email tab shell", () => {
    const markup = renderMarkup(
      createElement(CustomerDialogWrapper, {
        dialogRootRef: rootRef,
        selectedCustomer: customer,
        activeTab: "emails",
        setActiveTab: noop,
        error: "",
        notice: "",
        onClose: noop,
        canAccessCustomerActions: true,
        isEditing: false,
        customerForm,
        setCustomerForm: noop,
        savingCustomer: false,
        deletingCustomerId: null,
        canEditProfile: true,
        canEditAssignment: true,
        teacherOptions: [],
        canManagePortalCredentials: false,
        canViewBillingHistory: false,
        canDeleteCustomer: false,
        revealedPortalPasswords: {},
        portalCredentialBusyCustomerId: null,
        onSaveCustomer: noop,
        onCancelEdit: noop,
        onStartEdit: noop,
        onDeleteCustomer: noop,
        onViewBillingHistory: noop,
        onRevealPortalPassword: noop,
        onRegeneratePortalPassword: noop,
        onCopyPortalPassword: noop,
        bookingsLoading: false,
        bookings: customerBookingHistory,
        onOpenBooking: noop,
        loadingEmailHistory: false,
        emailHistory,
        emailHistoryWarning: null,
        emailComposerSubject: "",
        setEmailComposerSubject: noop,
        emailComposerMessage: "",
        setEmailComposerMessage: noop,
        sendingEmail: false,
        syncingEmail: false,
        onSendEmail: asyncNoop,
        onSyncEmail: noop,
        materialsLoading: false,
        materialsList: [],
        materialsBookings: [],
        materialsBookingId: "",
        setMaterialsBookingId: noop,
        materialsUploading: false,
        materialsDeletingId: null,
        materialsUploadFormRef: rootRef,
        onUploadMaterial: noop,
        onDeleteMaterial: noop,
        onMaterialBookingSelect: noop
      })
    );

    expect(markup).toContain("customer-email-tab-shell");
    expect(markup.indexOf("customer-email-tab-shell")).toBeLessThan(markup.indexOf("admin-email-panel-shell"));
    expect(markup).toContain("admin-email-panel-shell");
    expect(markup).toContain("admin-email-history-list");
    expect(markup).toContain("admin-email-history-preview");
    expect(markup).toContain("Thanks for the lesson.");
    expect(markup).not.toContain("customer-dialog-panel");
    expect(markup).not.toContain("Sync Now");
    expect(markup).not.toContain("Syncing...");
    expect(markup).not.toContain("Sync recent emails from connected providers.");
  });

  it("renders the lesson history tab with booking rows and actions", () => {
    const markup = renderMarkup(
      createElement(CustomerDialogWrapper, {
        dialogRootRef: rootRef,
        selectedCustomer: customer,
        activeTab: "history",
        setActiveTab: noop,
        error: "",
        notice: "",
        onClose: noop,
        canAccessCustomerActions: true,
        isEditing: false,
        customerForm,
        setCustomerForm: noop,
        savingCustomer: false,
        deletingCustomerId: null,
        canEditProfile: true,
        canEditAssignment: true,
        teacherOptions: [],
        canManagePortalCredentials: false,
        canViewBillingHistory: false,
        canDeleteCustomer: false,
        revealedPortalPasswords: {},
        portalCredentialBusyCustomerId: null,
        onSaveCustomer: noop,
        onCancelEdit: noop,
        onStartEdit: noop,
        onDeleteCustomer: noop,
        onViewBillingHistory: noop,
        onRevealPortalPassword: noop,
        onRegeneratePortalPassword: noop,
        onCopyPortalPassword: noop,
        bookingsLoading: false,
        bookings: customerBookingHistory,
        onOpenBooking: noop,
        loadingEmailHistory: false,
        emailHistory,
        emailHistoryWarning: null,
        emailComposerSubject: "",
        setEmailComposerSubject: noop,
        emailComposerMessage: "",
        setEmailComposerMessage: noop,
        sendingEmail: false,
        syncingEmail: false,
        onSendEmail: asyncNoop,
        onSyncEmail: noop,
        materialsLoading: false,
        materialsList: [],
        materialsBookings: [],
        materialsBookingId: "",
        setMaterialsBookingId: noop,
        materialsUploading: false,
        materialsDeletingId: null,
        materialsUploadFormRef: rootRef,
        onUploadMaterial: noop,
        onDeleteMaterial: noop,
        onMaterialBookingSelect: noop
      })
    );

    expect(markup).toContain("Lesson History");
    expect(markup).toContain("customer-booking-history-panel");
    expect(markup).toContain("customer-booking-history-item");
    expect(markup).toContain("Focused on chord transitions.");
    expect(markup).toContain("Open Booking");
  });

  it("keeps booking communication on the shared neutral shell", () => {
    const markup = renderMarkup(
      createElement(BookingDetailDialog, {
        isOpen: true,
        onClose: noop,
        rootRef,
        event: bookingEvent,
        dialogForm: bookingDialogForm,
        setDialogForm: noop,
        busyAction: null,
        onSave: noop,
        onDelete: noop,
        onMove: noop,
        canManageAppointment: true,
        canApproveRequest: false,
        canEditTeacherAssignment: true,
        canInvoice: false,
        teacherOptions: [],
        lessonDurationOptions: [],
        durationIsConfigured: true,
        activeTab: "emails",
        setActiveTab: noop,
        matchedCustomer: null,
        hasHeuristicMatch: false,
        onApplyMatchedCustomer: noop,
        onOpenMatchedCustomer: noop,
        onDismissMatchedCustomer: noop,
        emailHistory,
        emailHistoryWarning: null,
        loadingEmailHistory: false,
        sendingEmail: false,
        syncingEmail: false,
        emailSubject: "",
        setEmailSubject: noop,
        emailMessage: "",
        setEmailMessage: noop,
        onSendEmail: asyncNoop,
        onSyncEmail: noop,
        onPerformAction: noop,
        onOpenInvoice: noop,
        materialsDialogProps: {
          materialsList: [],
          materialsLoading: false,
          materialsUploading: false,
          materialsDeletingId: null,
          onUpload: noop,
          onDelete: noop,
          uploadFormRef: rootRef
        },
        lessonPlanDialogProps: {
          lessonPlan: null,
          draft: {
            sections: [{ key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible" as const, content: { type: "doc" as const, content: [] } }],
            status: "in_progress" as const,
            sourceTemplateId: null,
          },
          loading: false,
          saving: false,
          templates: [],
          templatesLoading: false,
          materials: [],
          templateSelection: "",
          onTemplateSelectionChange: noop,
          onCreateFromScratch: noop,
          onApplyTemplate: noop,
          onClearLessonPlan: noop,
          onDraftSectionsChange: noop,
          onDraftStatusChange: noop,
          onSave: noop
        }
      })
    );

    expect(markup).toContain("booking-email-panel");
    expect(markup).toContain("admin-email-panel-shell");
    expect(markup).toContain("admin-email-history-list");
    expect(markup).toContain("admin-email-history-preview");
    expect(markup).toContain("Thanks for the lesson.");
    expect(markup.indexOf("booking-email-panel")).toBeLessThan(markup.indexOf("admin-email-history-list"));
    expect(markup).not.toContain("customer-dialog-panel");
    expect(markup).not.toContain("Sync Now");
    expect(markup).not.toContain("Syncing...");
    expect(markup).not.toContain("Sync recent emails from connected providers.");
  });

  it("moves booking lesson-plan actions into the dialog footer", () => {
    const markup = renderMarkup(
      createElement(BookingDetailDialog, {
        isOpen: true,
        onClose: noop,
        rootRef,
        event: bookingEvent,
        dialogForm: bookingDialogForm,
        setDialogForm: noop,
        busyAction: null,
        onSave: noop,
        onDelete: noop,
        onMove: noop,
        canManageAppointment: true,
        canApproveRequest: false,
        canEditTeacherAssignment: true,
        canInvoice: false,
        teacherOptions: [],
        lessonDurationOptions: [],
        durationIsConfigured: true,
        activeTab: "lesson-plan",
        setActiveTab: noop,
        matchedCustomer: customer,
        hasHeuristicMatch: false,
        onApplyMatchedCustomer: noop,
        onOpenMatchedCustomer: noop,
        onDismissMatchedCustomer: noop,
        emailHistory,
        emailHistoryWarning: null,
        loadingEmailHistory: false,
        sendingEmail: false,
        syncingEmail: false,
        emailSubject: "",
        setEmailSubject: noop,
        emailMessage: "",
        setEmailMessage: noop,
        onSendEmail: asyncNoop,
        onSyncEmail: noop,
        onPerformAction: noop,
        onOpenInvoice: noop,
        materialsDialogProps: {
          materialsList: [],
          materialsLoading: false,
          materialsUploading: false,
          materialsDeletingId: null,
          onUpload: noop,
          onDelete: noop,
          uploadFormRef: rootRef
        },
        lessonPlanDialogProps: {
          lessonPlan: null,
          draft: {
            sections: [{ key: "lessonFocus", title: "Lesson Focus", visibility: "student_visible" as const, content: { type: "doc" as const, content: [] } }],
            status: "in_progress" as const,
            sourceTemplateId: null,
          },
          loading: false,
          saving: false,
          templates: [],
          templatesLoading: false,
          materials: [],
          templateSelection: "",
          onTemplateSelectionChange: noop,
          onCreateFromScratch: noop,
          onApplyTemplate: noop,
          onClearLessonPlan: noop,
          onDraftSectionsChange: noop,
          onDraftStatusChange: noop,
          onSave: noop
        }
      })
    );

    expect(markup).toContain("Back to Appointment");
    expect(markup).toContain("Clear Lesson Plan");
    expect(markup).toContain("Create Lesson Plan");
    expect(markup).toContain("Open Customer");
  });
});
