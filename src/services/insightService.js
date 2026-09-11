/**
 * サイネージ向けの「ひと目情報」をデータから生成する。
 * 画面に固定文言を埋め込まない。
 */

const RAINY_CODES = new Set(["rain", "heavy_rain", "cloudy_rain", "thunder", "snow"]);

export function buildUmbrellaAdvice(today) {
  const pops = Object.values(today.rainProbability || { "12-18": 0 });
  const maxPop = Math.max(0, ...pops);
  if (RAINY_CODES.has(today.weatherCode) || maxPop >= 50) {
    return { need: true, level: "required", label: "傘が必要", detail: "雨の可能性が高めです" };
  }
  if (maxPop >= 30) {
    return { need: true, level: "optional", label: "折りたたみ傘を", detail: "急な雨に備えると安心" };
  }
  return { need: false, level: "none", label: "傘は不要", detail: "降水の可能性は低め" };
}

export function buildWeatherChangeStory(hourly, now = new Date()) {
  const upcoming = hourly.filter((item) => new Date(item.at).getTime() >= now.getTime() - 60 * 60 * 1000);
  const source = upcoming.length ? upcoming : hourly;
  if (!source.length) return [];

  const story = [{ ...source[0], kind: "current", title: "現在" }];
  let lastCode = source[0].weatherCode;

  for (const item of source.slice(1)) {
    if (item.weatherCode !== lastCode) {
      story.push({
        ...item,
        kind: "change",
        title: item.label,
        note: RAINY_CODES.has(item.weatherCode) ? "雨の可能性" : item.weather
      });
      lastCode = item.weatherCode;
    }
    if (story.length >= 4) break;
  }

  if (story.length === 1 && source[1]) {
    story.push({ ...source[1], kind: "next", title: source[1].label, note: source[1].weather });
  }
  if (story.length === 2 && source[2]) {
    story.push({ ...source[2], kind: "next", title: source[2].label, note: source[2].weather });
  }
  return story;
}

export function buildTodayHeadline(today, story, alerts, umbrella) {
  if (alerts.some((alert) => alert.level === "critical" || alert.level === "warning")) {
    const alert = alerts[0];
    return `${alert.title}発表中。外出時は最新情報を確認`;
  }
  const laterRain = story.slice(1).find((item) => RAINY_CODES.has(item.weatherCode));
  if (laterRain) {
    return `このあと${laterRain.title}ごろ${laterRain.note || laterRain.weather}`;
  }
  if (umbrella.level === "required") {
    return `${today.weather}。${umbrella.label}`;
  }
  return `${today.weather}。最高${today.tempMax}℃ / 最低${today.tempMin}℃`;
}

export function peakRainProbability(today) {
  const values = Object.values(today.rainProbability || {});
  return values.length ? Math.max(...values) : 0;
}

export function buildRegionNote(points, today) {
  const rainy = (points || []).filter((point) => RAINY_CODES.has(point.today?.weatherCode));
  if (rainy.length >= Math.ceil((points || []).length / 2)) {
    return "雨の所が多くなります。傘をご用意ください。";
  }
  if (rainy.length) {
    return `${rainy[0].name}など一部で雨の見込みです。`;
  }
  return `${today.weather}の所が多く、最高${today.tempMax}℃です。`;
}
