# iOS signing / GitHub Secrets セットアップ

`sabolog` と同じ方針で、Windows 上で開発しつつ GitHub Actions の macOS runner で `eas build --local` を回す前提です。

## 必要な GitHub Secrets

- `EXPO_TOKEN`
- `EAS_PROJECT_ID`
- `APPLE_CERTIFICATE_P12`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE`

## このプロジェクトで使う想定 Bundle ID

- `com.leololo1.yohakureminder`

必要ならここは変更できますが、Apple Developer 側の App ID / Profile と完全一致させてください。

## Apple 側で必要なもの

1. Apple Developer Team ID
2. App ID（Bundle ID: `com.leololo1.yohakureminder`）
3. Apple Distribution 証明書
4. App Store Connect 用 Provisioning Profile
5. App Store Connect 側のアプリ作成

## Secrets の元データ

- `APPLE_CERTIFICATE_P12`: Distribution 証明書を `.p12` 形式にしたものを Base64 化
- `APPLE_CERTIFICATE_PASSWORD`: `.p12` 作成時のパスワード
- `APPLE_PROVISIONING_PROFILE`: `.mobileprovision` を Base64 化

## Expo 側で必要なもの

1. Expo アカウントで Access Token を作成
2. `EXPO_TOKEN` として GitHub Secrets に登録
3. `npx eas-cli@latest init` 実行後の Project ID を `EAS_PROJECT_ID` として登録

## 補足

- 今回は Widget / App Group / iCloud までは入れていません
- それらが必要になった時点で、`sabolog` と同様に追加できます
