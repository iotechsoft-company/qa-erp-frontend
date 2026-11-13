import { faker, fakerTH } from '@faker-js/faker'

/**
 * Thai realistic primitives — ใช้ร่วมกันใน factory ทุกตัว
 * (fakerTH ให้ชื่อคนได้ดี แต่ที่อยู่/บริษัทไม่สมจริง จึง curate เอง)
 */

const pick = <T>(arr: readonly T[]): T => faker.helpers.arrayElement(arr)

// ─── Location ───────────────────────────────────────────────
const LOCATIONS = [
  { province: 'กรุงเทพมหานคร', district: 'เขตบางรัก', subdistrict: 'แขวงสีลม', postcode: '10500', phonePrefix: '02' },
  { province: 'กรุงเทพมหานคร', district: 'เขตจตุจักร', subdistrict: 'แขวงจอมพล', postcode: '10900', phonePrefix: '02' },
  { province: 'กรุงเทพมหานคร', district: 'เขตบางนา', subdistrict: 'แขวงบางนาใต้', postcode: '10260', phonePrefix: '02' },
  { province: 'นนทบุรี', district: 'อำเภอปากเกร็ด', subdistrict: 'ตำบลบางตลาด', postcode: '11120', phonePrefix: '02' },
  { province: 'สมุทรปราการ', district: 'อำเภอบางพลี', subdistrict: 'ตำบลบางพลีใหญ่', postcode: '10540', phonePrefix: '02' },
  { province: 'ชลบุรี', district: 'อำเภอศรีราชา', subdistrict: 'ตำบลทุ่งสุขลา', postcode: '20230', phonePrefix: '038' },
  { province: 'ระยอง', district: 'อำเภอปลวกแดง', subdistrict: 'ตำบลมาบยางพร', postcode: '21140', phonePrefix: '038' },
  {
    province: 'เชียงใหม่',
    district: 'อำเภอเมืองเชียงใหม่',
    subdistrict: 'ตำบลช้างคลาน',
    postcode: '50100',
    phonePrefix: '053',
  },
  { province: 'ขอนแก่น', district: 'อำเภอเมืองขอนแก่น', subdistrict: 'ตำบลในเมือง', postcode: '40000', phonePrefix: '043' },
  { province: 'สงขลา', district: 'อำเภอหาดใหญ่', subdistrict: 'ตำบลหาดใหญ่', postcode: '90110', phonePrefix: '074' },
] as const

const ROADS = [
  'ถนนสีลม',
  'ถนนพหลโยธิน',
  'ถนนสุขุมวิท',
  'ถนนบางนา-ตราด',
  'ถนนแจ้งวัฒนะ',
  'ถนนมิตรภาพ',
  'ถนนนิมมานเหมินท์',
  'ถนนเพชรเกษม',
]

export const thaiAddress = () => {
  const loc = pick(LOCATIONS)
  const no = `${faker.number.int({ min: 1, max: 999 })}/${faker.number.int({ min: 1, max: 99 })}`
  const moo = faker.datatype.boolean() ? ` หมู่ ${faker.number.int({ min: 1, max: 12 })}` : ''
  return {
    ...loc,
    line: `${no}${moo} ${pick(ROADS)} ${loc.subdistrict} ${loc.district} ${loc.province} ${loc.postcode}`,
  }
}

// ─── Phone ──────────────────────────────────────────────────
export const thaiLandline = (prefix: string = '02') =>
  prefix === '02'
    ? `02-${faker.string.numeric(3)}-${faker.string.numeric(4)}`
    : `${prefix}-${faker.string.numeric(3)}-${faker.string.numeric(3)}`

export const thaiMobile = () =>
  `${pick(['081', '082', '086', '089', '092', '095', '098'])}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`

// ─── Tax ID (13 หลัก + check digit ตามสูตรกรมสรรพากร) ─────────
const withCheckDigit = (twelve: string) => {
  const sum = [...twelve].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0)
  return twelve + ((11 - (sum % 11)) % 10).toString()
}

/** นิติบุคคล: 0-1055-YY-xxxxx-c (บริษัทจำกัด กทม.) */
export const thaiCorporateTaxId = () =>
  withCheckDigit(`01055${faker.string.numeric({ length: 2, allowLeadingZeros: true })}${faker.string.numeric(5)}`)

/** บุคคลธรรมดา: เลขบัตรประชาชน ขึ้นต้น 1–8 */
export const thaiPersonalTaxId = () =>
  withCheckDigit(`${faker.number.int({ min: 1, max: 8 })}${faker.string.numeric(11)}`)

export const isValidThaiTaxId = (id: string) => /^\d{13}$/.test(id) && withCheckDigit(id.slice(0, 12)) === id

// ─── Person / Company ───────────────────────────────────────
export const thaiPersonName = () => `${fakerTH.person.firstName()} ${fakerTH.person.lastName()}`

export const thaiContactPerson = () => `คุณ${fakerTH.person.firstName()}`

const COMPANY_WORDS = [
  'รุ่งเรือง',
  'เจริญ',
  'ศรีสยาม',
  'ไทยพัฒนา',
  'สหกิจ',
  'มั่นคง',
  'ทรัพย์สมบูรณ์',
  'ก้าวหน้า',
  'ธนกิจ',
  'เอเชีย',
  'อุตสาหกรรม',
  'เทรดดิ้ง',
  'ซัพพลาย',
  'วิศวกรรม',
  'อินเตอร์',
]
const COMPANY_EN: Record<string, string> = {
  รุ่งเรือง: 'Rungrueang',
  เจริญ: 'Charoen',
  ศรีสยาม: 'Sri Siam',
  ไทยพัฒนา: 'Thai Pattana',
  สหกิจ: 'Sahakij',
  มั่นคง: 'Mankong',
  ทรัพย์สมบูรณ์: 'Sap Somboon',
  ก้าวหน้า: 'Kaonah',
  ธนกิจ: 'Thanakij',
  เอเชีย: 'Asia',
  อุตสาหกรรม: 'Industry',
  เทรดดิ้ง: 'Trading',
  ซัพพลาย: 'Supply',
  วิศวกรรม: 'Engineering',
  อินเตอร์: 'Inter',
}

export const thaiCompany = () => {
  const words = faker.helpers.arrayElements(COMPANY_WORDS, 2)
  const kind = pick([
    { th: (n: string) => `บริษัท ${n} จำกัด`, en: (n: string) => `${n} Co., Ltd.` },
    { th: (n: string) => `บริษัท ${n} จำกัด (มหาชน)`, en: (n: string) => `${n} PCL.` },
    { th: (n: string) => `ห้างหุ้นส่วนจำกัด ${n}`, en: (n: string) => `${n} Ltd., Part.` },
  ])
  return {
    name_th: kind.th(words.join('')),
    name_en: kind.en(words.map((w) => COMPANY_EN[w]).join(' ')),
    alias:
      words
        .map((w) => COMPANY_EN[w]!.charAt(0))
        .join('')
        .toUpperCase() + faker.string.alpha({ length: 1, casing: 'upper' }),
  }
}

// ─── Product catalog ────────────────────────────────────────
export const PRODUCT_CATALOG = [
  { th: 'ปากกาเจล 0.5 มม. สีน้ำเงิน', en: 'Gel Pen 0.5mm Blue', sku: 'PEN-GEL-BL' },
  { th: 'กระดาษถ่ายเอกสาร A4 80 แกรม', en: 'Copy Paper A4 80gsm', sku: 'PPR-A4-80' },
  { th: 'แฟ้มสันกว้าง 3 นิ้ว', en: 'Lever Arch File 3"', sku: 'FIL-LA-3' },
  { th: 'น้ำดื่ม 600 มล. แพ็ค 12', en: 'Drinking Water 600ml x12', sku: 'BEV-WTR-600' },
  { th: 'กาแฟสำเร็จรูป 3in1 ห่อ 27 ซอง', en: 'Instant Coffee 3in1 27 sachets', sku: 'BEV-COF-3IN1' },
  { th: 'ถุงมือไนไตรล์ ไซส์ M กล่อง 100 ชิ้น', en: 'Nitrile Gloves M 100pcs', sku: 'PPE-GLV-M' },
  { th: 'หน้ากากอนามัย 3 ชั้น กล่อง 50 ชิ้น', en: 'Surgical Mask 3-ply 50pcs', sku: 'PPE-MSK-50' },
  { th: 'สายไฟ VAF 2x1.5 ม้วน 100 เมตร', en: 'VAF Cable 2x1.5 100m', sku: 'ELE-VAF-215' },
  { th: 'หลอดไฟ LED 9W แสงขาว', en: 'LED Bulb 9W Daylight', sku: 'ELE-LED-9W' },
  { th: 'น้ำยาล้างจาน 3.6 ลิตร', en: 'Dishwashing Liquid 3.6L', sku: 'CLN-DSH-36' },
  { th: 'ปูนซีเมนต์ปอร์ตแลนด์ 50 กก.', en: 'Portland Cement 50kg', sku: 'CON-CEM-50' },
  { th: 'สกรูเกลียวปล่อย #8x1" กล่อง 100 ตัว', en: 'Self-tapping Screw #8x1" 100pcs', sku: 'HDW-SCR-81' },
] as const

export const thaiProduct = () => pick(PRODUCT_CATALOG)

/** ราคาแบบสมจริง (ลงท้าย .00 / .50 / 9.00) */
export const thaiPrice = (min = 10, max = 5000) => {
  const base = faker.number.int({ min, max })
  return pick([base, base + 0.5, Math.max(min, Math.floor(base / 10) * 10 - 1)])
}
