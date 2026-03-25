export interface CustomerNameInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}

export interface CustomerNamePresentation {
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  sortLastName: string;
  sortFirstName: string;
}

function normalizeNameSegment(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * Normalizes split/full customer name fields into a single display/sort shape.
 *
 * RATIONALE: Older customer rows may only have `fullName`, but the customers
 * list still needs stable `Last, First` rendering and last-name sorting.
 */
export function getCustomerNamePresentation(input: CustomerNameInput): CustomerNamePresentation {
  let firstName = normalizeNameSegment(input.firstName);
  let lastName = normalizeNameSegment(input.lastName);
  const providedFullName = normalizeNameSegment(input.fullName);

  if (!firstName && !lastName && providedFullName) {
    const nameParts = providedFullName.split(/\s+/).filter(Boolean);
    firstName = nameParts[0] ?? "";
    lastName = nameParts.slice(1).join(" ");
  }

  const derivedFullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fullName = providedFullName || derivedFullName || firstName || lastName;
  const displayName = firstName && lastName ? `${lastName}, ${firstName}` : fullName;

  return {
    firstName,
    lastName,
    fullName,
    displayName,
    sortLastName: lastName || fullName,
    sortFirstName: lastName ? firstName : ""
  };
}
