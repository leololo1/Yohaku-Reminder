# iOS artifact submit メモ

GitHub Actions で生成した `ios-build` artifact から `.ipa` を取り出し、必要に応じて `eas submit` するためのメモです。

## artifact の展開

```powershell
if (Test-Path .\build\ios-build) { Remove-Item -LiteralPath .\build\ios-build -Recurse -Force }
if (Test-Path .\build\build.ipa) { Remove-Item -LiteralPath .\build\build.ipa -Force }
Expand-Archive -LiteralPath .\build\ios-build.zip -DestinationPath .\build -Force
```

## 中身の確認

```powershell
Get-ChildItem -LiteralPath .\build -Force
```

## submit する場合

`eas.json` に `submit.production.ios.ascAppId` を追加後、`develop` ブランチで実行します。

```powershell
git switch develop
npx eas-cli submit --platform ios --path .\build\build.ipa --profile production --non-interactive
```
