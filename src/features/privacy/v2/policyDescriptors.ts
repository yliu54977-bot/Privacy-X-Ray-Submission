import type { DetectionFamily } from '../../../v2/contracts';

/** Trusted, developer-authored semantics. Never derive these from names or prose. */
export type PolicyClass =
  | 'access_secret' | 'personal_identifier' | 'high_impact'
  | 'private_content' | 'transaction' | 'opaque_content' | 'relationship';

export interface PolicyDescriptor {
  readonly typeId: string;
  readonly categoryIds: readonly string[];
  readonly classes: readonly PolicyClass[];
  readonly evidenceMethods: readonly DetectionFamily[];
}

export const POLICY_VERSION = '2.0.0-p0.1';

/** Category principles are machine-readable and independent of sharing presets. */
export const POLICY_CLASSES = Object.freeze({
  access_secret: 'Disclosure could grant unauthorized access.',
  personal_identifier: 'Disclosure could identify, contact, or locate someone.',
  high_impact: 'Disclosure could expose consequential personal or financial information.',
  private_content: 'Disclosure could expose private personal or organizational content.',
  transaction: 'Disclosure could link someone to a payment or purchase.',
  opaque_content: 'The encoded content has not been established by this policy.',
  relationship: 'A relationship conclusion needs structured supporting evidence.',
} satisfies Record<PolicyClass, string>);

const descriptor = (
  typeId: string, categoryIds: string[], classes: PolicyClass[],
  evidenceMethods: DetectionFamily[] = ['label_context'],
): PolicyDescriptor => Object.freeze({ typeId, categoryIds: Object.freeze(categoryIds),
  classes: Object.freeze(classes), evidenceMethods: Object.freeze(evidenceMethods) });

/** Explicit mapping of A knowledge-base IDs at 2c05bd4; not a claim of detector support. */
export const POLICY_DESCRIPTORS: readonly PolicyDescriptor[] = Object.freeze([
  descriptor('person_name', ['personal_identity'], ['personal_identifier']),
  descriptor('date_of_birth', ['personal_identity'], ['personal_identifier', 'high_impact']),
  descriptor('organization_name', ['organizational'], ['private_content']),
  descriptor('government_id_number', ['government_identification'], ['high_impact', 'personal_identifier']),
  descriptor('email', ['contact_information', 'internet_identities'], ['personal_identifier'], ['pattern', 'visual_object']),
  descriptor('phone', ['contact_information'], ['personal_identifier'], ['label_context', 'visual_object']),
  descriptor('home_address', ['contact_information', 'geographic_locations'], ['personal_identifier', 'high_impact']),
  descriptor('shipping_address', ['contact_information', 'geographic_locations'], ['personal_identifier', 'high_impact']),
  descriptor('billing_address', ['contact_information', 'geographic_locations'], ['personal_identifier', 'high_impact']),
  descriptor('precise_location', ['geographic_locations'], ['personal_identifier', 'high_impact'], ['pattern', 'metadata']),
  descriptor('travel_itinerary', ['movement_travel'], ['high_impact']),
  descriptor('family_relationship', ['family_relationships', 'relational_inferences'], ['relationship'], ['label_context', 'relationship']),
  descriptor('face_image', ['biometrics', 'visual_environmental'], ['personal_identifier'], ['visual_object']),
  descriptor('medical_diagnosis', ['health_medical'], ['high_impact'], ['nlp_entity', 'label_context']),
  descriptor('bank_account_number', ['financial_information'], ['high_impact']),
  descriptor('payment_amount', ['transactions_purchases', 'financial_information'], ['transaction']),
  descriptor('order_number', ['transactions_purchases'], ['transaction']),
  descriptor('transaction_reference', ['transactions_purchases'], ['transaction']),
  descriptor('booking_reference', ['movement_travel'], ['personal_identifier', 'high_impact']),
  descriptor('asset_record', ['personal_assets'], ['high_impact']),
  descriptor('student_id', ['education_records', 'personal_identity'], ['personal_identifier']),
  descriptor('employment_record', ['employment_information'], ['private_content']),
  descriptor('legal_case_number', ['legal_information'], ['high_impact']),
  descriptor('insurance_policy_number', ['insurance_benefits'], ['high_impact']),
  descriptor('behavioral_history', ['behavioral_information'], ['relationship'], ['relationship']),
  descriptor('sensitive_attribute', ['sensitive_attributes'], ['high_impact'], ['nlp_entity']),
  descriptor('child_identity', ['children_information', 'personal_identity'], ['high_impact'], ['nlp_entity', 'label_context']),
  descriptor('username', ['internet_identities'], ['personal_identifier']),
  descriptor('password', ['authentication_credentials', 'internet_identities'], ['access_secret']),
  descriptor('api_key', ['authentication_credentials', 'technical_infrastructure'], ['access_secret'], ['label_context', 'visual_object']),
  descriptor('device_identifier', ['device_network_identifiers'], ['personal_identifier'], ['pattern', 'label_context']),
  descriptor('private_message', ['communications'], ['private_content'], ['document_structure', 'nlp_entity']),
  descriptor('crypto_wallet_address', ['digital_assets', 'financial_information'], ['high_impact'], ['pattern']),
  descriptor('business_plan', ['commercial_confidential'], ['private_content'], ['document_structure', 'nlp_entity']),
  descriptor('corporate_revenue', ['corporate_financial'], ['private_content']),
  descriptor('server_address', ['technical_infrastructure', 'device_network_identifiers'], ['private_content'], ['pattern', 'label_context']),
  descriptor('source_code', ['intellectual_property', 'technical_infrastructure'], ['private_content'], ['document_structure']),
  descriptor('research_participant_id', ['research_information', 'personal_identity'], ['high_impact']),
  descriptor('contract_terms', ['contracts_records'], ['private_content'], ['document_structure']),
  descriptor('background_location', ['visual_environmental', 'geographic_locations'], ['high_impact'], ['visual_object']),
  descriptor('qr_code', ['machine_readable_metadata'], ['opaque_content'], ['visual_object']),
  descriptor('gps_metadata', ['machine_readable_metadata', 'geographic_locations'], ['high_impact'], ['metadata']),
  descriptor('inferred_relationship', ['relational_inferences', 'family_relationships'], ['relationship'], ['relationship']),
]);
