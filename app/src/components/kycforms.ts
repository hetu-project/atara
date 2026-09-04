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
 {t:'Basic profile', lead:'Must match your ID exactly.',              /* 本步全部字段 [抄] */
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
 {t:'ID check', lead:'Upload your ID and complete the liveness check.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('idfront','ID front','upload'), F('idback','ID back','upload'),
          F('liveness','Liveness check','upload')]},
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
 {t:'Authorised representative', lead:'Who signs and operates the account.', /* 步骤名 [抄]，字段 [补] */
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

export type FieldType = 'text' | 'date' | 'pick' | 'multi' | 'sign' | 'upload'
export interface Field { k: string; l: string; type: FieldType; opts?: string[] }
export interface Step { t: string; lead: string; fields: Field[] }

export { KYC_IND, KYC_CORP, LISTING_STEPS }
