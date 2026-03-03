import { RefObject } from "react";
import { formatDateTime } from "@/lib/admin/utils";
import { type LearningMaterialBooking, type LearningMaterialRow } from "@/lib/admin/types";
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
        <div className="dialog-layout">
            <div className="dialog-col">
                <h4>Materials List</h4>
                <AdminCard style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', border: '1px solid var(--line)', maxHeight: '500px', overflowY: 'auto' }}>
                    {materialsLoading ? (
                        <p className="helper-text">Loading materials...</p>
                    ) : materialsList.length > 0 ? (
                        <div style={{ display: 'grid', gap: '8px' }}>
                            {materialsList.map((m) => (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--line)', gap: '12px' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        <strong style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.filename}</strong>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)' }}>{m.contentType} · {formatDateTime(m.createdAt)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-1)' }}>{(m.sizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => window.open(`/api/admin/learning-materials/${m.id}`, '_blank')}>VIEW</button>
                                        <button
                                            className="btn btn-danger"
                                            style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                                            disabled={materialsDeletingId === m.id}
                                            onClick={() => void onDelete(m)}
                                        >
                                            {materialsDeletingId === m.id ? '...' : 'DEL'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="helper-text">No materials found for this selection.</p>
                    )}
                </AdminCard>
            </div>

            <div className="dialog-col is-notes">
                <h4>Upload New</h4>
                <AdminCard style={{ background: 'rgba(0,0,0,0.03)', padding: '16px', border: '1px solid var(--line)' }}>
                    <AdminForm>
                        <AdminField label="Associate with booking">
                            <select
                                value={materialsBookingId}
                                onChange={e => {
                                    setMaterialsBookingId(e.target.value);
                                    onBookingSelect(e.target.value);
                                }}
                            >
                                <option value="">Overall student materials (all lessons)</option>
                                {materialsBookings.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {new Date(b.startAt).toLocaleDateString('en-AU')} {new Date(b.startAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
                                    </option>
                                ))}
                            </select>
                        </AdminField>
                        <form ref={materialsUploadFormRef}>
                            <AdminField label="Select file">
                                <input type="file" name="file" className="btn btn-secondary" style={{ width: '100%', padding: '8px' }} />
                            </AdminField>
                        </form>
                        <button
                            className="btn btn-primary"
                            type="button"
                            disabled={materialsUploading}
                            onClick={() => void onUpload()}
                        >
                            {materialsUploading ? 'Uploading...' : 'Upload Material'}
                        </button>
                    </AdminForm>
                </AdminCard>
            </div>
        </div>
    );
}
