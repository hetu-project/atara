/* 做市准入的表单定义，逐字取自 console.html。
 *
 * 标记规则——[抄] = 参考文档截图里能直接看到的字段，逐字照搬；
 *            [补] = 文档只给了步骤名没展开字段，按该步骤的通行做法补。
 *
 * KYC/KYB 是**账户级**流程，挂单配置是**能力级**配置——两件事，
 * 所以是两段提交、两次审核，不能揉成一个「成为卖家」。
 */
/* eslint-disable */
// @ts-nocheck
const F=(k,l,type,extra)=>Object.assign({k,l,type:type||'text'},extra||{});


const KYC_IND=[
 {t:'Account type', lead:'Individuals and companies follow different paths.', fields:[]},
 /* 核验放在最前：证件上那些字段（姓名、生日、证件号、有效期）应当是**读出来的**，
    不是手打的。先验再填，下一步就只剩证件上没有的东西要问。
    原来这一步叫「ID check」摆在第九步，是三个上传框——那不是核验，那是收图。 */
 {t:'Identity verification', lead:'A live check against your government ID.',
  fields:[F('idcheck','Identity verification','idcheck')]},
 {t:'Basic profile', lead:'Read from your document — check it and fill in the rest.', /* 本步全部字段 [抄] */
  fields:[F('nationality','Nationality','pick',{opts:['China','Hong Kong','Singapore','United States','Other']}),
          F('gender','Gender','pick',{opts:['Male','Female']}),
          F('surname','Last name'), F('firstname','First name'),
          F('idtype','ID type','pick',{opts:['ID card','Passport','HK/Macau permit']}),
          F('idno','ID number'),
          F('idissue','Issue date','date'), F('iddue','Expiry date','date'),
          F('birthday','Date of birth','date')]},
 {t:'Contact', lead:'Used for verification notices.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('phone','Phone'), F('email','Email'), F('addr','Address')]},
 {t:'Tax information', lead:'Required under CRS and FATCA.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('taxcountry','Tax residency','pick',{opts:['China','Hong Kong','Singapore','Other']}),
          F('tin','TIN')]},
 {t:'Employment', lead:'Supports your source of wealth.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('empstatus','Status','pick',{opts:['Employed','Self-employed','Business owner','Retired','Student','Unemployed']}),
          F('industry','Industry'), F('employer','Employer')]},
 {t:'Source of wealth', lead:'How your wealth was accumulated overall.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sow','Sources','multi',{opts:['Salary','Business income','Investments','Inheritance','Digital assets','Other']}),
          F('income','Annual income','pick',{opts:['Under 500k','500k–2M','2M–10M','Over 10M']})]},
 {t:'Declarations', lead:'Politically exposed persons require enhanced due diligence.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('pep','Politically exposed person','pick',{opts:['No','Yes','Close associate']}),
          F('ustax','US tax resident','pick',{opts:['No','Yes']})]},
 {t:'Signature', lead:'Signing confirms the declarations above.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sign','Signature','sign')]},
];

const KYC_CORP=[
 {t:'Account type', lead:'Individuals and companies follow different paths.', fields:[]},
 {t:'Basic profile', lead:'Must match your registration documents.',                            /* 本步全部字段 [抄] */
  fields:[F('company','Company name'), F('regno','Registration no.'),
          F('estdate','Incorporated','date'),
          F('regcountry','Country','pick',{opts:['Hong Kong','Singapore','BVI','Cayman','Other']}),
          F('street','Street'), F('city','City'),
          F('province','State'), F('zip','Postcode')]},
 {t:'Operations', lead:'Actual business and turnover.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('bizindustry','Industry'), F('bizscope','Business'),
          F('turnover','Annual turnover','pick',{opts:['Under 5M','5M–50M','50M–500M','Over 500M']}),
          F('headcount','Headcount','pick',{opts:['1–10','11–50','51–200','200+']})]},
 {t:'Source of wealth', lead:'Where company funds come from.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('csow','Source of funds','multi',{opts:['Operations','Shareholders','Financing','Investments','Other']}),
          F('mainrev','Main revenue')]},
 {t:'Compliance', lead:'Sanctions, high-risk jurisdictions, internal AML.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sanction','Subject to sanctions','pick',{opts:['No','Yes']}),
          F('highrisk','Operates in high-risk jurisdictions','pick',{opts:['No','Yes']}),
          F('amlpolicy','Internal AML policy','pick',{opts:['Yes','No']})]},
 /* 企业主体也要验一个自然人：签字、操作账户的是他。受益人最终必须落到
    自然人身上，这一步就是那个落点。 */
 {t:'Identity verification', lead:'The person who signs for the company.',
  fields:[F('idcheck','Identity verification','idcheck')]},
 {t:'Authorised representative', lead:'Read from the document above — fill in the rest.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('repname','Name'), F('reptitle','Title'),
          F('repid','ID number'), F('repphone','Phone')]},
 {t:'Directors', lead:'All directors.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('dirname','Director name'),
          F('dirnat','Nationality','pick',{opts:['China','Hong Kong','Singapore','Other']}),
          F('dirid','ID number')]},
 {t:'Beneficial owner', lead:'Must resolve to a natural person.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('ubo','Name'), F('uboshare','Ownership (%)'),
          F('ubonat','Nationality','pick',{opts:['China','Hong Kong','Singapore','Other']}),
          F('uboid','ID number')]},
 {t:'Signature', lead:'Signing confirms the declarations above.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('csign','Signature','sign')]},
 {t:'Review & submit', lead:'Review and submit. Usually cleared within one business day.', fields:[]},
];

const LISTING_STEPS=[
 {t:'What you trade', lead:'These terms bound every listing you post — no amounts yet.'},
 {t:'Confirm', lead:'Once approved you can post listings — buying, selling, or both.'},
];

/* idcheck 不是一个输入框：它是把人交给 DocuPass 托管流程的那一步，
   填没填由后端的核验状态说了算，不看这张表单里有没有值。 */
export type FieldType = 'text' | 'date' | 'pick' | 'multi' | 'sign' | 'idcheck'

/**
 * 证件上读得出来的字段 → 我们表单里的 key。核验过之后这些不该再手打。
 *
 * 选项类（nationality / gender / idtype）也在里面，但只有读出来的值正好是
 * 我们给的选项之一时才预填——DocuPass 认得的国家和证件类型比我们这张表
 * 列的多得多。读出来一个「Bermuda」硬塞进只有五项的列表里，要么显示成一个
 * 选不中的值，要么被悄悄改成「Other」。对不上就留给人自己选。
 */
export const VERIFIED_FIELDS: Record<string, keyof import('../api/types').KycIdentity> = {
  surname: 'last_name', firstname: 'first_name', idno: 'doc_number',
  birthday: 'dob', idissue: 'issued', iddue: 'expiry',
  nationality: 'nationality', gender: 'sex', idtype: 'doc_type',
  repname: 'full_name', repid: 'doc_number',
}
export interface Field { k: string; l: string; type: FieldType; opts?: string[] }
export interface Step { t: string; lead: string; fields: Field[] }

/**
 * Field key → the label the applicant actually sees.
 *
 * A review points at keys (`taxcountry`); the person reading it knows the
 * form by its labels ("Tax residency"). Printing the raw key would make the
 * verdict look like a stack trace.
 */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...KYC_IND, ...KYC_CORP, ...LISTING_STEPS]
    .flatMap((st: any) => (st.fields ?? []) as { k: string; l: string }[])
    .map(f => [f.k, f.l]),
)

export { KYC_IND, KYC_CORP, LISTING_STEPS }

/* 法币渠道那张表已经搬到后端（/catalog/rails），前端从 useRails 取。
   搬走的理由：写死在这里的那一版列了 SGD / AED / EUR 三档，而后端只结算
   CNY / HKD / USD——只勾了 SGD 渠道的商户配置照样审过，然后永远撮合不到
   任何一单，而他收不到任何报错。目录归后端，这一整类漂移才不会再发生。 */

/** 参考指数（demo 静态）：法币 / USD。定价那一行用它算出「你报多少」。 */
export const FX_IDX: Record<string, number> = { CNY: 7.28, HKD: 7.80, SGD: 1.34, AED: 3.67, EUR: 0.86 }
