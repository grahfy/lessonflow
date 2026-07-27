import { type RefObject } from "react";

import {
  AdminMaterialsPanel,
  type MaterialsFolderActions,
  type MaterialsFolderField
} from "@/components/admin/ui/admin-materials-panel";
import { type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";
import { BookingLibraryMaterialsPanel } from "./booking-library-materials-panel";

type Props = {
  materialsLoading: boolean;
  materialsList: LearningMaterialRow[];
  materialsUploading: boolean;
  materialsDeletingId: string | null;
  uploadFormRef: RefObject<HTMLFormElement | null>;
  onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
  onDelete: (id: string) => void;
  bookingLibraryAttaching?: boolean;
  onAttachLibrary?: (libraryItemIds: string[]) => Promise<boolean>;
  onUnlinkLibrary?: (libraryItemId: string) => Promise<boolean>;
  onLibraryError?: (message: string) => void;
  bookingLibraryBookingId?: string;
  bookingField?: {
    bookingId: string;
    bookings: LearningMaterialBooking[];
    onChange: (bookingId: string) => void;
  };
  folderField?: MaterialsFolderField;
  folderActions?: MaterialsFolderActions;
};

export function BookingMaterialsDialog({
  materialsLoading,
  materialsList,
  materialsUploading,
  materialsDeletingId,
  uploadFormRef,
  onUpload,
  onDelete,
  bookingLibraryAttaching,
  onAttachLibrary,
  onUnlinkLibrary,
  onLibraryError,
  bookingLibraryBookingId,
  bookingField,
  folderField,
  folderActions
}: Props) {
  return (
    <div className="dialog-layout customer-tab-panel booking-materials-panel">
      <AdminMaterialsPanel
        materialsLoading={materialsLoading}
        materialsList={materialsList.filter((material) => material.source !== "library_booking")}
        materialsUploading={materialsUploading}
        materialsDeletingId={materialsDeletingId}
        uploadFormRef={uploadFormRef}
        onUpload={onUpload}
        onDelete={onDelete}
        bookingField={bookingField}
        folderField={folderField}
        folderActions={folderActions}
      />
      {bookingLibraryBookingId && onAttachLibrary && onUnlinkLibrary ? (
        <BookingLibraryMaterialsPanel
          bookingId={bookingLibraryBookingId}
          materials={materialsList}
          attaching={bookingLibraryAttaching ?? false}
          onAttach={onAttachLibrary}
          onUnlink={onUnlinkLibrary}
          onError={onLibraryError ?? (() => undefined)}
        />
      ) : null}
    </div>
  );
}
