import { DataTable } from '@pages/components'
import { expect, test } from '@fixtures/test'

test(
  'named table columns preserve row identity across column order and colspan loading rows',
  {
    tag: ['@shared', '@regression'],
  },
  async ({ page }) => {
    const table = new DataTable(page)
    const rows = Array.from({ length: 33 }, (_, i) => ({ รหัส: `E2E-${i}`, ชื่อภาษาไทย: `เครื่องเขียน ${i}` }))
    for (const columns of [
      ['รหัส', 'ชื่อภาษาไทย'],
      ['ชื่อภาษาไทย', 'รหัส'],
    ] as const) {
      await page.setContent(`<table><thead><tr>${columns.map((name) => `<th>${name}</th>`).join('')}</tr></thead>
      <tbody><tr><td colspan="2">กำลังโหลด</td></tr>${rows
        .map((row) => `<tr>${columns.map((column) => `<td><p>${row[column]}</p></td>`).join('')}</tr>`)
        .join('')}</tbody></table>`)
      expect(await table.readColumn('รหัส')).toEqual(rows.map((row) => row['รหัส']))
      expect(await table.readColumn('ชื่อภาษาไทย')).toEqual(rows.map((row) => row['ชื่อภาษาไทย']))
    }
  },
)
