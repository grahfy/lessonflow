import { type RefObject } from "react";

import { AdminMaterialsPanel } from "@/components/admin/ui/admin-materials-panel";
import { type LearningMaterialRow } from "@/lib/admin/types";

type Props = {
  materialsLoading: boolean;
  materialsList: LearningMaterialRow[];
  materialsUploading: boolean;
  materialsDeletingId: string | null;
  uploadFormRef: RefObject<HTMLFormElement | null>;
  onUpload: (captcha?: { captchaToken: string; captchaAnswer: string }) => void;
  onDelete: (id: string) => void;
};

export function BookingMaterialsDialog({
  materialsLoading,
  materialsList,
  materialsUploading,
  materialsDeletingId,
  uploadFormRef,
  onUpload,
  onDelete
}: Props) {
  return (
    <AdminMaterialsPanel
      materialsLoading={materialsLoading}
      materialsList={materialsList}
      materialsUploading={materialsUploading}
      materialsDeletingId={materialsDeletingId}
      uploadFormRef={uploadFormRef}
      onUpload={onUpload}
      onDelete={onDelete}
    />
  );
}
