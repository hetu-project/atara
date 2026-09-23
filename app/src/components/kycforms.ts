/* Form definitions for maker onboarding, taken verbatim from console.html.
 *
 * Marker convention -- [copied] = a field directly visible in the reference document screenshots, copied
 *                     verbatim;
 *                     [added] = the document named the step but did not expand its fields, so these follow
 *                     common practice for that step.
 *
 * KYC/KYB is an **account-level** process while listing configuration is **capability-level** -- two
 * different things, hence two submissions and two reviews, and they cannot be merged into one
 * "become a seller".
 */
/* eslint-disable */
// @ts-nocheck
const F=(k,l,type,extra)=>Object.assign({k,l,type:type||'text'},extra||{});


/* Individual onboarding is two steps: which kind of account, then the identity
   check. That is a product decision (Sept 2026): the seven self-reported steps
   that used to follow — profile, contact, tax residency, employment, source of
   wealth, declarations, signature — are gone for individuals. Nothing is typed
   after the check; what the account knows about the person is what the
   document said. The corporate path below is unchanged.

   The backend's required-field list for individuals (makerreview/rules.go,
   needIndividual) is empty to match; identity is proven by the verification
   row the server holds, which it already insists on at submit. */
const KYC_IND=[
 {t:'Account type', lead:'Individuals and companies follow different paths.', fields:[]},
 /* Verification comes first: the fields on the document (name, date of birth, document number, expiry)
    should be **read off it**, not typed in. This step used to be called "ID check", sat ninth, and was
    three upload boxes -- that is not verification, that is collecting images. */
 {t:'Identity verification', lead:'A live check against your government ID.',
  fields:[F('idcheck','Identity verification','idcheck')]},
];

/* What the identity check reads off the document. Not a step — nobody types
   these — but they still need definitions: the check writes them into the
   form (VERIFIED_FIELDS), the submission carries them, and the receipt labels
   them. Option lists stay so a value the document gives in another spelling
   is dropped rather than saved as an unknown choice. */
export const IDENTITY_FIELDS: Field[] = [
  F('nationality','Nationality','pick',{opts:['China','Hong Kong','Singapore','United States','Other']}),
  F('gender','Gender','pick',{opts:['Male','Female'],opt:true}),
  F('surname','Last name'), F('firstname','First name'),
  F('idtype','ID type','pick',{opts:['ID card','Passport','HK/Macau permit']}),
  F('idno','ID number'),
  F('idissue','Issue date','date',{opt:true}), F('iddue','Expiry date','date',{opt:true}),
  F('birthday','Date of birth','date',{opt:true}),
];

const KYC_CORP=[
 {t:'Account type', lead:'Individuals and companies follow different paths.', fields:[]},
 /* Upload the file before filling in fields, the same idea as the individual path: what is on the document
    should be **read off it**, not typed in. /kyb takes exactly this registration document as input -- it
    OCRs the company details, checks them against the official registry, runs sanctions screening, and tells
    us which officers need verifying.
    Until that is wired up the upload is still not wasted: what manual review faces today is a pile of
    hand-typed fields nobody has verified. */
 {t:'Registration document', lead:'Your certificate of incorporation or business registration.',
  fields:[F('bizdoc','Registration document','upload',
            {hint:'Certificate of incorporation, business registration, or articles of association'})]},
 {t:'Basic profile', lead:'Read from your document — check it and fill in the rest.',              /* every field in this step [copied] */
  fields:[F('company','Company name'), F('regno','Registration no.'),
          F('estdate','Incorporated','date',{opt:true}),
          F('regcountry','Country of registration','country'),
          F('street','Street','text',{opt:true}), F('city','City','text',{opt:true}),
          F('province','State','text',{opt:true}), F('zip','Postcode','text',{opt:true})]},
 {t:'Operations', lead:'Actual business and turnover.', /* step name [copied], fields [added] */
  fields:[F('bizindustry','Industry'), F('bizscope','Business','text',{opt:true}),
          F('turnover','Annual turnover','pick',{opts:['Under 5M','5M–50M','50M–500M','Over 500M']}),
          F('headcount','Headcount','pick',{opts:['1–10','11–50','51–200','200+'],opt:true})]},
 {t:'Source of wealth', lead:'Where company funds come from.', /* step name [copied], fields [added] */
  fields:[F('csow','Source of funds','multi',{opts:['Operations','Shareholders','Financing','Investments','Other']}),
          F('mainrev','Main revenue','text',{opt:true})]},
 {t:'Compliance', lead:'Sanctions, high-risk countries, internal AML.', /* step name [copied], fields [added] */
  fields:[F('sanction','Subject to sanctions','pick',{opts:['No','Yes']}),
          /* It is not only models that read "jurisdictions" as "industries" -- an OTC merchant can easily
             think they should answer Yes. So it says countries/regions explicitly. The Says clause in the
             backend's rules.go means the same thing, and the decision logic does not look at this label. */
          F('highrisk','Operates in FATF high-risk or monitored countries','pick',{opts:['No','Yes']}),
          F('amlpolicy','Internal AML policy','pick',{opts:['Yes','No'],opt:true})]},
 /* A corporate entity still has to verify a natural person: they are the one who signs and operates the
    account. Beneficial ownership must ultimately land on a natural person, and this step is that landing point. */
 {t:'Identity verification', lead:'The person who signs for the company.',
  fields:[F('idcheck','Identity verification','idcheck')]},
 {t:'Authorised representative', lead:'Read from the document above — fill in the rest.', /* step name [copied], fields [added] */
  fields:[F('repname','Name'), F('reptitle','Title','text',{opt:true}),
          F('repid','ID number'), F('repphone','Phone','text',{opt:true})]},
 /* Directors and beneficial owners are both **groups of people**, not one person. They each used to be
    three or four single fields, which structurally only fit one -- a company with five directors could not
    declare truthfully on this form. */
 {t:'Directors', lead:'All directors.', /* step name [copied], fields [added] */
  fields:[F('dirs','Directors','list',{row:[
            F('name','Name'),
            F('nat','Nationality','pick',{opts:['China','Hong Kong','Singapore','Other']}),
            F('id','ID number')]})]},
 {t:'Beneficial owner', lead:'Anyone holding 25% or more. Must resolve to a natural person.',
  fields:[F('ubos','Beneficial owners','list',{row:[
            F('name','Name'),
            F('share','Ownership (%)'),
            F('nat','Nationality','pick',{opts:['China','Hong Kong','Singapore','Other']}),
            F('id','ID number')]})]},
 {t:'Signature', lead:'Signing confirms the declarations above.', /* step name [copied], fields [added] */
  fields:[F('csign','Signature','sign')]},
 {t:'Review & submit', lead:'Review and submit. Usually cleared within one business day.', fields:[]},
];

const LISTING_STEPS=[
 {t:'What you trade', lead:'These terms bound every listing you post — no amounts yet.'},
 {t:'Confirm', lead:'Once approved you can post listings — buying, selling, or both.'},
];

/* idcheck is not an input: it is the step that hands the person over to DocuPass's hosted flow, and whether
   it is done is decided by the backend's verification status, not by whether this form holds a value. */
export type FieldType = 'text' | 'date' | 'pick' | 'multi' | 'sign' | 'idcheck'
  | 'country'  // Searchable country/region. The value is a two-letter ISO code.
  | 'upload'   // One file. The value is the file_ref given by the backend.
  | 'list'     // A group of repeating rows, whose shape is defined by field.row.

/**
 * Fields readable off an identity document -> keys in our form. After verification these should not be typed again.
 *
 * The option-typed ones (nationality / gender / idtype) are included too, but they are only prefilled when the
 * value read out happens to be one of the options we offer -- DocuPass recognises far more countries and
 * document types than this table lists. Forcing a "Bermuda" read from a document into a five-item list either
 * displays a value that cannot be selected, or silently rewrites it to "Other". When it does not match, leave
 * it for the person to pick.
 */
/**
 * Fields readable off a registration document -> keys in the corporate form. After verification these should
 * not be typed again.
 *
 * Same reasoning as VERIFIED_FIELDS, only the subject changes from a person to a company. The option-typed one
 * (regcountry) is likewise only prefilled when the value read out happens to be one of the options we offer --
 * /kyb recognises far more jurisdictions than this table lists, and forcing a "GB" read from a document into a
 * five-item list either displays a value that cannot be selected, or silently rewrites it to "Other".
 */
export const VERIFIED_BIZ: Record<string, keyof import('../api/types').KybBusiness> = {
  company: 'legal_name', regno: 'reg_number', estdate: 'incorporated',
  street: 'address', city: 'city', zip: 'postcode',
  /* The country of incorporation is read out too. It used to be missed: the address was locked to the one on
     the document while the country was left for the person to pick from a five-item list -- GB was not
     pickable, so they had to choose something that did not match, and then got caught in review for "the city
     is London while the country of incorporation says Hong Kong". The form manufactured the contradiction,
     not the applicant.

     What is stored is the ISO code, and the countryIso2 that /kyb returns is exactly that -- no translation in
     between, and therefore no room for a translation error. */
  regcountry: 'country',
}

export const VERIFIED_FIELDS: Record<string, keyof import('../api/types').KycIdentity> = {
  surname: 'last_name', firstname: 'first_name', idno: 'doc_number',
  birthday: 'dob', idissue: 'issued', iddue: 'expiry',
  nationality: 'nationality', gender: 'sex', idtype: 'doc_type',
  repname: 'full_name', repid: 'doc_number',
}
export interface Field {
  k: string; l: string; type: FieldType; opts?: string[]
  /** upload: the line explaining what to upload when no file is picked. */
  hint?: string
  /** list: what one row looks like. Keys inside a row are local to the row and do not collide with the outer form. */
  row?: Field[]
  /**
   * Can be left blank and still pass.
   *
   * **The authority on what is required is the backend** (makerreview's needIndividual / needCorporate); this
   * only says the same thing to the person. The frontend used to treat every item as required, stricter than
   * the backend -- so something like "province", which does not exist at all in Hong Kong, Singapore or the
   * Cayman Islands, had to be filled in, and once filled was flagged in review as duplicating the city.
   */
  opt?: boolean
}
export interface Step { t: string; lead: string; fields: Field[] }

/**
 * Field key → the label the applicant actually sees.
 *
 * A review points at keys (`taxcountry`); the person reading it knows the
 * form by its labels ("Tax residency"). Printing the raw key would make the
 * verdict look like a stack trace.
 */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [
    ...[...KYC_IND, ...KYC_CORP, ...LISTING_STEPS]
      .flatMap((st: any) => (st.fields ?? []) as { k: string; l: string }[]),
    ...IDENTITY_FIELDS,
  ].map(f => [f.k, f.l]),
)

export { KYC_IND, KYC_CORP, LISTING_STEPS }

/* The fiat rails table has moved to the backend (/catalog/rails); the frontend takes it from useRails.
   Why it moved: the version hardcoded here listed SGD / AED / EUR while the backend only settled
   CNY / HKD / USD -- a merchant configured with only the SGD rail still passed review, then never matched a
   single order, and received no error at all. With the catalog owned by the backend, this whole class of
   drift cannot happen again. */

/** Reference index (static demo): fiat / USD. The pricing row uses it to work out what you are quoting. */
export const FX_IDX: Record<string, number> = { CNY: 7.28, HKD: 7.80, SGD: 1.34, AED: 3.67, EUR: 0.86 }
