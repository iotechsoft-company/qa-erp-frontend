import { expect, test } from '@fixtures/test'

test.describe('Products', { tag: ['@regression', '@inventory'] }, () => {
  test('เปิดหน้ารายการสินค้าและเห็นตาราง', async ({ productsPage }) => {
    await productsPage.goto()
    await expect(productsPage.table).toBeVisible()
  })

  // TODO(codex): search / filter / pagination (nuqs URL params: page, limit, sort, filter, s)

  test.fixme('สร้างสินค้าใหม่', { tag: '@mutation' }, async ({ allowMutation, api }) => {
    void allowMutation // skip อัตโนมัติถ้า ALLOW_MUTATION=false
    void api
    // 1) เปิดฟอร์มสร้าง  2) กรอกข้อมูลด้วย uniqueName('product')  3) บันทึก  4) assert ใน list
    // cleanup: ลบผ่าน api fixture ใน afterEach
  })
})
