import { expect, type Page } from '@playwright/test'

import { type CustomerInput, type SupplierInput } from '@data/factories'

import { BasePage } from './base.page'
import { ConfirmDialog, DataTable, MuiSelect, Notification, SearchBox } from './components'

export type PartyInput = CustomerInput | SupplierInput
export type PartyText = {
  entity: string
  title: string
  searchPlaceholder: string
  endpoint: string
}

/** Shared customer/supplier list and drawer, as rendered by the shared ERP form components. */
export abstract class PartyListPage extends BasePage {
  readonly dataTable: DataTable
  readonly table
  readonly search: SearchBox
  readonly confirmDialog: ConfirmDialog
  readonly notification: Notification

  constructor(
    page: Page,
    readonly text: PartyText,
  ) {
    super(page)
    this.dataTable = new DataTable(page)
    this.table = this.dataTable.root
    this.search = new SearchBox(page, text.searchPlaceholder, `/api${text.endpoint}`)
    this.confirmDialog = new ConfirmDialog(page)
    this.notification = new Notification(this.alert)
  }

  get codeColumn() {
    return `รหัส${this.text.entity}`
  }
  get emptyText() {
    return `ไม่พบข้อมูล${this.text.entity}`
  }
  get code() {
    return this.page.getByRole('textbox', { name: this.codeColumn })
  }
  get nameTh() {
    return this.page.getByRole('textbox', { name: `ชื่อ${this.text.entity} (ภาษาไทย)` })
  }
  get nameEn() {
    return this.page.getByRole('textbox', { name: `ชื่อ${this.text.entity} (ภาษาอังกฤษ)` })
  }
  get taxId() {
    return this.page.getByRole('textbox', { name: 'เลขประจำตัวผู้เสียภาษี' })
  }
  get phone() {
    return this.page.getByRole('textbox', { name: 'เบอร์โทรศัพท์ติดต่อ' })
  }
  get address() {
    return this.page.getByRole('textbox', { name: 'ที่อยู่', exact: true })
  }
  get creditTerms() {
    return this.page.getByRole('spinbutton', { name: 'เงื่อนไขเครดิต (วัน)' })
  }
  get active() {
    return this.page.getByRole('switch', { name: `เปิดใช้งานสถานะ${this.text.entity}` })
  }
  get vatRegistered() {
    return this.page.getByRole('switch', { name: 'จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)' })
  }

  override async waitForReady() {
    await super.waitForReady()
    await expect(this.page.getByRole('heading', { name: this.text.title, exact: true })).toBeVisible()
    await expect(this.page.getByRole('button', { name: `เพิ่ม${this.text.entity}`, exact: true })).toBeEnabled()
    await expect(
      this.table
        .getByRole('button', { name: 'แก้ไข', exact: true })
        .first()
        .or(this.table.getByText(this.emptyText, { exact: true })),
    ).toBeVisible()
  }

  async openCreate() {
    await this.page.getByRole('button', { name: `เพิ่ม${this.text.entity}`, exact: true }).click()
    await expect(this.nameTh).toBeVisible()
  }

  async fillForm(input: PartyInput) {
    await this.code.fill(input.code)
    await this.nameTh.fill(input.name_th)
    await this.nameEn.fill(input.name_en ?? '')
    await this.taxId.fill(input.tax_id)
    const type = 'customer_type' in input ? input.customer_type : (input as SupplierInput).supplier_type
    await new MuiSelect(this.page, this.page.getByRole('combobox', { name: `ประเภท${this.text.entity}` })).choose(
      type === 'individual' ? 'บุคคลธรรมดา' : 'นิติบุคคล / บริษัท',
    )
    await this.phone.fill(input.contact_phone ?? '')
    await this.address.fill(input.address ?? '')
    await this.creditTerms.fill(input.credit_terms === undefined ? '' : String(input.credit_terms))
    await this.active.setChecked(input.is_active ?? true)
    await this.vatRegistered.setChecked(input.is_vat_registered ?? true)
  }

  async selectGroup(label: string) {
    await new MuiSelect(
      this.page,
      this.page.getByRole('combobox', { name: `กลุ่ม${this.text.entity}`, exact: true }),
    ).choose(label)
  }

  async save(edit = false) {
    await this.page.getByRole('button', { name: edit ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล', exact: true }).click()
  }

  async submit(edit = false) {
    const response = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.startsWith(`/api${this.text.endpoint}`) &&
        res.request().method() === (edit ? 'PUT' : 'POST'),
    )
    const [saved] = await Promise.all([response, this.save(edit)])
    expect(saved.ok()).toBe(true)
    const json = (await saved.json()) as { data: { id: string } }
    await expect(this.nameTh).toBeHidden()
    await expect(this.table.getByRole('columnheader', { name: this.codeColumn, exact: true })).toBeVisible()
    return json.data.id
  }

  async edit(code: string) {
    await this.dataTable.row(code).getByRole('button', { name: 'แก้ไข', exact: true }).click()
    await expect(this.code).toHaveValue(code)
  }

  async openDelete(code: string) {
    await this.dataTable.row(code).getByRole('button', { name: 'ลบ', exact: true }).click()
    await expect(this.confirmDialog.root).toContainText(`ยืนยันการลบ${this.text.entity}`)
  }

  async delete(code: string) {
    await this.openDelete(code)
    const response = this.page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.startsWith(`/api${this.text.endpoint}/`) && res.request().method() === 'DELETE',
    )
    const [deleted] = await Promise.all([response, this.confirmDialog.confirm('ยืนยันการลบ')])
    expect(deleted.ok()).toBe(true)
    await this.notification.expectMessage(`ลบข้อมูล${this.text.entity}เรียบร้อยแล้ว`)
    await expect(this.table.getByRole('columnheader', { name: this.codeColumn, exact: true })).toBeVisible()
    await expect(this.dataTable.row(code)).toHaveCount(0)
  }

  async expectSearchExisting() {
    const codes = await this.dataTable.readColumn(this.codeColumn)
    if (!codes[0]) {
      await expect(this.table.getByText(this.emptyText, { exact: true })).toBeVisible()
      return
    }
    await this.search.search(codes[0])
    await expect(this.dataTable.row(codes[0])).toBeVisible()
  }

  async expectPagination() {
    await this.dataTable.expectPagination(this.emptyText, {
      endpoint: `/api${this.text.endpoint}`,
      column: this.codeColumn,
      field: 'code',
    })
  }
}
