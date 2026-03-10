### Implementation Plan: Add CAPTCHA to Admin Customer Email Flow

#### Phase 1: API & Client Hook Updates [checkpoint: ff3dbf8]
- [x] Task: Update `src/lib/admin/use-email-history.ts` to include CAPTCHA payload in the `send` method. [ff3dbf8]
- [x] Task: Update `src/app/api/admin/customers/[id]/email/route.ts` to validate CAPTCHA answer using the internal validation service. [ff3dbf8]
- [x] Task: Conductor - User Manual Verification 'Phase 1: API & Client Hook Updates' (Protocol in workflow.md) [ff3dbf8]

#### Phase 2: UI Integration [checkpoint: 62437ff]
- [x] Task: Update `CustomerEmailDialog` props to accept a `CaptchaController`. [62437ff]
- [x] Task: Implement `useCaptcha` in `AdminCustomersClient` and pass the controller down through `CustomerDialogWrapper`. [62437ff]
- [x] Task: Integrate `CaptchaField` into the `CustomerEmailDialog` "Send Email" section and enforce validation before sending. [62437ff]
- [x] Task: Ensure the CAPTCHA refreshes on success or failure. [62437ff]
- [x] Task: Conductor - User Manual Verification 'Phase 2: UI Integration' (Protocol in workflow.md) [62437ff]

#### Phase 3: Testing & Verification [checkpoint: 1879f94]
- [x] Task: Write/Update integration tests to verify the API rejects requests without valid CAPTCHA. [1879f94]
- [x] Task: Perform manual E2E verification of the full flow in the admin console. [1879f94]
- [x] Task: Conductor - User Manual Verification 'Phase 3: Testing & Verification' (Protocol in workflow.md) [1879f94]
