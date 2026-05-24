/**
 * Utility formatters for currency, date, and number display
 */

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('id-ID').format(num);
};

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

export const formatShortDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(d);
};

export const getPaymentMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    CASH: 'Tunai',
    TRANSFER: 'Transfer Bank',
    CREDIT: 'Kredit/Hutang',
    DEBIT_CARD: 'Kartu Debit',
    QRIS: 'QRIS',
  };
  return labels[method] || method;
};

export const getPaymentMethodIcon = (method: string): string => {
  const icons: Record<string, string> = {
    CASH: 'cash-outline',
    TRANSFER: 'swap-horizontal-outline',
    CREDIT: 'card-outline',
    DEBIT_CARD: 'card-outline',
    QRIS: 'qr-code-outline',
  };
  return icons[method] || 'ellipse-outline';
};

export const truncate = (str: string, maxLen: number): string => {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
};
