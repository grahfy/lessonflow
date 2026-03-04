import { AdminTable, AdminTableSeparator as Separator } from "@/components/admin/ui/admin-table";
import { Tooltip } from "@/components/admin/ui/tooltip";
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
            <div className="admin-list-col admin-list-col-identity">Customer / Email</div>
            <Separator />
            <div className="admin-list-col admin-list-col-phone">Phone</div>
            <Separator />
            <div className="admin-list-col admin-list-col-skill">Skill / Mode</div>
            <Separator />
            <div className="admin-list-col admin-list-col-portal">Portal Status</div>
            <Separator />
            <div className="admin-list-col admin-list-col-actions">Actions</div>
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
                    className="customer-item invoice-row-item customer-table-row"
                    onClick={() => onOpenCustomerDialog(customer, false)}
                >
                    <div className="customer-col-identity admin-list-cell admin-list-col-identity">
                        <span className="admin-mobile-label">Customer</span>
                        <strong>{customer.lastName ? `${customer.lastName}, ${customer.firstName}` : customer.fullName}</strong>
                        <span className="admin-list-subtext">{customer.email}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-phone admin-list-cell admin-list-col-phone">
                        <span className="admin-mobile-label">Phone</span>
                        <span>{customer.phone}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-skill admin-list-cell admin-list-col-skill">
                        <span className="admin-mobile-label">Skill / Mode</span>
                        <span className="admin-list-capitalize">{customer.skillLevel}</span>
                        <span className="admin-list-subtext">{customer.lessonMode === "in_person" ? "In-person" : "Video"}</span>
                    </div>

                    <Separator />
                    <div className="customer-col-portal admin-list-cell admin-list-col-portal">
                        <span className="admin-mobile-label">Portal Status</span>
                        <span>
                            {customer.portalCredential ? `Active (since ${new Date(customer.portalCredential.generatedAt).toLocaleDateString("en-AU")})` : "Not generated"}
                        </span>
                    </div>

                    <Separator />
                    <div className="customer-item-actions admin-list-actions admin-list-col-actions" onClick={e => e.stopPropagation()}>
                        <span className="admin-mobile-label">Actions</span>
                        <Tooltip content="Open this customer's invoice history and billing records.">
                            <button
                                className="btn btn-secondary admin-list-action-btn"
                                type="button"
                                onClick={() => onViewInvoices(customer.fullName)}
                            >
                                Invoices
                            </button>
                        </Tooltip>
                        <Tooltip content="Edit this customer's profile, contact details, and portal access.">
                            <button
                                className="btn btn-secondary admin-list-action-btn"
                                type="button"
                                onClick={() => onOpenCustomerDialog(customer, true)}
                            >
                                Edit
                            </button>
                        </Tooltip>
                        <Tooltip content="Archive or remove this customer record.">
                            <button
                                className="btn btn-danger admin-list-action-btn"
                                type="button"
                                disabled={deletingCustomerId === customer.id}
                                onClick={() => onDeleteCustomer(customer)}
                            >
                                {deletingCustomerId === customer.id ? "..." : "Delete"}
                            </button>
                        </Tooltip>
                    </div>
                </div>
            ))}
        </AdminTable>
    );
}
