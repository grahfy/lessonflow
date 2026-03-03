import { RefObject, useId, useState } from "react";
import Image from "next/image";
import { formatDateTime } from "@/lib/admin/utils";
import { type LearningMaterialBooking, type LearningMaterialRow, LEARNING_MATERIAL_ACCEPT } from "@/lib/admin/types";
import { AdminCard } from "@/components/admin/ui/admin-card";
import { AdminForm, AdminField } from "@/components/admin/ui/admin-form";

type Props = {
    materialsLoading: boolean;
    materialsList: LearningMaterialRow[];
    materialsBookings: LearningMaterialBooking[];
    materialsBookingId: string;
    setMaterialsBookingId: (id: string) => void;
    materialsUploading: boolean;
    materialsDeletingId: string | null;
    materialsUploadFormRef: RefObject<HTMLFormElement | null>;
    onUpload: () => void;
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
    const [selectedFileName, setSelectedFileName] = useState("No file selected");

    return (
        <div className="dialog-tab-stack" style={{ minHeight: '650px', marginTop: "12px" }}>
            <div className="dialog-col dialog-tab-section">
                <h3 className="manual-section-title">Materials List</h3>
                <AdminCard ghost style={{ border: '1px solid var(--line)', padding: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                    {materialsLoading ? (
                        <p className="helper-text">Loading materials...</p>
                    ) : materialsList.length > 0 ? (
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {materialsList.map((m) => (
                                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', padding: '12px', borderBottom: '1px solid var(--line)', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                            <strong style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</strong>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)' }}>{m.mimeType} · {(m.sizeBytes / 1024 / 1024).toFixed(2)} MB · {formatDateTime(m.createdAt)}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => window.open(`/api/admin/learning-materials/${m.id}`, '_blank')}>VIEW</button>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                                disabled={materialsDeletingId === m.id}
                                                onClick={() => void onDelete(m.id)}
                                            >
                                                {materialsDeletingId === m.id ? '...' : 'DEL'}
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {(m.mimeType.startsWith('audio/') || m.mimeType === 'audio/mpeg') && (
                                        <audio 
                                            controls 
                                            src={`/api/admin/learning-materials/${m.id}`} 
                                            style={{ width: '100%', height: '32px', marginTop: '4px' }}
                                        />
                                    )}
                                    
                                    {m.mimeType.startsWith('image/') && (
                                        <Image
                                            src={`/api/admin/learning-materials/${m.id}`}
                                            alt={m.title}
                                            width={480}
                                            height={120}
                                            unoptimized
                                            style={{ maxWidth: '100%', maxHeight: '120px', objectFit: 'contain', borderRadius: '4px', marginTop: '4px', border: '1px solid var(--line)' }}
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
                <AdminCard ghost style={{ border: '1px solid var(--line)', padding: '12px', width: "100%" }}>
                    <form
                        ref={materialsUploadFormRef}
                        style={{ width: "100%" }}
                        onReset={() => setSelectedFileName("No file selected")}
                    >
                        <AdminForm style={{ gap: '12px', width: "100%" }}>
                            <AdminField label="Associate with booking" fullWidth>
                                <select
                                    value={materialsBookingId}
                                    style={{ width: "100%", padding: '6px 10px', fontSize: '0.85rem' }}
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
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "auto minmax(0, 1fr)",
                                        gap: "10px",
                                        alignItems: "center",
                                        width: "100%",
                                        padding: "8px 10px",
                                        border: "1px solid var(--line)",
                                        borderRadius: "8px",
                                        background: "rgba(255,255,255,0.02)"
                                    }}
                                >
                                    <label htmlFor={fileInputId} className="btn btn-secondary" style={{ margin: 0 }}>
                                        Browse...
                                    </label>
                                    <span
                                        style={{
                                            minWidth: 0,
                                            fontSize: "0.82rem",
                                            color: "var(--ink-1)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap"
                                        }}
                                        title={selectedFileName}
                                    >
                                        {selectedFileName}
                                    </span>
                                </div>
                            </AdminField>
                            <button
                                className="btn btn-primary"
                                type="button"
                                disabled={materialsUploading}
                                onClick={() => void onUpload()}
                                style={{ width: '100%', gridColumn: '1 / -1' }}
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
