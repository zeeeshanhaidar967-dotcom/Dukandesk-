import { SaleEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from './calculations';

/**
 * Formats a clean, readable WhatsApp bill message summarizing the sale transaction.
 */
export function formatWhatsAppBillMessage(
  sale: SaleEntity,
  settings: OwnerSettingsEntity,
  options?: { customReceiptUrl?: string }
): string {
  const shopName = (settings.shopName || 'MAHARAJA MARBLE').trim();
  const shopPhone = (settings.phone || '').trim();
  const shopAddress = (settings.address || '').trim();
  const currencySymbol = settings.currencySymbol || '₹';

  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const formattedDate = saleDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = saleDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const lines: string[] = [];

  // Header
  lines.push(`🧾 *${shopName.toUpperCase()}*`);
  lines.push(`*INVOICE / BILL DETAILS*`);
  lines.push(`───────────────────`);
  lines.push(`📄 *Invoice No:* #${sale.billNumber}`);
  lines.push(`📅 *Date:* ${formattedDate} at ${formattedTime}`);
  lines.push(`👤 *Customer:* ${sale.customerName}`);
  if (sale.customerPhone) {
    lines.push(`📱 *Phone:* ${sale.customerPhone}`);
  }
  lines.push(`───────────────────`);

  // Itemized summary
  lines.push(`*ITEMS PURCHASED:*`);
  if (sale.items && sale.items.length > 0) {
    sale.items.forEach((item, index) => {
      lines.push(
        `${index + 1}. *${item.productName}*\n   Qty: ${item.quantity} ${item.unit} @ ${formatCurrency(item.sellingPrice, currencySymbol)} = *${formatCurrency(item.subtotal, currencySymbol)}*`
      );
    });
  } else {
    lines.push(`   (Items as agreed)`);
  }

  lines.push(`───────────────────`);
  lines.push(`💰 *Total Bill:* ${formatCurrency(sale.totalBill, currencySymbol)}`);
  lines.push(`✅ *Amount Paid:* ${formatCurrency(sale.amountPaid, currencySymbol)} (${sale.paymentMethod})`);

  if (sale.balanceDue > 0) {
    lines.push(`⚠️ *Balance Due:* ${formatCurrency(sale.balanceDue, currencySymbol)}`);
  } else {
    lines.push(`✨ *Balance Due:* ${formatCurrency(0, currencySymbol)} (Fully Paid)`);
  }

  if (sale.notes && sale.notes.trim()) {
    lines.push(`📝 *Note:* ${sale.notes.trim()}`);
  }

  if (options?.customReceiptUrl) {
    lines.push(`───────────────────`);
    lines.push(`🔗 *View Receipt Online:* ${options.customReceiptUrl}`);
  }

  lines.push(`───────────────────`);
  lines.push(`🙏 _Thank you for your business!_`);
  if (shopPhone || shopAddress) {
    lines.push(`📍 ${[shopAddress, shopPhone ? `Contact: ${shopPhone}` : ''].filter(Boolean).join(' | ')}`);
  }

  return lines.join('\n');
}

/**
 * Cleans phone number to an international format (defaults to +91 India if 10-digit number without country code).
 * Strips out spaces, dashes, parentheses, plus signs.
 */
export function cleanWhatsAppPhoneNumber(phoneInput?: string): string {
  if (!phoneInput) return '';

  // Remove spaces, hyphens, brackets, non-numeric characters (keep digits only)
  let digits = phoneInput.replace(/\D/g, '');

  if (!digits) return '';

  // If phone begins with 0, strip leading 0
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // If 10 digits (standard Indian mobile number), prepend 91
  if (digits.length === 10) {
    digits = '91' + digits;
  }

  return digits;
}

/**
 * Builds the WhatsApp direct chat link.
 * If phone number is valid, links to wa.me/{cleanPhone}?text={encoded}
 * If phone number is empty, links to api.whatsapp.com/send?text={encoded}
 */
export function buildWhatsAppShareUrl(
  sale: SaleEntity,
  settings: OwnerSettingsEntity,
  customPhone?: string,
  receiptUrl?: string
): string {
  const phone = cleanWhatsAppPhoneNumber(customPhone || sale.customerPhone);
  const message = formatWhatsAppBillMessage(sale, settings, { customReceiptUrl: receiptUrl });
  const encodedMessage = encodeURIComponent(message);

  if (phone) {
    return `https://wa.me/${phone}?text=${encodedMessage}`;
  }

  return `https://api.whatsapp.com/send?text=${encodedMessage}`;
}

/**
 * Opens the WhatsApp send link in a new browser tab/window safely.
 */
export function openWhatsAppShare(
  sale: SaleEntity,
  settings: OwnerSettingsEntity,
  customPhone?: string,
  receiptUrl?: string
): void {
  const url = buildWhatsAppShareUrl(sale, settings, customPhone, receiptUrl);
  window.open(url, '_blank', 'noopener,noreferrer');
}
