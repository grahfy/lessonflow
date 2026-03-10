import { RefObject, useId, useState } from "react";
import Image from "next/image";
import { formatDateTime } from "@/lib/admin/utils";
import { type LearningMaterialBooking, type LearningMaterialRow, LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";
import { useCaptcha, CaptchaField } from "@/components/captcha";

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
    const fileInputId = useId();
    const captcha = useCaptcha();
    const [selectedFileName, setSelectedFileName] = useState("No file selected");

    const handleUpload = () => {
        if (!captcha.validateAnswer()) return;
        onUpload(captcha.getPayload());
        // Refresh captcha after upload attempt
        void captcha.regenerate();
    };

    return (
        <div className="dialog-layout customer-tab-panel">
            <div className="dialog-col dialog-tab-section">
                <h3 className="manual-section-title">Materials List</h3>
                <AdminCard ghost className="customer-materials-list-card">
                    {materialsLoading ? (
                        <p className="helper-text">Loading materials...</p>
                    ) : materialsList.length > 0 ? (
                        <div className="customer-materials-list">
                            {materialsList.map((m) => (
                                <div key={m.id} className="customer-materials-item">
                                    <div className="customer-materials-item-head">
                                        <div className="customer-materials-item-copy">
                                            <strong>{m.description || m.title}</strong>
                                            <span>{m.mimeType} · {(m.sizeBytes / 1024 / 1024).toFixed(2)} MB · {formatDateTime(m.createdAt)}</span>
                                            {m.description ? <span className="helper-text">{m.title}</span> : null}
                                        </div>
                                        <div className="customer-materials-item-actions">
                                            <button className="btn btn-secondary" onClick={() => window.open(`/api/admin/learning-materials/${m.id}`, '_blank')}>View</button>
                                            <button
                                                className="btn btn-danger"
                                                disabled={materialsDeletingId === m.id}
                                                onClick={() => void onDelete(m.id)}
                                            >
                                                {materialsDeletingId === m.id ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {(m.mimeType.startsWith('audio/') || m.mimeType === 'audio/mpeg') && (
                                        <audio 
                                            controls 
                                            src={`/api/admin/learning-materials/${m.id}`} 
                                            className="customer-materials-audio"
                                        />
                                    )}
                                    
                                    {m.mimeType.startsWith('image/') && (
                                        <Image
                                            src={`/api/admin/learning-materials/${m.id}`}
                                            alt={m.title}
                                            width={480}
                                            height={120}
                                            unoptimized
                                            className="customer-materials-image"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No materials found for this selection.</p>
                    )}
                </AdminCard>
            </div>

            <div className="dialog-col dialog-tab-section">
                <h3 className="manual-section-title">Upload New</h3>
                <AdminCard ghost className="customer-materials-upload-card">
                    <form
                        ref={materialsUploadFormRef}
                        className="customer-materials-upload-form"
                        onReset={() => setSelectedFileName("No file selected")}
                    >
                        <AdminForm className="customer-materials-upload-grid">
                            <AdminField label="Associate with booking" fullWidth>
                                <select
                                    value={materialsBookingId}
                                    onChange={e => {
                                        setMaterialsBookingId(e.target.value);
                                        onBookingSelect(e.target.value);
                                    }}
                                >
                                    <option value="">Overall student (all lessons)</option>
                                    {materialsBookings.map(b => (
                                        <option key={b.id} value={b.id}>
                                            {new Date(b.startAt).toLocaleDateString('en-AU')} {new Date(b.startAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                                        </option>
                                    ))}
                                </select>
                            </AdminField>
                            <AdminField label="Select file" fullWidth>
                                <input
                                    id={fileInputId}
                                    type="file"
                                    name="file"
                                    accept={LEARNING_MATERIAL_ACCEPT + ",image/*"}
                                    style={{
                                        position: "absolute",
                                        width: "1px",
                                        height: "1px",
                                        padding: 0,
                                        margin: "-1px",
                                        overflow: "hidden",
                                        clip: "rect(0, 0, 0, 0)",
                                        border: 0
                                    }}
                                    onChange={(event) => {
                                        const file = event.currentTarget.files?.[0];
                                        setSelectedFileName(file?.name || "No file selected");
                                    }}
                                />
                                <div className="customer-materials-file-picker">
                                    <label htmlFor={fileInputId} className="btn btn-secondary">
                                        Browse
                                    </label>
                                    <span className="customer-materials-file-name" title={selectedFileName}>
                                        {selectedFileName}
                                    </span>
                                </div>
                            </AdminField>
                            <AdminField label="Description (optional)" fullWidth>
                                <textarea
                                    name="description"
                                    rows={2}
                                    maxLength={500}
                                    placeholder="E.g. Practice this fingerpicking pattern at 80 BPM"
                                />
                            </AdminField>
                            <CaptchaField idPrefix="material-upload" captcha={captcha} />
                            <button
                                type="button"
                                disabled={materialsUploading}
                                onClick={handleUpload}
                                className="btn btn-primary customer-materials-upload-btn"
                            >
                                {materialsUploading ? 'Uploading...' : 'Upload Material'}
                            </button>
                        </AdminForm>
                    </form>
                </AdminCard>
            </div>
        </div>
    );
}
