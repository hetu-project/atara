/* Bank catalog, taken verbatim from console.html.
 *
 * This table's job is not to be an "authoritative register" but three things -- save the user typing,
 * normalise the spelling of a given bank (otherwise the same bank gets recorded five different ways),
 * and infer country and currency from the selection.
 * So it works by search, not by scrolling, and it always keeps the "just use what I typed" escape hatch:
 * a dropdown that can stop a user entering their actual bank is a bug.
 *
 * The alias column lets "CMB", "zhaoshang" and the Chinese name all match the same entry. Cross-border
 * EMIs and crypto-friendly banks (Wise / Airwallex / Statrys / ZA / Sygnum and others) are deliberately
 * included -- OTC traders' accounts are often not at the big four, and listing only the largest banks by
 * assets amounts to not covering real users.
 */
/* eslint-disable */
const BANK_DIR: Record<string, string[]> ={
 CN:['Industrial & Commercial Bank of China|ICBC 工商银行 gongshang','China Construction Bank|CCB 建设银行 jianshe',
     'Agricultural Bank of China|ABC 农业银行 nongye','Bank of China|BOC 中国银行 zhongguo',
     'Bank of Communications|BOCOM 交通银行 jiaotong','China Merchants Bank|CMB 招商银行 zhaoshang',
     'Ping An Bank|平安银行 pingan','China CITIC Bank|中信银行 zhongxin','China Minsheng Bank|民生银行 minsheng',
     'Shanghai Pudong Development Bank|SPDB 浦发银行 pufa','Industrial Bank|CIB 兴业银行 xingye',
     'China Everbright Bank|CEB 光大银行 guangda','China Guangfa Bank|CGB 广发银行 guangfa',
     'Postal Savings Bank of China|PSBC 邮储银行 youchu','Bank of Beijing|北京银行','Bank of Shanghai|上海银行',
     'Bank of Ningbo|宁波银行','Bank of Jiangsu|江苏银行'],
 HK:['HSBC|汇丰 huifeng Hongkong Shanghai Banking','Hang Seng Bank|恒生 hangseng',
     'Bank of China (Hong Kong)|BOCHK 中银香港','Standard Chartered (Hong Kong)|渣打 zhada SCB',
     'Citibank (Hong Kong)|花旗 huaqi','DBS Bank (Hong Kong)|星展','Bank of East Asia|BEA 东亚银行',
     'ICBC (Asia)|工银亚洲','CMB Wing Lung Bank|招商永隆','Nanyang Commercial Bank|南洋商业银行',
     'Dah Sing Bank|大新银行','Fubon Bank (Hong Kong)|富邦银行','Public Bank (Hong Kong)|大众银行',
     'China Construction Bank (Asia)|建银亚洲','Chong Hing Bank|创兴银行',
     'ZA Bank|众安银行 virtual','Mox Bank|virtual','WeLab Bank|汇立银行 virtual','livi Bank|virtual',
     'Statrys|EMI','Currenxie|EMI','Airwallex (Hong Kong)|空中云汇 EMI'],
 SG:['DBS Bank|星展 Development Bank of Singapore','OCBC Bank|华侨银行 Oversea-Chinese',
     'United Overseas Bank|UOB 大华银行','Standard Chartered (Singapore)|渣打','Citibank (Singapore)|花旗',
     'HSBC (Singapore)|汇丰','Maybank (Singapore)|马来亚银行','Bank of China (Singapore)|中国银行',
     'CIMB Bank (Singapore)|联昌','Trust Bank|digital','Aspire|EMI','Nium|EMI'],
 JP:['MUFG Bank|三菱UFJ Mitsubishi Tokyo','Sumitomo Mitsui Banking|SMBC 三井住友','Mizuho Bank|みずほ 瑞穗',
     'Resona Bank|りそな','Japan Post Bank|ゆうちょ 邮政','Rakuten Bank|楽天 乐天','SBI Shinsei Bank|新生'],
 KR:['KB Kookmin Bank|국민 国民','Shinhan Bank|신한 新韩','KEB Hana Bank|하나 Hana','Woori Bank|우리',
     'NH NongHyup Bank|농협 农协','Industrial Bank of Korea|IBK 기업'],
 TW:['CTBC Bank|中國信託 Chinatrust','Cathay United Bank|國泰世華','E.SUN Bank|玉山','Fubon Bank (Taiwan)|富邦',
     'Taishin Bank|台新','Mega International Bank|兆豐'],
 US:['JPMorgan Chase|Chase 大通','Bank of America|BofA 美国银行','Citibank|花旗 huaqi Citi',
     'Wells Fargo|富国银行','U.S. Bank|USB','PNC Bank','Truist Bank','Capital One',
     'Goldman Sachs|高盛','Morgan Stanley|摩根士丹利','Charles Schwab|嘉信',
     'Cross River Bank|fintech','Customers Bank|fintech','Lead Bank|fintech','Mercury|fintech','Brex|fintech'],
 GB:['Barclays|巴克莱','HSBC UK|汇丰','Lloyds Bank|劳依德','NatWest|National Westminster',
     'Santander UK|桑坦德','Nationwide Building Society','Monzo|digital','Starling Bank|digital',
     'Revolut|EMI','Wise|TransferWise EMI'],
 DE:['Deutsche Bank|德意志银行','Commerzbank|德国商业银行','N26|digital','DKB|Deutsche Kreditbank'],
 FR:['BNP Paribas|法国巴黎银行','Société Générale|法国兴业银行','Crédit Agricole|法国农业信贷'],
 ES:['Banco Santander|桑坦德','BBVA|Banco Bilbao Vizcaya','CaixaBank'],
 IT:['UniCredit|裕信银行','Intesa Sanpaolo|联合圣保罗'],
 NL:['ING Bank|荷兰国际','ABN AMRO|荷兰银行','Rabobank|荷兰合作银行'],
 CH:['UBS|瑞银 Union Bank of Switzerland','PostFinance|瑞士邮政','Julius Baer|宝盛',
     'Sygnum Bank|crypto','AMINA Bank|SEBA crypto'],
 LI:['Bank Frick|crypto'],
 AT:['Erste Group|奥地利第一储蓄','Raiffeisen Bank International|RBI'],
 SE:['SEB|Skandinaviska Enskilda Banken','Swedbank','Nordea|北欧联合'],
 DK:['Danske Bank|丹斯克'],
 AE:['Emirates NBD|阿联酋国民银行','First Abu Dhabi Bank|FAB 阿布扎比第一','Abu Dhabi Commercial Bank|ADCB',
     'Mashreq Bank|马什雷克','Dubai Islamic Bank|迪拜伊斯兰'],
 TH:['Bangkok Bank|盘谷银行','Kasikornbank|开泰银行 KBank','Siam Commercial Bank|SCB 汇商',
     'Krungthai Bank|泰京银行'],
 VN:['Vietcombank|越南外贸银行','Techcombank|越南技术商业','VietinBank|越南工商','BIDV|越南投资发展'],
 MY:['Maybank|马来亚银行','CIMB Bank|联昌国际','Public Bank|大众银行','RHB Bank'],
 PH:['BDO Unibank|金融银行','Bank of the Philippine Islands|BPI','Metrobank|首都银行','UnionBank of the Philippines'],
 ID:['Bank Central Asia|BCA 中亚银行','Bank Mandiri|曼迪利','Bank Negara Indonesia|BNI','Bank Rakyat Indonesia|BRI'],
 IN:['HDFC Bank|印度','ICICI Bank','State Bank of India|SBI 印度国家银行','Axis Bank','Kotak Mahindra Bank'],
 AU:['Commonwealth Bank|CBA 澳洲联邦','Westpac|西太平洋','ANZ|澳新银行','National Australia Bank|NAB'],
};

export const CTRY: Record<string, string> ={CN:'Chinese mainland',HK:'Hong Kong',SG:'Singapore',JP:'Japan',KR:'South Korea',
 TW:'Taiwan',US:'United States',GB:'United Kingdom',DE:'Germany',FR:'France',ES:'Spain',IT:'Italy',
 NL:'Netherlands',CH:'Switzerland',LI:'Liechtenstein',AT:'Austria',SE:'Sweden',DK:'Denmark',
 AE:'United Arab Emirates',TH:'Thailand',VN:'Vietnam',MY:'Malaysia',PH:'Philippines',
 ID:'Indonesia',IN:'India',AU:'Australia'};

/* Currency defaults are only given where this table is confident; the rest is left for the user to pick */
export const CTRY_CCY: Record<string, string> ={CN:'CNY',HK:'HKD',SG:'SGD',JP:'JPY',US:'USD'};

export interface Bank { n: string; c: string; a: string }

export const BANKS: Bank[] = Object.entries(BANK_DIR).flatMap(([c, list]) =>
  list.map(row => {
    const [n, a] = row.split('|')
    return { n: n!, c, a: a ?? '' }
  }))
