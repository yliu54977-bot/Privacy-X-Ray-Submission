import { useId, useState } from "react";
import type { SharingContextV2, SharingRequirement } from "../contracts";
import type { PrivacyTaxonomyRegistry } from "../taxonomyRegistry";
import "./universal.css";

/** Presets are editable starting points, never official recipient requirements. */
export const contextPresets: readonly SharingContextV2[] = [
  {
    id: "preset-university",
    presetId: "university",
    recipient: { name: "University", kind: "education" },
    purpose: "Tuition payment verification",
    audience: "named_recipient",
    informationOwner: "self",
    requirements: [],
  },
  {
    id: "preset-support",
    presetId: "customer_support",
    recipient: { name: "Customer support", kind: "support" },
    purpose: "Order or refund inquiry",
    audience: "named_recipient",
    informationOwner: "self",
    requirements: [],
  },
  {
    id: "preset-public",
    presetId: "public_sharing",
    recipient: { name: "Public audience", kind: "public" },
    purpose: "Share a screenshot publicly",
    audience: "public",
    informationOwner: "unknown",
    requirements: [],
  },
];
export interface SharingContextFormProps {
  value: SharingContextV2;
  taxonomy: PrivacyTaxonomyRegistry;
  disabled?: boolean;
  requiresConfirmation?: boolean;
  onApply(context: SharingContextV2): void;
}
/** A must key this component by source identity; changing images discards drafts/confirmations. */
export function SharingContextForm({
  value,
  taxonomy,
  disabled = false,
  requiresConfirmation = false,
  onApply,
}: SharingContextFormProps) {
  const id = useId();
  const [draft, setDraft] = useState(value),
    [confirmed, setConfirmed] = useState(false),
    [pending, setPending] = useState(false),
    [validationError, setValidationError] = useState("");
  function update(next: SharingContextV2) {
    setDraft(next);
    setConfirmed(false);
    setPending(false);
    setValidationError("");
  }
  function requirement(index: number, patch: Partial<SharingRequirement>) {
    update({
      ...draft,
      requirements: draft.requirements.map((r, i) =>
        i === index ? { ...r, ...patch } : r,
      ),
    });
  }
  function apply() {
    onApply({
      ...draft,
      recipient: { ...draft.recipient, name: draft.recipient.name.trim() },
      purpose: draft.purpose.trim(),
      requirements: draft.requirements.map((r) => ({
        ...r,
        description: r.description.trim(),
      })),
      id: crypto.randomUUID(),
    });
    setPending(false);
    setConfirmed(false);
  }
  return (
    <section className="uv-panel" aria-label="Sharing context configuration">
      <p className="uv-eyebrow">SHARING CONTEXT</p>
      <h2>Who needs to see what?</h2>
      <p className="uv-muted">
        Describe the recipient and purpose. Text is saved as your notes; it is
        not interpreted by an AI. Use structured requirements to tell the rules
        what is needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmed || disabled) return;
          if (
            !draft.recipient.name.trim() ||
            !draft.purpose.trim() ||
            draft.requirements.some((r) => !r.description.trim())
          ) {
            setValidationError(
              "Enter a recipient, purpose and a description for each requirement.",
            );
            return;
          }
          if (requiresConfirmation) setPending(true);
          else apply();
        }}
      >
        {validationError && <p role="alert">{validationError}</p>}
        <fieldset disabled={disabled}>
          <legend className="uv-sr-only">
            Recipient and sharing requirements
          </legend>
          <label htmlFor={`${id}-preset`}>
            Start with a preset
            <select
              id={`${id}-preset`}
              value={draft.presetId ?? ""}
              onChange={(e) => {
                const preset = contextPresets.find(
                  (p) => p.presetId === e.target.value,
                );
                update(
                  preset
                    ? { ...preset, id: draft.id }
                    : { ...draft, presetId: undefined },
                );
              }}
            >
              <option value="">Custom context</option>
              {contextPresets.map((p) => (
                <option key={p.id} value={p.presetId}>
                  {p.recipient.name} / {p.purpose}
                </option>
              ))}
            </select>
          </label>
          <p className="uv-meta">
            Presets are convenient starting points, not official requirements.
          </p>
          <div className="uv-form-grid">
            <label htmlFor={`${id}-recipient`}>
              Who receives it?
              <input
                id={`${id}-recipient`}
                required
                maxLength={160}
                value={draft.recipient.name}
                onChange={(e) =>
                  update({
                    ...draft,
                    presetId: undefined,
                    recipient: { name: e.target.value },
                  })
                }
                placeholder="Recipient or organization"
              />
            </label>
            <label htmlFor={`${id}-purpose`}>
              Why are you sharing it?
              <input
                id={`${id}-purpose`}
                required
                maxLength={300}
                value={draft.purpose}
                onChange={(e) =>
                  update({
                    ...draft,
                    presetId: undefined,
                    purpose: e.target.value,
                  })
                }
                placeholder="Describe the purpose"
              />
            </label>
            <label htmlFor={`${id}-owner`}>
              Whose information is this?
              <select
                id={`${id}-owner`}
                value={draft.informationOwner}
                onChange={(e) =>
                  update({
                    ...draft,
                    informationOwner: e.target
                      .value as SharingContextV2["informationOwner"],
                  })
                }
              >
                <option value="self">My information</option>
                <option value="another_person">Another person's</option>
                <option value="organization">An organization's</option>
                <option value="mixed">Several owners</option>
                <option value="unknown">I'm not sure</option>
              </select>
            </label>
            <label htmlFor={`${id}-audience`}>
              Who can see it?
              <select
                id={`${id}-audience`}
                value={draft.audience}
                onChange={(e) =>
                  update({
                    ...draft,
                    audience: e.target.value as SharingContextV2["audience"],
                  })
                }
              >
                <option value="named_recipient">A named recipient</option>
                <option value="limited_group">A limited group</option>
                <option value="public">Anyone / public</option>
                <option value="unknown">I'm not sure</option>
              </select>
            </label>
          </div>
          <h3>What does the recipient need?</h3>
          <p className="uv-muted">
            Add only requirements you can confirm. A description alone does not
            establish which information is needed. Requirements do not guarantee
            that sharing is safe.
          </p>
          {draft.requirements.map((r, i) => (
            <fieldset className="uv-requirement" key={r.id}>
              <legend>Requirement {i + 1}</legend>
              <label>
                Description
                <input
                  required
                  maxLength={300}
                  value={r.description}
                  onChange={(e) =>
                    requirement(i, {
                      description: e.target.value,
                      confirmedByUser: false,
                    })
                  }
                />
              </label>
              <label>
                Information needed
                <select
                  value={
                    r.typeId
                      ? `type:${r.typeId}`
                      : r.categoryId
                        ? `category:${r.categoryId}`
                        : ""
                  }
                  onChange={(e) => {
                    const [kind, target] = e.target.value.split(":");
                    requirement(i, {
                      typeId: kind === "type" ? target : undefined,
                      categoryId: kind === "category" ? target : undefined,
                      confirmedByUser: false,
                    });
                  }}
                >
                  <option value="">
                    Note only — no information category selected
                  </option>
                  <optgroup label="Specific information">
                    {taxonomy.types.map((t) => (
                      <option value={`type:${t.id}`} key={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Categories">
                    {taxonomy.categories.map((c) => (
                      <option value={`category:${c.id}`} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label>
                How necessary is it?
                <select
                  value={r.importance}
                  onChange={(e) =>
                    requirement(i, {
                      importance: e.target
                        .value as SharingRequirement["importance"],
                      confirmedByUser: false,
                    })
                  }
                >
                  <option value="unknown">Not sure</option>
                  <option value="needed">Needed for this purpose</option>
                  <option value="optional">Optional</option>
                </select>
              </label>
              <label className="uv-check">
                <input
                  type="checkbox"
                  checked={r.confirmedByUser}
                  onChange={(e) =>
                    requirement(i, { confirmedByUser: e.target.checked })
                  }
                />
                I checked this requirement with the recipient or their
                instructions.
              </label>
              <button
                type="button"
                onClick={() =>
                  update({
                    ...draft,
                    requirements: draft.requirements.filter((_, n) => i !== n),
                  })
                }
              >
                Remove requirement {i + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                ...draft,
                requirements: [
                  ...draft.requirements,
                  {
                    id: crypto.randomUUID(),
                    description: "",
                    importance: "unknown",
                    confirmedByUser: false,
                  },
                ],
              })
            }
          >
            Add requirement
          </button>
          <label className="uv-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the recipient, purpose, audience, ownership and
            requirements.
          </label>
          <button className="uv-primary" type="submit" disabled={!confirmed}>
            Apply sharing context
          </button>
        </fieldset>
      </form>
      {pending && (
        <section
          className="uv-confirm"
          role="region"
          aria-label="Confirm context change"
        >
          <h3>Apply this sharing context?</h3>
          <p>
            Recommendations and linked masks may change. Manual masks should be
            preserved. Check the image again before exporting.
          </p>
          <div className="uv-actions">
            <button type="button" onClick={() => setPending(false)}>
              Cancel context change
            </button>
            <button
              className="uv-primary"
              type="button"
              disabled={disabled}
              onClick={apply}
            >
              Confirm context change
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
