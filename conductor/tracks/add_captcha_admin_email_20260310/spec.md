### Specification: Add CAPTCHA to Admin Customer Email Flow

#### Overview
Integrate the project's built-in image-based CAPTCHA system into the customer email-sending workflow within the Admin Console. This provides an additional layer of security against automated misuse of the email-sending feature.

#### Functional Requirements
1.  **CAPTCHA Gating:** The "Send Email" action in the Customer Detail dialog (Communication tab) must be gated by a CAPTCHA challenge.
2.  **Built-in Implementation:** Reuse the existing `CaptchaField` component and `useCaptcha` hook found in `src/components/captcha.tsx`.
3.  **Client-Side Validation:** Validate that the CAPTCHA has been answered before initiating the API call.
4.  **Server-Side Validation:** The API route `/api/admin/customers/[id]/email` must validate the CAPTCHA token and answer before sending the email.
5.  **Failure Handling:** If CAPTCHA validation fails (either client-side or server-side), display an appropriate error message and regenerate the CAPTCHA challenge.
6.  **Scope:** Apply to all users using the admin customer email feature.

#### Technical Details
- **UI Update:** Add `CaptchaField` to `src/components/admin/customers/customer-email-dialog.tsx`.
- **Client Logic:** Update `src/lib/admin/use-email-history.ts` to pass CAPTCHA payload.
- **API Security:** Update `src/app/api/admin/customers/[id]/email/route.ts` to verify CAPTCHA.

#### Acceptance Criteria
- [ ] A CAPTCHA challenge appears in the "Send Email" section of the customer dialog.
- [ ] The "Send Email" button prevents submission if the CAPTCHA is not completed.
- [ ] Incorrect CAPTCHA answers block email sending and show a clear error message.
- [ ] CAPTCHA refreshes automatically after each attempt.

#### Out of Scope
- Adding CAPTCHA to other admin email triggers (e.g., Reports) for now.
- Switching to external providers like Cloudflare Turnstile.
