/**
 * Income Tax Utility for HCM Lite (M6 Payroll)
 * Tax slabs on annual gross (gross * 12):
 * - 0 to 600k: 0
 * - 600k to 1.2M: 5% of amount over 600k
 * - 1.2M to 2.4M: 30k + 15% of amount over 1.2M
 * - 2.4M to 3.6M: 210k + 25% of amount over 2.4M
 * - Above 3.6M: 510k + 35% of amount over 3.6M
 */

const calculateAnnualTax = (annualGross) => {
  if (annualGross <= 600000) {
    return 0;
  } else if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  } else {
    return 510000 + (annualGross - 3600000) * 0.35;
  }
};

const calculateMonthlyTax = (monthlyGross) => {
  const annualGross = monthlyGross * 12;
  const annualTax = calculateAnnualTax(annualGross);
  return Math.round(annualTax / 12);
};

module.exports = {
  calculateAnnualTax,
  calculateMonthlyTax
};
