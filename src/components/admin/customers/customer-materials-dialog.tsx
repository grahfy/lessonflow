import { RefObject } from "react";
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
    return (
        <div className="dialog-layout" style={{ minHeight: '550px' }}>
            <div className="dialog-col">
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
                                    
                                    {m.mimeType.startsWith('audio/') && (
                                        <audio 
                                            controls 
                                            src={`/api/admin/learning-materials/${m.id}`} 
                                            style={{ width: '100%', height: '32px', marginTop: '4px' }}
                                        />
                                    )}
                                    
                                    {m.mimeType.startsWith('image/') && (
                                        <img 
                                            src={`/api/admin/learning-materials/${m.id}`} 
                                            alt={m.title}
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

            <div className="dialog-col is-notes">
                <h3 className="manual-section-title">Upload New</h3>
                <AdminCard ghost style={{ border: '1px solid var(--line)', padding: '16px' }}>
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
                                <input type="file" name="file" accept={LEARNING_MATERIAL_ACCEPT + ",image/*"} style={{ width: '100%', padding: '8px 0', fontSize: '0.85rem' }} />
                            </AdminField>
                        </form>
                        <button
                            className="btn btn-primary"
                            type="button"
                            disabled={materialsUploading}
                            onClick={() => void onUpload()}
                            style={{ marginTop: '8px', width: '100%' }}
                        >
                            {materialsUploading ? 'Uploading...' : 'Upload Material'}
                        </button>
                    </AdminForm>
                </AdminCard>
            </div>
        </div>
    );
}
