<div align="center">

# TCRN Workflow Helper

### 手で確かめるファイルは一つだけ、一度だけ。あとはこれが代わりに拒否します

**単一ファイル、依存ゼロのブートストラップ。リリースの一行が動く前に、それが公開されたものと同一であることを証明します。**

[简体中文](./README.md) · [English](./README.en.md) · 日本語 · [한국어](./README.ko.md) · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue) ![deps](https://img.shields.io/badge/dependencies-0-success) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational) ![network](https://img.shields.io/badge/network-none-important) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue)

[まずこのファイルを確かめる](#まずこのファイルを確かめる) · [何を解決するか](#何を解決するか) · [誰のためのものか](#誰のためのものか) · [何を強制するか](#何を強制するか) · [3 分ではじめる](#3-分ではじめる) · [現在の状態](#現在の状態) · [ドキュメント](#ドキュメント)

</div>

---

## まずこのファイルを確かめる

信頼しなければならないのはブートストラップだけです。ですから、それが言うことを信じる前に、それ自体を確かめてください。コマンド一つ、比較一つです。

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

このダイジェストは三か所で公開されています。ここ、`SECURITY.md`、そして GitHub のリリースノートです。**計算した値が一致しなければ、そこで止めてください。** 何も実行せず、とりあえず試すこともしないでください。不一致は、この仕組みが働いている証拠です。

## 何を解決するか

スキルやワークフローがリポジトリから届きます。しかし、これから実行しようとしているバイト列が、誰かが実際にレビューしたバイト列であることを示すものは何もありません。

TCRN Workflow Helper は、その問題を一度の手作業の確認にまとめます。ブートストラップを確かめたあとは、どのリリースのバイト列を受け入れるかは、あなたの判断ではなく暗号によって決まります。`--force` はありません。その選択肢自体が存在しないからです。

## 誰のためのものか

| | |
| --- | --- |
| **向いている** | 自分のマシンで TCRN Workflow を動かし、コードが実行される前にバイト列を確認したい場合。一度の手作業の確認と引き換えに、以後の自動的な拒否を受け入れられる場合。 |
| **向いていない** | リリースのバイト列の出所を保証する必要がない場合、あるいはダウンロードしたものをそのまま実行して構わない場合。 |

## 何を強制するか

| 保証 | 仕組み |
| --- | --- |
| **再現可能な成果物** | スキルアーカイブ、ソースアーカイブ、SBOM は決定的です。クリーンクローンの CI がゼロから再構築し、ダイジェストがコミット済みのものと一致することを表明します。誰でもバイト列を再構築して確認できます。 |
| **正確なリリース同一性** | 受理された Workflow リリースは、リポジトリ URL、バージョン、コミット、ツリー、注釈付きタグオブジェクトで固定され、実際の Git チェックアウトに対して検査されます。Git のオブジェクト id は内容ハッシュなので、この束縛は自己認証的です。 |
| **固定されたリリースバイト** | 受理されたアーカイブと来歴のダイジェストはブートストラップ自身にコンパイルされています。それ以外のアーカイブは `IDENTITY_MISMATCH` で閉じて失敗します。 |
| **ロールバック防止** | GitHub の不変リリース：タグは動かせず、資産は差し替えられません。古いリリースも固定ダイジェストの比較に通りません。ブートストラップはそれぞれ一つのアーカイブしか受け入れないからです。 |
| **敵対的アーカイブへの防御** | パストラバーサル、絶対パス、制御文字、非 NFC パス、重複と大文字小文字の衝突、リンク、特殊ファイル、エントリ単位のダイジェスト改竄、エントリ数とバイト数の上限は、すべて展開の前に拒否されます。 |
| **稼働環境の保護** | インストール、更新、再インストール、アンインストールは、使い捨ての `tcrn-helper-test-*` ルート内でのみ動きます。`.claude` や `.codex` を含むパスは、大文字小文字を問わず、ファイルシステムを調べる前に `LIVE_LOCATION_FORBIDDEN` で拒否されます。 |
| **トランザクショナルなライフサイクル** | すべての変更は段階的でジャーナル付きのトランザクションで、クラッシュ復旧は実際の `SIGKILL` 注入で証明されています。失敗した操作はバイト単位で同一の元の状態を残し、残骸はゼロです。 |

## 3 分ではじめる

```sh
# 完全な証明スイートを走らせる（オフライン。実際の SIGKILL 障害注入を含むため 10 分から 20 分）
npm test

# 何かが実行される前にリリースバンドルを検証する
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>

# インストーラがスキルフォルダに置いた複製を読み取り専用で検証する
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <スキルフォルダ/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# 受理された Workflow チェックアウトをちょうど一つ解決する（曖昧さ、シンボリックリンク、汚れた作業ツリーは拒否）
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-チェックアウト>
```

成功すると正規形の JSON レシートが一つ出ます（`TRUST_VALIDATED`、`ROOT_RESOLVED`、`NETWORK_PLAN_APPROVED`、`INSTALL_COMPLETED`、`UNINSTALL_COMPLETED`）。失敗すると安定した理由コードが一つ出ます。その中間はありません。

## 現在の状態

- `1.0.1` は最初の受理済みリリースで、TCRN Workflow `v1.0.1` を正確に支援します。
- ブートストラップは単一ファイルです。依存ゼロ、ネットワークなし、テレメトリなし。
- ネットワーク操作は計画するだけで実行しません。`plan-network` は静的な計画を表示し、要求は一切送りません。

## ドキュメント

アーキテクチャ、コマンドリファレンス、主張とゲート、既知の限界は、TCRN Workflow リポジトリの [wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki) にあります。本リポジトリは独自の wiki を持ちません。

本リポジトリ内の文書：[コントリビュート](./CONTRIBUTING.md) · [セキュリティ](./SECURITY.md) · [行動規範](./CODE_OF_CONDUCT.md) · [リリース手順](./RELEASING.md)

## ライセンス

Apache-2.0。[LICENSE](./LICENSE) と [NOTICE](./NOTICE) を参照してください。
