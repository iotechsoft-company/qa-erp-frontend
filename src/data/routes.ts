/**
 * Private routes ของ erp-frontend (apps/web/app/(private)/**\/page.tsx)
 * อัปเดตเมื่อ ERP เพิ่มหน้าใหม่
 */
export const PRIVATE_ROUTES = [
  { path: '/', name: 'dashboard' },
  { path: '/products', name: 'products' },
  { path: '/item-groups', name: 'item-groups' },
  { path: '/product-groups', name: 'product-groups' },
  { path: '/customers', name: 'customers' },
  { path: '/purchasers', name: 'purchasers' },
  { path: '/sales', name: 'sales' },
  { path: '/sales/quotations', name: 'sales-quotations' },
  { path: '/sales/orders', name: 'sales-orders' },
  { path: '/sales/delivery-notes', name: 'sales-delivery-notes' },
  { path: '/sales/create', name: 'sales-create' },
  { path: '/purchasing', name: 'purchasing' },
  { path: '/purchasing/orders', name: 'purchasing-orders' },
  { path: '/purchasing/goods-receipts', name: 'purchasing-goods-receipts' },
  { path: '/purchasing/create', name: 'purchasing-create' },
  { path: '/reports', name: 'reports' },
  { path: '/reports/sales', name: 'reports-sales' },
  { path: '/reports/purchases', name: 'reports-purchases' },
  { path: '/settings', name: 'settings' },
  { path: '/settings/shop', name: 'settings-shop' },
  { path: '/settings/sales', name: 'settings-sales' },
  { path: '/settings/item-groups', name: 'settings-item-groups' },
] as const
