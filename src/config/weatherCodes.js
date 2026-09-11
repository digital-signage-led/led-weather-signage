/**
 * 正規化後の天気コード。
 * 外部APIのコードは normalizer でここに落とす。テンプレートはこれだけを見る。
 */

export const WEATHER_CODES = {
  sunny: { label: "晴れ", icon: "sunny", tone: "sunny" },
  sunny_cloudy: { label: "晴れ時々曇り", icon: "sunny_cloudy", tone: "sunny" },
  cloudy: { label: "曇り", icon: "cloudy", tone: "cloudy" },
  cloudy_sunny: { label: "曇り時々晴れ", icon: "sunny_cloudy", tone: "cloudy" },
  cloudy_rain: { label: "曇り時々雨", icon: "cloudy_rain", tone: "rain" },
  rain: { label: "雨", icon: "rain", tone: "rain" },
  heavy_rain: { label: "強い雨", icon: "rain", tone: "rain" },
  snow: { label: "雪", icon: "snow", tone: "snow" },
  thunder: { label: "雷", icon: "thunder", tone: "thunder" }
};

export const ALERT_LEVELS = {
  advisory: { label: "注意報", token: "--alert-advisory" },
  warning: { label: "警報", token: "--alert-warning" },
  critical: { label: "重大警報", token: "--alert-critical" }
};

export function getWeatherMeta(code) {
  return WEATHER_CODES[code] || WEATHER_CODES.cloudy;
}
