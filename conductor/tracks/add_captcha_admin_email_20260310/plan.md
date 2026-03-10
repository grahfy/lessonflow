### Implementation Plan: Add CAPTCHA to Admin Customer Email Flow

#### Phase 1: API & Client Hook Updates
- [ ] Task: Update `src/lib/admin/use-email-history.ts` to include CAPTCHA payload in the `send` method.
- [ ] Task: Update `src/app/api/admin/customers/[id]/email/route.ts` to validate CAPTCHA answer using the internal validation service.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: API & Client Hook Updates' (Protocol in workflow.md)

#### Phase 2: UI Integration
- [ ] Task: Update `CustomerEmailDialog` props to accept a `CaptchaController`.
- [ ] Task: Implement `useCaptcha` in `AdminCustomersClient` and pass the controller down through `CustomerDialogWrapper`.
- [ ] Task: Integrate `CaptchaField` into the `CustomerEmailDialog` "Send Email" section and enforce validation before sending.
- [ ] Task: Ensure the CAPTCHA refreshes on success or failure.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: UI Integration' (Protocol in workflow.md)

#### Phase 3: Testing & Verification
- [ ] Task: Write/Update integration tests to verify the API rejects requests without valid CAPTCHA.
- [ ] Task: Perform manual E2E verification of the full flow in the admin console.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Testing & Verification' (Protocol in workflow.md)
