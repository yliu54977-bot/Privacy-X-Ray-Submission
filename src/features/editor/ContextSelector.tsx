import { useState } from "react";
import type { PrivacyContext } from "../../types";
import type { ContextSelectorProps } from "./contracts";
import "./editor.css";
export const CONTEXTS: readonly { label: string; value: PrivacyContext }[] = [
  {
    label: "University / Tuition Payment Verification",
    value: { recipient: "university", purpose: "tuition_payment_verification" },
  },
  {
    label: "Customer Support / Order or Refund Inquiry",
    value: {
      recipient: "customer_support",
      purpose: "order_or_refund_inquiry",
    },
  },
  {
    label: "Public Sharing / Sharing a Screenshot Publicly",
    value: {
      recipient: "public_sharing",
      purpose: "sharing_screenshot_publicly",
    },
  },
];
export function ContextSelector({
  value,
  requiresConfirmation = false,
  disabled,
  onChange,
}: ContextSelectorProps) {
  const [pending, setPending] = useState<PrivacyContext | null>(null);
  return (
    <section className="px-panel">
      <label className="px-label" htmlFor="px-context">
        Sharing context
      </label>
      <select
        id="px-context"
        disabled={disabled}
        value={value?.recipient ?? ""}
        onChange={(event) => {
          const next = CONTEXTS.find(
            (c) => c.value.recipient === event.target.value,
          )?.value;
          if (!next) return;
          if (requiresConfirmation) setPending(next);
          else onChange(next);
        }}
      >
        <option value="" disabled>
          Choose recipient and purpose
        </option>
        {CONTEXTS.map((c) => (
          <option key={c.value.recipient} value={c.value.recipient}>
            {c.label}
          </option>
        ))}
      </select>
      <p className="px-help">
        Suggestions are guidance, not official recipient requirements.
      </p>
      {pending && (
        <div
          className="px-confirm"
          role="region"
          aria-label="Change Sharing Context?"
        >
          <h3>Change Sharing Context?</h3>
          <p>
            Privacy recommendations and their linked masks will be updated for
            the new context. Your manually added masks and OCR results will be
            preserved. Previous recommendation overrides and edits to suggested
            masks will be reset.
          </p>
          <button type="button" onClick={() => setPending(null)}>
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(pending);
              setPending(null);
            }}
          >
            Change Context
          </button>
        </div>
      )}
    </section>
  );
}
