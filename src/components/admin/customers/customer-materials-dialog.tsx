import { RefObject } from "react";
import { formatBytes, formatDateTime } from "@/lib/admin/utils";

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
    onUpload: () => void;
    onDelete: (material: LearningMaterialRow) => void;
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
        <>
            <div className="dialog-col">
                <h4>Assigned Materials</h4>
                <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', border: '1px solid var(--line)', maxHeight: '500px', overflowY: 'auto' }}>
                    {materialsLoading ? (
                        <p className="helper-text">Loading materials...</p>
                    ) : materialsList.length > 0 ? (
                        <div className="materials-grid">
                            {materialsList.map(m => (
                                <div key={m.id} className="material-card">
                                    <div className="material-card-info">
                                        <strong>{m.title}</strong>
                                        <p className="helper-text">
                                            {m.materialType.toUpperCase()} · {formatBytes(m.sizeBytes)} · {new Date(m.createdAt).toLocaleDateString("en-AU")}
                                        </p>
                                        {m.materialType === "audio" && m.previewUrl && (
                                            <div style={{ marginTop: '8px' }}>
                                                <audio className="material-audio-player" controls preload="metadata" src={m.previewUrl} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="material-card-actions">
                                        {m.materialType === "pdf" && m.previewUrl && (
                                            <a
                                                className="btn btn-secondary btn-compact"
                                                href={m.previewUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                PREVIEW
                                            </a>
                                        )}
                                        <button
                                            className="btn btn-danger btn-compact"
                                            disabled={materialsDeletingId === m.id}
                                            onClick={() => onDelete(m)}
                                        >
                                            {materialsDeletingId === m.id ? "..." : "DELETE"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No materials uploaded for the current selection.</p>
                    )}
                </div>
            </div>

            <div className="dialog-col is-notes">
                <h4>Upload New Material</h4>
                <div className="admin-card" style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                    <div className="field" style={{ marginBottom: '16px' }}>
                        <label>Select appointment (optional)</label>
                        <select
                            value={materialsBookingId}
                            onChange={e => {
                                const bid = e.target.value;
                                setMaterialsBookingId(bid);
                                onBookingSelect(bid);
                            }}
                        >
                            <option value="">Whole student profile</option>
                            {materialsBookings.map(b => (
                                <option key={b.id} value={b.id}>
                                    {formatDateTime(b.startAt)} ({b.status})
                                </option>
                            ))}
                        </select>
                    </div>

                    <form
                        ref={materialsUploadFormRef}
                        className="material-upload-form"
                        onSubmit={e => { e.preventDefault(); onUpload(); }}
                    >
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div className="field">
                                <label>Material title</label>
                                <input name="title" required placeholder="e.g. Pentatonic exercise week 1" />
                            </div>
                            <div className="field">
                                <label>File</label>
                                <input type="file" name="file" accept=".pdf,audio/*" required />
                            </div>
                            <button
                                className="btn btn-primary"
                                type="submit"
                                disabled={materialsUploading}
                            >
                                {materialsUploading ? "UPLOADING..." : "UPLOAD MATERIAL"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
