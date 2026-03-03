import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { type CustomerRow } from "./customer-profile-dialog";

interface Props {
    customers: CustomerRow[];
    loadingCustomers: boolean;
    deletingCustomerId: string | null;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    onSetPage: (page: number) => void;
    onSetPageSize: (size: number) => void;
    onOpenCustomerDialog: (customer: CustomerRow, edit: boolean) => void;
    onDeleteCustomer: (customer: CustomerRow) => void;
    onViewInvoices: (name: string) => void;
}

export function CustomerTable({
    customers,
    loadingCustomers,
    deletingCustomerId,
    page,
    pageSize,
    totalCount,
    totalPages,
    onSetPage,
    onSetPageSize,
    onOpenCustomerDialog,
    onDeleteCustomer,
    onViewInvoices
}: Props) {
    const header = customers.length ? (
        <>
            <div style={{ flex: '1', minWidth: '180px', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Customer / Email</div>
            <Separator />
            <div style={{ width: '110px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Phone</div>
            <Separator />
            <div style={{ width: '120px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Skill / Mode</div>
            <Separator />
            <div style={{ flex: '0.8', minWidth: '150px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Portal Status</div>
            <Separator />
            <div style={{ width: '240px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-2)', textTransform: 'uppercase', fontWeight: 600 }}>Actions</div>
        </>
    ) : null;

    return (
        <AdminTable
            header={header}
            loading={loadingCustomers}
            emptyLabel="No customers found."
            pagination={{
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                pageSize: pageSize,
                onPageChange: onSetPage,
                onPageSizeChange: onSetPageSize,
                pageSizeOptions: [25, 50, 100, 250]
            }}
        >
            {customers.map((customer) => (
                <div
                    key={customer.id}
                    className="customer-item"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        gap: '12px',
                        cursor: 'pointer',
                        width: '100%',
                        borderRadius: 0,
                        border: 'none',
                        borderBottom: '1px solid var(--line)',
                        background: 'rgba(8, 11, 28, 0.84)'
                    }}
                    onClick={() => onOpenCustomerDialog(customer, false)}
                >
                    <div style={{ flex: '1', minWidth: '180px', display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: '0.95rem' }}>{customer.lastName ? `${customer.lastName}, ${customer.firstName}` : customer.fullName}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ink-1)' }}>{customer.email}</span>
                    </div>

                    <Separator />
                    <div style={{ width: '110px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem' }}>{customer.phone}</span>
                    </div>

                    <Separator />
                    <div style={{ width: '120px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>{customer.skillLevel}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-1)' }}>{customer.lessonMode === "in_person" ? "In-person" : "Video"}</span>
                    </div>

                    <Separator />
                    <div style={{ flex: '0.8', minWidth: '150px', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem' }}>
                            {customer.portalCredential ? `Active (since ${new Date(customer.portalCredential.generatedAt).toLocaleDateString("en-AU")})` : "Not generated"}
                        </span>
                    </div>

                    <Separator />
                    <div className="customer-item-actions" style={{ width: '240px', display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={e => e.stopPropagation()}>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                            type="button"
                            onClick={() => onViewInvoices(customer.fullName)}
                        >
                            Invoices
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                            type="button"
                            onClick={() => onOpenCustomerDialog(customer, true)}
                        >
                            Edit
                        </button>
                        <button
                            className="btn btn-danger"
                            style={{ padding: '6px 10px', fontSize: '0.7rem', minWidth: '0', flex: '1' }}
                            type="button"
                            disabled={deletingCustomerId === customer.id}
                            onClick={() => onDeleteCustomer(customer)}
                        >
                            {deletingCustomerId === customer.id ? "..." : "Delete"}
                        </button>
                    </div>
                </div>
            ))}
        </AdminTable>
    );
}
