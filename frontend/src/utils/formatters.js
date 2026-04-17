let _companyCurrency = 'INR'; // default, overridden at login

export function setCompanyCurrency(code) { if (code) _companyCurrency = code; }
export function getCompanyCurrency() { return _companyCurrency; }

export function formatCurrency(amount, currency) {
  if (amount == null) return '—';
  const cur = currency || _companyCurrency;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${cur} ${parseFloat(amount).toFixed(2)}`;
  }
}

export function formatNumber(num, decimals = 0) {
  if (num == null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(num);
}

export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

export function formatDateTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function timeAgo(date) {
  if (!date) return '';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  const intervals = [
    [31536000, 'year'], [2592000, 'month'], [86400, 'day'],
    [3600, 'hour'], [60, 'minute'], [1, 'second']
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function getStatusColor(status) {
  const map = {
    draft: 'neutral', submitted: 'info', pending: 'warning',
    approved: 'success', confirmed: 'success', completed: 'success',
    rejected: 'danger', cancelled: 'danger', closed: 'neutral',
    active: 'success', inactive: 'neutral', locked: 'danger',
    in_process: 'info', delivered: 'success', invoiced: 'info',
    open: 'info', posted: 'success', reversed: 'warning',
  };
  return map[status] || 'neutral';
}

export function getInitials(firstName, lastName) {
  return `${(firstName || '')[0] || ''}${(lastName || '')[0] || ''}`.toUpperCase();
}

export function truncate(str, len = 40) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// Indian States for Place of Supply
export const INDIAN_STATES = [
  '01-Jammu & Kashmir','02-Himachal Pradesh','03-Punjab','04-Chandigarh','05-Uttarakhand',
  '06-Haryana','07-Delhi','08-Rajasthan','09-Uttar Pradesh','10-Bihar',
  '11-Sikkim','12-Arunachal Pradesh','13-Nagaland','14-Manipur','15-Mizoram',
  '16-Tripura','17-Meghalaya','18-Assam','19-West Bengal','20-Jharkhand',
  '21-Odisha','22-Chhattisgarh','23-Madhya Pradesh','24-Gujarat','25-Daman & Diu',
  '26-Dadra & Nagar Haveli','27-Maharashtra','28-Andhra Pradesh','29-Karnataka',
  '30-Goa','31-Lakshadweep','32-Kerala','33-Tamil Nadu','34-Puducherry',
  '35-Andaman & Nicobar','36-Telangana','37-Andhra Pradesh (New)','38-Ladakh'
];

// Determine GST type based on company state vs place of supply
export function getGSTType(companyState, placeOfSupply) {
  if (!companyState || !placeOfSupply) return 'cgst_sgst'; // default intra-state if unknown
  const cs = companyState.toLowerCase().replace(/[^a-z]/g, '');
  const ps = placeOfSupply.toLowerCase().replace(/[^a-z]/g, '');
  if (!cs || !ps) return 'cgst_sgst';
  return cs === ps ? 'cgst_sgst' : 'igst';
}

// Incoterms 2020 standard
export const INCOTERMS = [
  { code: 'EXW', name: 'Ex Works' },
  { code: 'FCA', name: 'Free Carrier' },
  { code: 'CPT', name: 'Carriage Paid To' },
  { code: 'CIP', name: 'Carriage & Insurance Paid' },
  { code: 'DAP', name: 'Delivered at Place' },
  { code: 'DPU', name: 'Delivered at Place Unloaded' },
  { code: 'DDP', name: 'Delivered Duty Paid' },
  { code: 'FAS', name: 'Free Alongside Ship' },
  { code: 'FOB', name: 'Free on Board' },
  { code: 'CFR', name: 'Cost and Freight' },
  { code: 'CIF', name: 'Cost Insurance & Freight' },
];
