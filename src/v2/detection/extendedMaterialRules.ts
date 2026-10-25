import { expiryDatePattern, validExpiryDate } from './documentExpiry';
import type { DocumentRule } from './documentPatterns';
const text = /^[^:：\n]{2,120}/u;
const id = /^[\p{L}\p{N}][\p{L}\p{N} ._/*#-]{2,49}/u;
const secret = /^[^\s:：][^\r\n]{2,160}/u;
// Explicit demographic labels can legitimately have a one-character value on an ID.
const identityText = /^[\p{L}][\p{L} .'’/-]{0,79}/u;
const rule = (key: string, label: string, category: string, pattern: RegExp, valuePattern = text): DocumentRule =>
  ({ id: key, label, categories: [category], labelPattern: pattern, valuePattern, ...(valuePattern === id ? { accept: (value: string) => !/^(\d)\1+$/.test(value.trim()) } : {}) });

/** Explicit labels only: document families do not imply an identity, diagnosis or secret. */
export const extendedMaterialRules: readonly DocumentRule[] = [
  { ...rule('card-expiry', 'Card expiry date', 'financial_information', /\b(?:valid\s*(?:thru|through)|(?:credit|debit|payment)\s*card\s*(?:expiry|expiration))(?:\s*date)?\b/gi, expiryDatePattern), accept: validExpiryDate },
  { ...rule('expiry-date', 'Expiry date', 'personal_identity', /\b(?:expiry|expiration|expires|valid\s*(?:until|to))(?:\s*date)?\b|有\s*效\s*期(?:\s*限)?|到\s*期\s*日/gi, expiryDatePattern), accept: validExpiryDate },
  rule('card-number', 'Payment card number', 'financial_information', /\b(?:card\s*(?:number|no\.?|#)|pan)(?=\s*[:：#=])|卡\s*号/gi, /^[\d*Xx•][\d *Xx•-]{7,30}/),
  rule('card-owner', 'Cardholder name', 'personal_identity', /\b(?:cardholder|name\s*on\s*card|account\s*holder)(?:\s*name)?\b|户\s*名|开\s*户\s*人/gi),
  rule('bank-account', 'Bank account details', 'financial_information', /\b(?:(?:bank|checking|savings)\s*account(?:\s*(?:number|no\.?))?|account\s*(?:number|no\.?))\b|账\s*户\s*号\s*码/gi, id),
  rule('bank-branch', 'Bank branch or transfer code', 'financial_information', /\b(?:bsb|transit\s*(?:number|no\.?)|institution\s*(?:number|no\.?)|ifsc|branch\s*code|clabe)\b|联\s*行\s*号|开\s*户\s*行/gi, id),
  rule('financial-record', 'Financial record', 'financial_information', /\b(?:credit\s*limit|credit\s*score|loan\s*balance|mortgage\s*balance|investment\s*account|portfolio\s*value|taxable\s*income)\b|贷\s*款\s*余\s*额|授\s*信\s*额\s*度|征\s*信\s*评\s*分/gi),
  rule('document-number', 'Identity document number', 'government_identification', /\b(?:document\s*(?:number|no\.?)|id\s*(?:number|no\.?)|personal\s*(?:number|no\.?))\b|证\s*件\s*号(?:\s*码)?/gi, id),
  rule('immigration', 'Immigration or residence identifier', 'government_identification', /\b(?:visa\s*(?:number|no\.?)|residen(?:ce|t)\s*permit(?:\s*(?:number|no\.?))?|uscis|alien\s*(?:number|registration)|uci|brp\s*(?:number|no\.?)|pr\s*card)\b|签\s*证\s*号|居\s*留\s*证\s*号|港\s*澳\s*通\s*行\s*证/gi, id),
  rule('regional-id', 'Regional government identifier', 'government_identification', /\b(?:aadhaar|aadhar|nino|nric|fin\s*number|my\s*number|national\s*insurance\s*number|cpf|curp|rfc|dni|nie|nif|codice\s*fiscale)(?:\s*(?:number|no\.?))?\b|住\s*民\s*登\s*录\s*号|居\s*民\s*登\s*录\s*号|统\s*一\s*编\s*号/gi, id),
  rule('passport-name', 'Passport personal details', 'government_identification', /\b(?:surnames?|given\s*names?)\b/gi, identityText),
  rule('passport-personal', 'Passport personal details', 'government_identification', /\b(?:nationality|place\s*of\s*birth|issuing\s*authority|country\s*of\s*birth)\b|国\s*籍|出\s*生\s*地|签\s*发\s*机\s*关/gi),
  rule('identity-sex', 'Sex or gender', 'personal_identity', /\b(?:sex|gender)\b|性\s*别/gi, /^(?:male|female|non[- ]?binary|unspecified|other|[MFX]|男|女|未\s*说\s*明|其\s*他)(?![\p{L}\p{N}])/iu),
  rule('ethnicity', 'Ethnicity', 'personal_identity', /\b(?:ethnicity|ethnic\s*(?:group|origin))\b|民\s*族|族\s*别/gi, identityText),
  rule('emergency', 'Emergency contact', 'contact_information', /\b(?:emergency\s*contact|next\s*of\s*kin|guardian\s*(?:name|phone)|parent\s*(?:name|phone))\b|紧\s*急\s*联\s*系\s*人|监\s*护\s*人/gi),
  rule('phone-label', 'Contact telephone', 'contact_information', /\b(?:phone|telephone|mobile|cell|fax|tel)(?:\s*(?:number|no\.?))?\b\.?|手\s*机(?:\s*号(?:\s*码)?)?|电\s*话(?:\s*号(?:\s*码)?)?|传\s*真(?:\s*号(?:\s*码)?)?/gi, /^\+?[\d(][\d ()+.-]{6,24}/),
  rule('email-label', 'Contact email', 'contact_information', /\b(?:e-?mail)(?:\s*address)?\b|电\s*子\s*邮\s*箱|电\s*子\s*邮\s*件|邮\s*箱/gi, /^[\w.+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)+/i),
  rule('location', 'Precise location', 'geographic_locations', /\b(?:gps|coordinates|latitude|longitude|live\s*location|location\s*history)\b|经\s*度|纬\s*度|实\s*时\s*位\s*置|定\s*位\s*地\s*址/gi),
  rule('password', 'Password or PIN', 'authentication_credentials', /\b(?:password|passwd|pwd|passcode|pin)(?=\s*[:：=])|密\s*码|支\s*付\s*密\s*码/gi, secret),
  rule('verification', 'Verification or recovery code', 'authentication_credentials', /\b(?:otp|one[- ]time\s*(?:code|password)|verification\s*code|security\s*code|recovery\s*code|backup\s*code|recovery\s*phrase|seed\s*phrase)\b|验\s*证\s*码|恢\s*复\s*码|助\s*记\s*词/gi, secret),
  rule('api-key', 'API or application secret', 'authentication_credentials', /\b(?:api[- _]?key|api[- _]?secret|app[- _]?secret|private[- _]?key|database[- _]?url|connection[- _]?string)\b|接\s*口\s*密\s*钥/gi, secret),
  rule('cookie', 'Session or cookie value', 'authentication_credentials', /\b(?:cookie|set-cookie|sessionid|session_id|authorization)(?=\s*[:：=])/gi, secret),
  rule('meeting', 'Meeting access details', 'communications', /\b(?:meeting\s*(?:id|password|passcode|link)|zoom\s*(?:id|link)|invite\s*(?:code|link))\b|会\s*议\s*号|会\s*议\s*密\s*码|邀\s*请\s*码/gi, secret),
  rule('shipping-person', 'Shipping or billing details', 'transactions_purchases', /\b(?:ship\s*to|bill\s*to|sold\s*to|consignee|consignor)\b|寄\s*件\s*人|收\s*货\s*人|付\s*款\s*人/gi),
  rule('order-reference', 'Order or transaction reference', 'transactions_purchases', /\b(?:transaction|transfer|payment|order|purchase)\s*(?:reference|ref\.?|id|number|no\.?|#)\b|交\s*易\s*号|流\s*水\s*号|支\s*付\s*单\s*号|订\s*单\s*号/gi, id),
  rule('membership', 'Membership or loyalty identifier', 'internet_identities', /\b(?:member|membership|loyalty|frequent\s*flyer|customer|client)\s*(?:id|number|no\.?)\b|会\s*员\s*号|客\s*户\s*号/gi, id),
  rule('travel-name', 'Passenger or guest details', 'movement_travel', /\b(?:passenger|traveller|traveler|guest)(?:\s*name)?(?=\s*[:：])|旅\s*客\s*姓\s*名|乘\s*机\s*人/gi),
  rule('travel-schedule', 'Travel schedule or seat', 'movement_travel', /\b(?:flight\s*(?:number|no\.?)|seat\s*(?:number|no\.?)|boarding\s*(?:time|group)|room\s*number|check[- ]?in\s*code)\b|航\s*班\s*号|座\s*位\s*号|房\s*间\s*号/gi, id),
  rule('medical-measurement', 'Health measurement or report', 'health_medical', /\b(?:blood\s*(?:type|pressure|group)|lab\s*result|specimen\s*(?:id|number)|accession\s*(?:id|number)|hiv\s*status|pregnancy\s*test|mental\s*health|genetic\s*result)\b|血\s*型|血\s*压|标\s*本\s*号|检\s*查\s*报\s*告|遗\s*传\s*检\s*测/gi),
  rule('medical-benefit', 'Health coverage details', 'insurance_benefits', /\b(?:medicare|medicaid|beneficiary|subscriber|group)\s*(?:id|number|no\.?)\b|医\s*保\s*卡\s*号|参\s*保\s*号/gi, id),
  rule('employment-private', 'Employment or HR information', 'employment_information', /\b(?:performance\s*rating|disciplinary\s*action|termination\s*reason|employment\s*status|manager\s*name|job\s*offer|compensation)\b|绩\s*效\s*评\s*级|离\s*职\s*原\s*因|雇\s*佣\s*状\s*态/gi),
  rule('student-details', 'Education record details', 'education_records', /\b(?:admission\s*(?:id|number)|application\s*(?:id|number)|school\s*name|class\s*rank|exam\s*result|date\s*of\s*graduation)\b|录\s*取\s*编\s*号|学\s*籍\s*号|班\s*级\s*排\s*名/gi),
  rule('legal-details', 'Legal record details', 'legal_information', /\b(?:court\s*name|attorney\s*name|offence|offense|criminal\s*record|settlement\s*amount|legal\s*advice)\b|诉\s*讼\s*案\s*件|律\s*师\s*意\s*见|赔\s*偿\s*金\s*额/gi),
  rule('property', 'Property or asset identifier', 'personal_assets', /\b(?:property\s*(?:id|address)|parcel\s*(?:id|number)|land\s*title|deed\s*number|mortgage\s*account)\b|房\s*产\s*证\s*号|不\s*动\s*产\s*权\s*证\s*号/gi, id),
  rule('device-access', 'Device or infrastructure details', 'technical_infrastructure', /\b(?:hostname|host\s*name|internal\s*url|server\s*address|database\s*host|device\s*id|advertising\s*id|android\s*id|udid|ip\s*address)\b|内\s*网\s*地\s*址|服\s*务\s*器\s*地\s*址/gi, secret),
  rule('commercial-secret', 'Commercial or internal information', 'commercial_confidential', /\b(?:customer\s*list|supplier\s*pricing|unit\s*cost|sales\s*forecast|unreleased\s*product|confidential\s*notes|trade\s*secret|internal\s*notes)\b|客\s*户\s*名\s*单|供\s*应\s*商\s*报\s*价|内\s*部\s*备\s*注|商\s*业\s*机\s*密/gi),
  rule('personal-sensitive', 'Personal or family details', 'personal_identity', /\b(?:marital\s*status|religion|sexual\s*orientation|political\s*affiliation|family\s*member)\b|婚\s*姻\s*状\s*况|宗\s*教\s*信\s*仰|家\s*庭\s*成\s*员/gi),
];
