/**
 * Date and Working Days Utility for HCM Lite
 * Server local timezone: Asia/Karachi (UTC+5)
 */

const TIMEZONE = 'Asia/Karachi';

// Format Date object to YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Current date string YYYY-MM-DD in PKT
const getCurrentDateString = () => {
  const now = new Date();
  const options = { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD
  return formatter.format(now);
};

// Current time string HH:mm in PKT
const getCurrentTimeString = () => {
  const now = new Date();
  const options = { timeZone: TIMEZONE, hour12: false, hour: '2-digit', minute: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-GB', options);
  return formatter.format(now);
};

// Check if a date (YYYY-MM-DD) is on weekend or holiday
const isWeekendOrHoliday = (dateStr, weekendDays = [0, 6], holidayDateStrings = []) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 6 is Saturday

  if (weekendDays.includes(dayOfWeek)) {
    return true;
  }
  if (holidayDateStrings.includes(dateStr)) {
    return true;
  }
  return false;
};

// Get working days between startDate and endDate (inclusive)
const getWorkingDays = (startDateStr, endDateStr, weekendDays = [0, 6], holidayDateStrings = []) => {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (start > end) {
    return { count: 0, dates: [] };
  }

  const workingDates = [];
  const current = new Date(start);

  while (current <= end) {
    const dStr = formatDate(current);
    if (!isWeekendOrHoliday(dStr, weekendDays, holidayDateStrings)) {
      workingDates.push(dStr);
    }
    current.setDate(current.getDate() + 1);
  }

  return {
    count: workingDates.length,
    dates: workingDates
  };
};

// Get total working days in a calendar month (month: 1-12)
const getWorkingDaysInMonth = (year, month, weekendDays = [0, 6], holidayDateStrings = []) => {
  const lastDay = new Date(year, month, 0).getDate();
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getWorkingDays(startDateStr, endDateStr, weekendDays, holidayDateStrings);
};

// Calculate eligible working days for an employee in a given month (considering joiningDate and exitDate)
const calculateEligibleWorkingDays = (joiningDateStr, exitDateStr, year, month, weekendDays = [0, 6], holidayDateStrings = []) => {
  const lastDay = new Date(year, month, 0).getDate();
  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const effectiveStartStr = joiningDateStr && joiningDateStr > monthStartStr ? joiningDateStr : monthStartStr;
  const effectiveEndStr = exitDateStr && exitDateStr < monthEndStr ? exitDateStr : monthEndStr;

  if (effectiveStartStr > effectiveEndStr) {
    return { count: 0, dates: [] };
  }

  return getWorkingDays(effectiveStartStr, effectiveEndStr, weekendDays, holidayDateStrings);
};

// Calculate difference in minutes between HH:mm strings
const calculateTimeDiffMinutes = (startHHMM, endHHMM) => {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  return endMinutes - startMinutes;
};

module.exports = {
  formatDate,
  getCurrentDateString,
  getCurrentTimeString,
  isWeekendOrHoliday,
  getWorkingDays,
  getWorkingDaysInMonth,
  calculateEligibleWorkingDays,
  calculateTimeDiffMinutes
};
