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
          F('gender','Gender','pick',{opts:['Male','Female'],opt:true}),
          F('surname','Last name'), F('firstname','First name'),
          F('idtype','ID type','pick',{opts:['ID card','Passport','HK/Macau permit']}),
          F('idno','ID number'),
          F('idissue','Issue date','date',{opt:true}), F('iddue','Expiry date','date',{opt:true}),
          F('birthday','Date of birth','date',{opt:true})]},
 {t:'Contact', lead:'Used for verification notices.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('phone','Phone','text',{opt:true}), F('email','Email','text',{opt:true}), F('addr','Address','text',{opt:true})]},
 {t:'Tax information', lead:'Required under CRS and FATCA.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('taxcountry','Tax residency','pick',{opts:['China','Hong Kong','Singapore','Other']}),
          F('tin','TIN','text',{opt:true})]},
 {t:'Employment', lead:'Supports your source of wealth.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('empstatus','Status','pick',{opts:['Employed','Self-employed','Business owner','Retired','Student','Unemployed'],opt:true}),
          F('industry','Industry','text',{opt:true}), F('employer','Employer','text',{opt:true})]},
 {t:'Source of wealth', lead:'How your wealth was accumulated overall.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sow','Sources','multi',{opts:['Salary','Business income','Investments','Inheritance','Digital assets','Other']}),
          F('income','Annual income','pick',{opts:['Under 500k','500k–2M','2M–10M','Over 10M']})]},
 {t:'Declarations', lead:'Politically exposed persons require enhanced due diligence.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('pep','Politically exposed person','pick',{opts:['No','Yes','Close associate']}),
          F('ustax','US tax resident','pick',{opts:['No','Yes'],opt:true})]},
 {t:'Signature', lead:'Signing confirms the declarations above.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sign','Signature','sign')]},
];

const KYC_CORP=[
 {t:'Account type', lead:'Individuals and companies follow different paths.', fields:[]},
 /* 先传文件再填字段，跟个人那条同一个思路：证件上有的东西应当是**读出来的**，
    不是手打的。/kyb 的入参就是这张注册文件——它 OCR 出公司信息、去官方注册处
    核对、过制裁名单，再告诉我们该验哪几个负责人。
    没接上之前它也不白传：人工审核现在面对的是一堆没人验过的手填字段。 */
 {t:'Registration document', lead:'Your certificate of incorporation or business registration.',
  fields:[F('bizdoc','Registration document','upload',
            {hint:'Certificate of incorporation, business registration, or articles of association'})]},
 {t:'Basic profile', lead:'Read from your document — check it and fill in the rest.',              /* 本步全部字段 [抄] */
  fields:[F('company','Company name'), F('regno','Registration no.'),
          F('estdate','Incorporated','date',{opt:true}),
          F('regcountry','Country of registration','country'),
          F('street','Street','text',{opt:true}), F('city','City','text',{opt:true}),
          F('province','State','text',{opt:true}), F('zip','Postcode','text',{opt:true})]},
 {t:'Operations', lead:'Actual business and turnover.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('bizindustry','Industry'), F('bizscope','Business','text',{opt:true}),
          F('turnover','Annual turnover','pick',{opts:['Under 5M','5M–50M','50M–500M','Over 500M']}),
          F('headcount','Headcount','pick',{opts:['1–10','11–50','51–200','200+'],opt:true})]},
 {t:'Source of wealth', lead:'Where company funds come from.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('csow','Source of funds','multi',{opts:['Operations','Shareholders','Financing','Investments','Other']}),
          F('mainrev','Main revenue','text',{opt:true})]},
 {t:'Compliance', lead:'Sanctions, high-risk countries, internal AML.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('sanction','Subject to sanctions','pick',{opts:['No','Yes']}),
          /* 「jurisdictions」被读成「行业」不止模型一个——一家 OTC 商家很容易
             觉得自己该答 Yes。写明是国家/地区。后端 rules.go 那条 Says 说的是
             同一件事，判断逻辑不看这个标签。 */
          F('highrisk','Operates in FATF high-risk or monitored countries','pick',{opts:['No','Yes']}),
          F('amlpolicy','Internal AML policy','pick',{opts:['Yes','No'],opt:true})]},
 /* 企业主体也要验一个自然人：签字、操作账户的是他。受益人最终必须落到
    自然人身上，这一步就是那个落点。 */
 {t:'Identity verification', lead:'The person who signs for the company.',
  fields:[F('idcheck','Identity verification','idcheck')]},
 {t:'Authorised representative', lead:'Read from the document above — fill in the rest.', /* 步骤名 [抄]，字段 [补] */
  fields:[F('repname','Name'), F('reptitle','Title','text',{opt:true}),
          F('repid','ID number'), F('repphone','Phone','text',{opt:true})]},
 /* 董事和受益人都是**一组人**，不是一个人。原来各自三四个单字段，
    结构上就只填得下一个——一家有五个董事的公司在这张表上无法如实申报。 */
 {t:'Directors', lead:'All directors.', /* 步骤名 [抄]，字段 [补] */
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
  | 'country'  // 可搜索的国家/地区。值是两位 ISO 代码。
  | 'upload'   // 一份文件。值是后端给的 file_ref。
  | 'list'     // 一组重复的行，行的形状由 field.row 定义。

/**
 * 证件上读得出来的字段 → 我们表单里的 key。核验过之后这些不该再手打。
 *
 * 选项类（nationality / gender / idtype）也在里面，但只有读出来的值正好是
 * 我们给的选项之一时才预填——DocuPass 认得的国家和证件类型比我们这张表
 * 列的多得多。读出来一个「Bermuda」硬塞进只有五项的列表里，要么显示成一个
 * 选不中的值，要么被悄悄改成「Other」。对不上就留给人自己选。
 */
/**
 * 注册文件上读得出来的字段 → 企业表里的 key。核过之后这些不该再手打。
 *
 * 跟 VERIFIED_FIELDS 同一个道理,只是主体从人换成了公司。选项类
 * （regcountry）同样只在读出来的值正好是我们给的选项之一时才预填——
 * /kyb 认得的辖区比我们这张表列的多得多,读出来一个「GB」硬塞进只有
 * 五项的列表里,要么显示成一个选不中的值,要么被悄悄改成「Other」。
 */
export const VERIFIED_BIZ: Record<string, keyof import('../api/types').KybBusiness> = {
  company: 'legal_name', regno: 'reg_number', estdate: 'incorporated',
  street: 'address', city: 'city', zip: 'postcode',
  /* 注册国也读出来。原来漏了它:地址被锁成文件上那一个,国家却留给人从
     一个五项的列表里挑——挑不出 GB,只能选个对不上的,然后被审核抓住
     「城市在伦敦而注册国写着香港」。矛盾是表单造的,不是申请人造的。

     存的是 ISO 代码,而 /kyb 回的 countryIso2 正好就是它——中间不需要
     任何翻译,也就没有译错的余地。 */
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
  /** upload：没选文件时那行说明该传什么。 */
  hint?: string
  /** list：一行长什么样。行里的 key 是行内局部的，不跟外面的表单撞。 */
  row?: Field[]
  /**
   * 留空也能过。
   *
   * 必填清单的**权威在后端**（makerreview 的 needIndividual / needCorporate），
   * 这里只是把同一件事说给人听。原来前端把每一项都当必填，比后端严——
   * 于是「省」这种在香港、新加坡、开曼根本不存在的东西也被逼着填，
   * 填了又被审核指出跟城市重复。
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
