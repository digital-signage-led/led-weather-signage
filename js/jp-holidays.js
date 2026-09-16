/**
 * 国民の祝日（振替休日・国民の休日を含む）。
 */

const cache = new Map();

export function isJapaneseHoliday(year, month, day) {
  if (!year || !month || !day) return false;
  return holidaySet(year).has(`${Number(month)}-${Number(day)}`);
}

function holidaySet(year) {
  const y = Number(year);
  if (cache.has(y)) return cache.get(y);
  const set = new Set();
  const add = (month, date) => set.add(`${month}-${date}`);

  add(1, 1);
  add(1, nthMonday(y, 1, 2));
  add(2, 11);
  add(2, 23);
  add(3, springEquinox(y));
  add(4, 29);
  add(5, 3);
  add(5, 4);
  add(5, 5);
  add(7, nthMonday(y, 7, 3));
  add(8, 11);
  add(9, nthMonday(y, 9, 3));
  add(9, autumnEquinox(y));
  add(10, nthMonday(y, 10, 2));
  add(11, 3);
  add(11, 23);

  const extras = [];
  for (const key of set) {
    const [month, date] = key.split("-").map(Number);
    if (new Date(y, month - 1, date).getDay() !== 0) continue;
    let nextMonth = month;
    let nextDate = date + 1;
    const last = new Date(y, nextMonth, 0).getDate();
    if (nextDate > last) {
      nextMonth += 1;
      nextDate = 1;
    }
    while (set.has(`${nextMonth}-${nextDate}`) || extras.includes(`${nextMonth}-${nextDate}`)) {
      nextDate += 1;
      const monthLast = new Date(y, nextMonth, 0).getDate();
      if (nextDate > monthLast) {
        nextMonth += 1;
        nextDate = 1;
      }
    }
    extras.push(`${nextMonth}-${nextDate}`);
  }
  extras.forEach((key) => set.add(key));

  const daysIn = (month) => new Date(y, month, 0).getDate();
  const shift = (month, date, delta) => {
    const stamp = new Date(y, month - 1, date + delta);
    return { month: stamp.getMonth() + 1, date: stamp.getDate() };
  };
  for (let month = 1; month <= 12; month += 1) {
    for (let date = 1; date <= daysIn(month); date += 1) {
      if (set.has(`${month}-${date}`)) continue;
      if (new Date(y, month - 1, date).getDay() === 0) continue;
      const prev = shift(month, date, -1);
      const next = shift(month, date, 1);
      if (set.has(`${prev.month}-${prev.date}`) && set.has(`${next.month}-${next.date}`)) {
        set.add(`${month}-${date}`);
      }
    }
  }

  cache.set(y, set);
  return set;
}

function nthMonday(year, month, nth) {
  const first = new Date(year, month - 1, 1).getDay();
  const firstMonday = 1 + ((8 - first) % 7);
  return firstMonday + (nth - 1) * 7;
}

function springEquinox(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnEquinox(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
