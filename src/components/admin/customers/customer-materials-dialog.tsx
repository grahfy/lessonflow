import { type RefObject } from "react";

import { AdminMaterialsPanel } from "@/components/admin/ui/admin-materials-panel";
import { type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";

type Props = {
  materialsLoading: boolean;
  materialsList: LearningMaterialRow[];
  materialsBookings: LearningMaterialBooking[];
  materialsBookingId: string;
  setMaterialsBookingId: (id: string) => void;
  materialsUploading: boolean;
  materialsDeletingId: string | null;
  materialsUploadFormRef: RefObject<HTMLFormElement | null>;
  onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
  onDelete: (id: string) => void;
  onBookingSelect: (bookingId: string) => void;
};

export function CustomerMaterialsDialog({
  materialsLoading,
  materialsList,
  materialsBookings,
  materialsBookingId,
  setMaterialsBookingId,
  materialsUploading,
  materialsDeletingId,
  materialsUploadFormRef,
  onUpload,
  onDelete,
  onBookingSelect
}: Props) {
  return (
    <div className="dialog-layout customer-tab-panel customer-materials-panel">
      <AdminMaterialsPanel
        materialsLoading={materialsLoading}
        materialsList={materialsList}
        materialsUploading={materialsUploading}
        materialsDeletingId={materialsDeletingId}
        uploadFormRef={materialsUploadFormRef}
        onUpload={onUpload}
        onDelete={onDelete}
        bookingField={{
          bookingId: materialsBookingId,
          bookings: materialsBookings,
          onChange: (bookingId) => {
            setMaterialsBookingId(bookingId);
            onBookingSelect(bookingId);
          }
        }}
      />
    </div>
  );
}
