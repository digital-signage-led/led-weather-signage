# 気象庁公式天気アイコン

デジタルサイネージ向けに、気象庁公開の天気予報SVGをローカル保存した素材です。

## 構成

```
weather-icons-jma/
├─ icons/                 公式SVG（加工なし）
├─ weather-codes.js       コード・名称・取得成否のマスター
├─ catalog.js             一覧の描画と検索
├─ index.html             確認用画面
├─ weather-codes.csv      コード対応表
├─ download-report.csv    取得結果
├─ SOURCE_NOTICE.txt      出典
├─ README.md
└─ scripts/download.mjs   公式SVGの再取得
```

直し方:

- 名称や対象コードを変える → `weather-codes.js` の `WEATHER_LABELS`
- 一覧の見た目を変える → `index.html` の CSS、または `catalog.js`
- SVGを取り直す → `node scripts/download.mjs`

## 取得結果

気象庁の `{コード}.svg` を118件すべて確認しました。サーバー上に実ファイルがあるのは30件です。404のコードは別アイコンで埋めていません。

- 対象コード数: 118
- 取得成功数: 30
- 取得失敗数: 88
- SVG検証成功数: 30

実在したSVG: 100, 101, 102, 104, 110, 112, 115, 200, 201, 202, 204, 210, 212, 215, 300, 301, 302, 303, 308, 311, 313, 314, 400, 401, 402, 403, 406, 411, 413, 414

気象庁の予報画面では、複数コードが同じSVGファイル名を共有します。このパックはその複製保存はしていません。

## 使い方

```javascript
const { label, icon } = getWeatherIcon(101);
// 公式ファイルが無いコードは icon === null
```

128×128px の表示はSVGを加工せず、CSSで中央配置します。

```css
.weather-icon-frame {
  width: 128px;
  height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000000;
}
.weather-icon {
  width: 116px;
  height: 116px;
  object-fit: contain;
}
```

## 注意

- 本番では気象庁サーバーへ直リンクせず、`icons/` を使ってください。
- SVGの形・色・配置は変更していません。
- 利用規約: https://www.jma.go.jp/jma/kishou/info/coment.html
- 出典は `SOURCE_NOTICE.txt` と一覧画面にあります。SVG内部へは埋め込んでいません。
