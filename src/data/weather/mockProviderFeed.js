/**
 * モック気象フィード。
 * 外部APIに似せた「取得直後」の形。テンプレートはこのファイルを直接読まない。
 * 実API接続時は weatherService の provider だけ差し替える。
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const REGION_CLIMATE = {
  HOKKAIDO: { max: 23, min: 14, wind: "北西", codes: ["cloudy", "rain", "cloudy", "sunny_cloudy", "cloudy", "sunny", "rain"] },
  TOHOKU: { max: 27, min: 18, wind: "東", codes: ["cloudy", "sunny_cloudy", "rain", "cloudy", "sunny", "cloudy", "sunny_cloudy"] },
  KANTO: { max: 32, min: 24, wind: "南", codes: ["sunny", "sunny_cloudy", "cloudy", "rain", "cloudy_rain", "sunny", "sunny_cloudy"] },
  HOKURIKU: { max: 29, min: 21, wind: "西", codes: ["cloudy", "rain", "cloudy_rain", "cloudy", "sunny_cloudy", "cloudy", "rain"] },
  TOKAI: { max: 33, min: 24, wind: "南", codes: ["sunny", "sunny_cloudy", "cloudy", "rain", "sunny", "sunny_cloudy", "cloudy"] },
  KINKI: { max: 32, min: 24, wind: "南", codes: ["sunny", "sunny_cloudy", "cloudy", "cloudy_rain", "rain", "sunny", "sunny_cloudy"] },
  CHUGOKU: { max: 31, min: 23, wind: "南西", codes: ["sunny_cloudy", "sunny", "cloudy", "rain", "cloudy", "sunny", "sunny_cloudy"] },
  SHIKOKU: { max: 31, min: 23, wind: "南東", codes: ["sunny", "cloudy", "rain", "cloudy_rain", "sunny_cloudy", "sunny", "cloudy"] },
  KYUSHU: { max: 31, min: 24, wind: "南", codes: ["cloudy_rain", "rain", "thunder", "cloudy", "sunny_cloudy", "sunny", "cloudy"] },
  OKINAWA: { max: 31, min: 26, wind: "東", codes: ["sunny_cloudy", "cloudy", "rain", "thunder", "cloudy_rain", "sunny", "sunny_cloudy"] }
};

const CODE_TO_JMA = {
  sunny: "100",
  sunny_cloudy: "101",
  cloudy: "200",
  cloudy_sunny: "201",
  cloudy_rain: "202",
  rain: "300",
  heavy_rain: "302",
  snow: "400",
  thunder: "350"
};

/**
 * デモ用の警報。近畿全県ではなく大阪府の予報区域だけに紐づける。
 */
const MOCK_ALERTS = [
  {
    id: "WRN-20260909-OSAKA-HEAVYRAIN",
    event: "大雨警報",
    code: "03",
    severity: "warning",
    office: "270000",
    areas: [{ code: "270000", name: "大阪府" }],
    issued: "2026-09-09T10:15:00+09:00",
    headline: "大阪市を含む大阪府に大雨警報。川の増水と低い土地の浸水に注意。"
  },
  {
    id: "ADV-20260909-TOKYO-THUNDER",
    event: "雷注意報",
    code: "14",
    severity: "advisory",
    office: "130000",
    areas: [{ code: "130000", name: "東京都" }],
    issued: "2026-09-09T09:40:00+09:00",
    headline: "午後は大気の状態が不安定。急な強い雨と雷に注意。"
  }
];

export function buildMockProviderFeed(region, now = new Date()) {
  const climate = REGION_CLIMATE[region.id] || REGION_CLIMATE.KANTO;
  const timeseries = region.displayPoints.map((point, pointIndex) => {
    const offset = (pointIndex % 3) - 1;
    return {
      stationId: point.id,
      stationName: point.name,
      areaCode: point.forecastAreaId,
      prefectureId: point.prefectureId,
      today: buildToday(climate, offset, now),
      hourly: buildHourly(climate, offset, now),
      weekly: buildWeekly(climate, offset, now)
    };
  });

  return {
    provider: "mock-jma",
    fetchedAt: now.toISOString(),
    office: {
      regionId: region.id,
      regionName: region.name
    },
    timeseries,
    warnings: MOCK_ALERTS.filter((alert) =>
      region.prefectures.some((pref) => pref.jmaOffice === alert.office)
    )
  };
}

function buildToday(climate, offset, now) {
  const code = climate.codes[now.getDay() % climate.codes.length];
  return {
    weatherCode: CODE_TO_JMA[code],
    weatherText: code,
    tempMax: climate.max + offset,
    tempMin: climate.min + offset,
    pops: {
      "00-06": clampPop(10 + offset * 5),
      "06-12": clampPop(code.includes("rain") ? 50 : 15 + offset * 8),
      "12-18": clampPop(code.includes("rain") || code === "thunder" ? 70 : 20 + offset * 10),
      "18-24": clampPop(code === "rain" || code === "thunder" ? 60 : 25 + offset * 6)
    },
    wind: { dir: climate.wind, speed: 3 + Math.abs(offset) }
  };
}

function buildHourly(climate, offset, now) {
  const hours = [];
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(Math.floor(now.getHours() / 3) * 3);
  const todayCode = climate.codes[now.getDay() % climate.codes.length];

  for (let i = 0; i < 16; i += 1) {
    const at = new Date(start.getTime() + i * 3 * 60 * 60 * 1000);
    const code = pickHourlyCode(climate, i, todayCode);
    hours.push({
      time: at.toISOString(),
      weatherCode: CODE_TO_JMA[code],
      weatherText: code,
      temp: Math.round(climate.min + offset + (climate.max - climate.min) * daytimeFactor(at.getHours())),
      pop: clampPop(code.includes("rain") || code === "thunder" ? 55 + i * 2 : 8 + i * 3),
      wind: { dir: climate.wind, speed: 2 + (i % 4) }
    });
  }
  return hours;
}

function buildWeekly(climate, offset, now) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const code = climate.codes[(date.getDay() + offset + 7) % climate.codes.length];
    days.push({
      date: formatDate(date),
      weekday: WEEKDAYS[date.getDay()],
      weatherCode: CODE_TO_JMA[code],
      weatherText: code,
      tempMax: climate.max + offset - Math.min(i, 3),
      tempMin: climate.min + offset - Math.min(i, 2),
      pop: clampPop(code.includes("rain") || code === "thunder" ? 60 : 10 + i * 8)
    });
  }
  return days;
}

function pickHourlyCode(climate, index, todayCode) {
  if (index === 0) return todayCode;
  if (index === 1) return climate.codes[1] || "cloudy";
  if (index >= 2 && index <= 4) return climate.codes[2] || "rain";
  return climate.codes[(index + 3) % climate.codes.length];
}

function daytimeFactor(hour) {
  const peak = 1 - Math.abs(hour - 14) / 14;
  return Math.max(0.15, peak);
}

function clampPop(value) {
  return Math.max(0, Math.min(90, Math.round(value / 10) * 10));
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
