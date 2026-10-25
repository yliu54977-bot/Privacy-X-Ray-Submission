import { PRIVACY_KNOWLEDGE_VERSION } from './contracts';
import type { DetectionFamily, PrivacyCategory, PrivacyTypeDefinition } from './contracts';
import { createTaxonomyRegistry } from './taxonomyRegistry';

const category = (id: string, name: string, parentIds: string[], description: string): PrivacyCategory =>
  ({ id, name, parentIds, description });

/** Starting families; IDs remain stable as the registry grows. This is not an exhaustive universe. */
export const privacyCategories: readonly PrivacyCategory[] = [
  category('personal', 'Personal information', [], 'Information about a person or their life.'),
  category('organizational', 'Organizational information', [], 'Information owned or controlled by an organization.'),
  category('digital', 'Digital information', [], 'Identifiers, access, or content in digital systems.'),
  category('inferred', 'Inferred information', [], 'Relationships or facts derived from combining evidence.'),
  category('personal_identity', 'Personal identity', ['personal'], 'Names and identity attributes.'),
  category('government_identification', 'Government identification', ['personal_identity'], 'Identifiers issued by public authorities.'),
  category('contact_information', 'Contact information', ['personal'], 'Ways to contact or reach someone.'),
  category('geographic_locations', 'Geographic locations', ['personal'], 'Addresses and precise locations.'),
  category('movement_travel', 'Movement and travel', ['geographic_locations'], 'Trips and movement history.'),
  category('family_relationships', 'Family and relationships', ['personal'], 'Family members and personal connections.'),
  category('biometrics', 'Biometric information', ['personal'], 'Body or behavior that can identify a person.'),
  category('health_medical', 'Health and medical', ['personal'], 'Health conditions and care records.'),
  category('financial_information', 'Financial information', ['personal'], 'Accounts, balances, and finances.'),
  category('transactions_purchases', 'Transactions and purchases', ['financial_information'], 'Payments, orders, and purchases.'),
  category('personal_assets', 'Personal assets', ['financial_information'], 'Property and assets owned by a person.'),
  category('education_records', 'Education and academic records', ['personal'], 'School identities and academic records.'),
  category('employment_information', 'Employment information', ['personal'], 'Work identities and employment details.'),
  category('legal_information', 'Legal information', ['personal'], 'Legal proceedings and claims.'),
  category('insurance_benefits', 'Insurance and benefits', ['personal'], 'Coverage and benefits records.'),
  category('behavioral_information', 'Behavioral information', ['personal', 'digital'], 'Activities and habits over time.'),
  category('sensitive_attributes', 'Sensitive personal attributes', ['personal'], 'Attributes that may expose a person to discrimination or harm.'),
  category('children_information', "Children's information", ['personal'], 'Information about minors.'),
  category('internet_identities', 'Internet identities', ['digital', 'personal_identity'], 'Accounts and handles on online services.'),
  category('authentication_credentials', 'Authentication credentials', ['digital'], 'Information that can grant access.'),
  category('device_network_identifiers', 'Device and network identifiers', ['digital'], 'Identifiers for devices and network endpoints.'),
  category('communications', 'Communications', ['personal', 'digital'], 'Private messages and correspondence.'),
  category('digital_assets', 'Digital assets', ['digital', 'financial_information'], 'Digital property and wallets.'),
  category('commercial_confidential', 'Commercial confidential information', ['organizational'], 'Private business plans and operations.'),
  category('corporate_financial', 'Corporate financial information', ['organizational'], 'Private business financial figures.'),
  category('technical_infrastructure', 'Technical infrastructure', ['organizational', 'digital'], 'Systems, endpoints, and access infrastructure.'),
  category('intellectual_property', 'Intellectual property', ['organizational'], 'Creative and technical work product.'),
  category('research_information', 'Research information', ['organizational'], 'Research data and participant information.'),
  category('contracts_records', 'Contracts and organizational records', ['organizational'], 'Private agreements and records.'),
  category('visual_environmental', 'Visual and environmental information', ['personal'], 'Sensitive content visible in images or surroundings.'),
  category('machine_readable_metadata', 'Machine-readable codes and metadata', ['digital'], 'Encoded data and hidden file attributes.'),
  category('relational_inferences', 'Relational and inferred information', ['inferred', 'personal'], 'Sensitive conclusions from combined data.'),
];

type TypeSeed = {
  id: string; name: string; categories: string[]; description: string;
  evidence: string; consequence: string; methods?: DetectionFamily[];
  verified?: boolean; aliases?: string[]; related?: string[];
  ownership?: string; sensitivity?: string;
};

function define(seed: TypeSeed): PrivacyTypeDefinition {
  return {
    id: seed.id, name: seed.name, categoryIds: seed.categories,
    description: seed.description, aliases: seed.aliases ?? [],
    detectionMethods: seed.methods ?? ['label_context'],
    implementationStatus: seed.verified ? 'implemented' : 'not_implemented',
    validationStatus: seed.verified ? 'verified' : 'unverified',
    contextualSensitivity: seed.sensitivity ?? 'Whether this is needed depends on the recipient, purpose, and audience.',
    disclosureConsequences: [seed.consequence],
    ownershipConsiderations: seed.ownership ?? 'May belong to the user or another person; check before sharing.',
    relatedTypeIds: seed.related ?? [], evidenceRequirements: [seed.evidence],
    provenance: { source: 'Privacy X-Ray local knowledge base', version: PRIVACY_KNOWLEDGE_VERSION },
  };
}

/** Only types backed by working tests are marked verified. Other records are definitions, not detectors. */
export const privacyTypes: readonly PrivacyTypeDefinition[] = [
  define({ id: 'person_name', name: 'Person name', categories: ['personal_identity'], description: 'A name identifying a person.', evidence: 'Explicit person-name label and plausible name.', consequence: 'Could identify a person.', verified: true }),
  define({ id: 'date_of_birth', name: 'Date of birth', categories: ['personal_identity'], description: 'A labeled birth date.', evidence: 'Explicit birth-date label and valid calendar date.', consequence: 'Could expose an identity detail.', verified: true }),
  define({ id: 'organization_name', name: 'Organization name', categories: ['organizational'], description: 'A named institution or organization.', evidence: 'Explicit organization label and readable name.', consequence: 'Could identify an institution involved in the screenshot.', verified: true }),
  define({ id: 'government_id_number', name: 'Government ID number', categories: ['government_identification'], description: 'An identifier issued by a government.', evidence: 'Explicit issuing authority and validated identifier format.', consequence: 'Could enable identity misuse.' }),
  define({ id: 'email', name: 'Email address', categories: ['contact_information', 'internet_identities'], description: 'An email contact or account address.', evidence: 'Email-address syntax in OCR text or locally decoded QR content.', consequence: 'Could expose a contact or account identifier.', methods: ['pattern', 'visual_object'], verified: true, aliases: ['e-mail'], related: ['username'] }),
  define({ id: 'phone', name: 'Phone number', categories: ['contact_information'], description: 'A telephone contact number.', evidence: 'Phone label and plausible number length, or locally decoded QR content.', consequence: 'Could expose a direct contact method.', methods: ['label_context', 'visual_object'], verified: true, aliases: ['mobile number'] }),
  define({ id: 'home_address', name: 'Home address', categories: ['contact_information', 'geographic_locations'], description: 'A residential street address.', evidence: 'Explicit home-address label and plausible street value.', consequence: 'Could reveal where someone lives.', verified: true }),
  define({ id: 'shipping_address', name: 'Shipping address', categories: ['contact_information', 'geographic_locations'], description: 'A delivery address without a claim that it is home.', evidence: 'Explicit shipping or delivery label and street value.', consequence: 'Could reveal a delivery destination.', verified: true }),
  define({ id: 'billing_address', name: 'Billing address', categories: ['contact_information', 'geographic_locations'], description: 'A billing address without a claim that it is home.', evidence: 'Explicit billing label and street value.', consequence: 'Could reveal a billing destination.', verified: true }),
  define({ id: 'precise_location', name: 'Precise location', categories: ['geographic_locations'], description: 'A precise position or coordinate.', evidence: 'Coordinate format with location context or metadata.', consequence: 'Could reveal a person’s whereabouts.', methods: ['pattern', 'metadata'] }),
  define({ id: 'travel_itinerary', name: 'Travel itinerary', categories: ['movement_travel'], description: 'Upcoming or past travel details.', evidence: 'Trip dates and destinations with travel labels.', consequence: 'Could reveal movement or absence from home.' }),
  define({ id: 'family_relationship', name: 'Family relationship', categories: ['family_relationships', 'relational_inferences'], description: 'A personal relationship between people.', evidence: 'Explicit relationship wording or corroborated linked evidence.', consequence: 'Could expose another person’s identity or relationship.', methods: ['label_context', 'relationship'] }),
  define({ id: 'face_image', name: 'Face image', categories: ['biometrics', 'visual_environmental'], description: 'A visible face.', evidence: 'Verified local visual detection.', consequence: 'Could make someone recognizable.', methods: ['visual_object'] }),
  define({ id: 'medical_diagnosis', name: 'Medical diagnosis', categories: ['health_medical'], description: 'A stated health condition.', evidence: 'Medical context plus a diagnosis term.', consequence: 'Could expose private health information.', methods: ['nlp_entity', 'label_context'] }),
  define({ id: 'bank_account_number', name: 'Bank account number', categories: ['financial_information'], description: 'A bank account identifier.', evidence: 'Bank-account label and plausible numeric length.', consequence: 'Could expose financial account details.', verified: true, related: ['payment_amount'] }),
  define({ id: 'payment_amount', name: 'Payment amount', categories: ['transactions_purchases', 'financial_information'], description: 'An amount paid or charged.', evidence: 'Payment or transaction amount label with valid number.', consequence: 'Could reveal spending or financial activity.', verified: true }),
  define({ id: 'order_number', name: 'Order number', categories: ['transactions_purchases'], description: 'An order or refund identifier.', evidence: 'Order-number label with plausible identifier.', consequence: 'Could link someone to a purchase.', verified: true }),
  define({ id: 'transaction_reference', name: 'Transaction reference', categories: ['transactions_purchases'], description: 'A reference identifying a transaction or transfer.', evidence: 'Explicit transaction, payment or transfer reference label.', consequence: 'Could link someone to a payment.', verified: true }),
  define({ id: 'booking_reference', name: 'Booking reference', categories: ['movement_travel'], description: 'An identifier for a travel booking.', evidence: 'Explicit booking, reservation or flight reference label.', consequence: 'Could expose travel arrangements.', verified: true }),
  define({ id: 'asset_record', name: 'Personal asset record', categories: ['personal_assets'], description: 'A record of property or possessions.', evidence: 'Explicit ownership and asset details.', consequence: 'Could expose personal wealth.' }),
  define({ id: 'student_id', name: 'Student ID', categories: ['education_records', 'personal_identity'], description: 'An identifier assigned by an educational institution.', evidence: 'Student-ID label and plausible identifier.', consequence: 'Could expose an academic identifier.', verified: true, related: ['person_name'] }),
  define({ id: 'employment_record', name: 'Employment record', categories: ['employment_information'], description: 'Workplace or employment details.', evidence: 'Employment context and person-specific details.', consequence: 'Could expose work history.' }),
  define({ id: 'legal_case_number', name: 'Legal case number', categories: ['legal_information'], description: 'An identifier for a legal matter.', evidence: 'Court or case label and valid context.', consequence: 'Could expose involvement in a legal matter.' }),
  define({ id: 'insurance_policy_number', name: 'Insurance policy number', categories: ['insurance_benefits'], description: 'An insurance or benefits identifier.', evidence: 'Policy label and issuer context.', consequence: 'Could expose private coverage information.' }),
  define({ id: 'behavioral_history', name: 'Behavioral history', categories: ['behavioral_information'], description: 'A pattern of activities or habits.', evidence: 'Multiple linked observations, not one ordinary word.', consequence: 'Could reveal personal habits.', methods: ['relationship'] }),
  define({ id: 'sensitive_attribute', name: 'Sensitive personal attribute', categories: ['sensitive_attributes'], description: 'An attribute requiring careful contextual review.', evidence: 'Explicit self-description or reliable context, never guess from appearance.', consequence: 'Could expose someone to discrimination.', methods: ['nlp_entity'] }),
  define({ id: 'child_identity', name: 'Child identity', categories: ['children_information', 'personal_identity'], description: 'Information identifying a minor.', evidence: 'Explicit minor context and identifying detail.', consequence: 'Could expose a child’s identity.', methods: ['nlp_entity', 'label_context'] }),
  define({ id: 'username', name: 'Username', categories: ['internet_identities'], description: 'An online account handle.', evidence: 'Username label and account context.', consequence: 'Could link online activity to a person.' }),
  define({ id: 'password', name: 'Password', categories: ['authentication_credentials', 'internet_identities'], description: 'A secret used for account access.', evidence: 'Explicit password label and non-placeholder value.', consequence: 'Could allow unauthorized account access.', verified: true, sensitivity: 'Usually unnecessary to share as visible text.' }),
  define({ id: 'api_key', name: 'API key', categories: ['authentication_credentials', 'technical_infrastructure'], description: 'A secret used to authorize programmatic access.', evidence: 'Explicit API-key label and plausible token, including locally decoded QR content.', consequence: 'Could allow unauthorized service access.', methods: ['label_context', 'visual_object'], verified: true, aliases: ['access key'], related: ['server_address'], sensitivity: 'Usually unnecessary to share as visible text.', ownership: 'May belong to a person or organization; sharing may affect both.' }),
  define({ id: 'device_identifier', name: 'Device identifier', categories: ['device_network_identifiers'], description: 'A unique or stable device identifier.', evidence: 'Explicit device, serial or MAC label and plausible identifier.', consequence: 'Could enable device tracking.', methods: ['pattern', 'label_context'], verified: true }),
  define({ id: 'private_message', name: 'Private message', categories: ['communications'], description: 'Content from a private conversation.', evidence: 'Conversation layout or correspondence context.', consequence: 'Could expose another participant’s words.', methods: ['document_structure', 'nlp_entity'] }),
  define({ id: 'crypto_wallet_address', name: 'Crypto wallet address', categories: ['digital_assets', 'financial_information'], description: 'An address associated with digital assets.', evidence: 'Validated chain-specific address format and context.', consequence: 'Could link financial activity to a wallet.', methods: ['pattern'] }),
  define({ id: 'business_plan', name: 'Business plan', categories: ['commercial_confidential'], description: 'Nonpublic commercial strategy.', evidence: 'Document context and confidential content.', consequence: 'Could expose competitive plans.', methods: ['document_structure', 'nlp_entity'] }),
  define({ id: 'corporate_revenue', name: 'Corporate revenue', categories: ['corporate_financial'], description: 'Nonpublic organizational financial figures.', evidence: 'Revenue label and organizational context.', consequence: 'Could disclose private business finances.' }),
  define({ id: 'server_address', name: 'Server address', categories: ['technical_infrastructure', 'device_network_identifiers'], description: 'A network address for infrastructure.', evidence: 'Explicit server or host label and valid IPv4 address.', consequence: 'Could reveal an internal service location.', methods: ['pattern', 'label_context'], verified: true }),
  define({ id: 'source_code', name: 'Source code', categories: ['intellectual_property', 'technical_infrastructure'], description: 'Program source belonging to a project.', evidence: 'Code layout and ownership context.', consequence: 'Could expose proprietary implementation.', methods: ['document_structure'] }),
  define({ id: 'research_participant_id', name: 'Research participant ID', categories: ['research_information', 'personal_identity'], description: 'A study participant identifier.', evidence: 'Research context and participant label.', consequence: 'Could compromise participant confidentiality.' }),
  define({ id: 'contract_terms', name: 'Contract terms', categories: ['contracts_records'], description: 'Nonpublic agreement details.', evidence: 'Contract document context.', consequence: 'Could disclose private obligations.', methods: ['document_structure'] }),
  define({ id: 'background_location', name: 'Background location clue', categories: ['visual_environmental', 'geographic_locations'], description: 'A location visible in an image background.', evidence: 'Verified visual object and corroborating context.', consequence: 'Could reveal where an image was taken.', methods: ['visual_object'] }),
  define({ id: 'qr_code', name: 'QR code', categories: ['machine_readable_metadata'], description: 'A machine-readable visual code.', evidence: 'Verified local QR decoding and original-image location.', consequence: 'Could expose embedded links or identifiers.', methods: ['visual_object'], verified: true }),
  define({ id: 'gps_metadata', name: 'GPS metadata', categories: ['machine_readable_metadata', 'geographic_locations'], description: 'Location embedded in file metadata.', evidence: 'Local metadata read with GPS fields.', consequence: 'Could reveal where an image was made.', methods: ['metadata'] }),
  define({ id: 'inferred_relationship', name: 'Inferred relationship', categories: ['relational_inferences', 'family_relationships'], description: 'A relationship inferred from multiple pieces of evidence.', evidence: 'Multiple independent linked observations.', consequence: 'Could reveal a private connection.', methods: ['relationship'] }),
];

export const privacyKnowledgeBase = createTaxonomyRegistry(privacyCategories, privacyTypes);
