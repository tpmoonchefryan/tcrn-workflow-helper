<div align="center">

# TCRN Workflow Helper

### 手作業で確認するファイルは 1 つ、1 回だけ。あとはそれが残り全部をあなたの代わりに拒否します

**シングルファイル、依存ゼロのブートストラップ。リリースが公開されたものそのものであることを、その 1 行が実行される前に証明します。**

[简体中文](./README.md) · [English](./README.en.md) · 日本語 · [한국어](./README.ko.md) · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue?style=flat-square) ![deps](https://img.shields.io/badge/dependencies-0-success?style=flat-square) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen?style=flat-square) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical?style=flat-square)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational?style=flat-square) ![network](https://img.shields.io/badge/network-none-important?style=flat-square) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet?style=flat-square) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue?style=flat-square)

[まずこの 1 ファイルを確認する](#まずこの-1-ファイルを確認する) · [何を解決するのか](#何を解決するのか) · [誰のためのものか](#誰のためのものか) · [何を強制するのか](#何を強制するのか) · [3 分で始める](#3-分で始める) · [現在のステータス](#現在のステータス) · [ドキュメント](#ドキュメント)

</div>

<table>
<tr>
<td align="center" width="25%">

### 1
ファイル<br><sub>ブートストラップのすべて。一度で読み切れます</sub>

</td>
<td align="center" width="25%">

### 1
回の手作業確認<br><sub>1 回やれば、以後の拒否は自動です</sub>

</td>
<td align="center" width="25%">

### 0
の依存<br><sub>ネットワークなし、テレメトリなし</sub>

</td>
<td align="center" width="25%">

### 0
の `--force`<br><sub>無効化ではなく、オプションが存在しません</sub>

</td>
</tr>
</table>

---

## まずこの 1 ファイルを確認する

ブートストラップは、あなたが信頼しなければならない唯一のものです。ですから、それが言うことを信じる前に、それ自体を確認してください。コマンド 1 つ、比較 1 回です。

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

このダイジェストは 3 か所で公開されています：ここ、`SECURITY.md`、そして GitHub のリリースノート。互いに突き合わせられる独立した 3 つのソースです。

> [!IMPORTANT]
> 計算結果が一致しなければ、そこで止めてください。何も実行せず、「とりあえず試す」もしないでください。不一致は、この仕組みが機能している証拠です。

---

## 何を解決するのか

スキルやワークフローがリポジトリから届きます。しかし、これから実行しようとしているバイト列が、誰かが実際にレビューしたバイト列であることを証明するものは何もありません。

TCRN Workflow Helper は、この問題を手作業の確認 1 回に収束させます。ブートストラップを確認したあとは、どのリリースバイト列を受け入れるかは、あなたの判断ではなく暗号によって決まります。

`--force` はありません。オプションが存在しないからです。デフォルトでオフのスイッチでもなく、確認を挟む危険な操作でもありません。このプログラムに存在しないのです。

---

## 誰のためのものか

| ✓ 向いているのは | ✗ 向いていないのは |
| :--- | :--- |
| 自分のマシンで TCRN Workflow を実行し、コードが動く前にバイト列を確認したい。 | リリースバイト列の来歴保証を必要としていない。 |
| 手作業の確認 1 回と引き換えに、以後の自動拒否を受け入れる。 | ダウンロードしたものをそのまま実行して構わない。 |

---

## 何を強制するのか

| 保証 | 仕組み |
| :--- | :--- |
| **再現可能な成果物** | スキルアーカイブ、ソースアーカイブ、SBOM はすべて決定的です。CI がクリーンなクローンからゼロで再構築し、ダイジェストがコミット済みのものと一致することをアサートします。誰でもバイト列を再構築して確認できます。 |
| **正確なリリースアイデンティティ** | 受理された Workflow のバージョンは、リポジトリ URL、バージョン、コミット、ツリー、注釈付きタグオブジェクトで固定され、実際の Git チェックアウトに対して検証されます。Git のオブジェクト id はコンテンツハッシュなので、この結び付き自体が自己認証します。 |
| **固定されたリリースバイト列** | 受理されたアーカイブとプロベナンスのダイジェストは、ブートストラップ自身にコンパイルされています。それ以外のアーカイブは `IDENTITY_MISMATCH` でフェイルクローズします。 |
| **ロールバック防止** | GitHub のイミュータブルリリース：タグは移動できず、アセットは差し替えられません。過去のリリースもダイジェスト比較を通りません。各ブートストラップが受け入れるアーカイブはちょうど 1 つだからです。 |
| **敵対的アーカイブへの防御** | パストラバーサル、絶対パス、制御文字、非 NFC パス、重複およびケース衝突するパス、リンク、特殊ファイル、エントリ単位のダイジェスト改竄、エントリ数とバイト数の上限。すべて展開前に拒否されます。 |
| **本番環境に触れない** | インストール、更新、再インストール、アンインストールは使い捨ての `tcrn-helper-test-*` ルート内でのみ動作します。`.claude` または `.codex` を含むパスは、大文字小文字を問わず、ファイルシステムを調べる前に `LIVE_LOCATION_FORBIDDEN` で拒否されます。 |
| **トランザクショナルなライフサイクル** | すべての変更はステージングされジャーナルに記録されたトランザクションで、そのクラッシュリカバリは実際の `SIGKILL` 注入によって証明されています。失敗した操作は、直前の状態をバイト単位でそのまま残し、残骸を作りません。 |

---

## 3 分で始める

```sh
# 完全な証明スイートを実行（オフライン。実際の SIGKILL 注入を含むため 10〜20 分かかります）
npm test

# 何かが実行される前に、リリースセットを検証する
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>
```

<details>
<summary><b>残りのブートストラップコマンド</b></summary>

<br>

```sh
# インストーラーがスキルディレクトリに置いたコピーを読み取り専用で検証する
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <スキルディレクトリ/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# 受理された Workflow チェックアウトをちょうど 1 つ解決する（曖昧さ・シンボリックリンク・汚れたツリーは拒否）
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-チェックアウト>
```

</details>

> [!NOTE]
> 成功時は正規形式の JSON レシートを 1 つ出力します（`TRUST_VALIDATED`、`ROOT_RESOLVED`、`NETWORK_PLAN_APPROVED`、`INSTALL_COMPLETED`、`UNINSTALL_COMPLETED`）。失敗時は安定したリーズンコードを 1 つ出力します。その中間はありません。

---

## 現在のステータス

- `1.0.1` は最初の受理済みバージョンで、TCRN Workflow `v1.0.1` を正確にサポートします。
- ブートストラップはシングルファイルです。依存ゼロ、ネットワークなし、テレメトリなし。
- ネットワーク操作は計画されるだけで実行されません：`plan-network` は静的な計画を表示し、リクエストを一切発行しません。

## ドキュメント

アーキテクチャ、コマンドリファレンス、判定基準とゲート、既知の制限は、TCRN Workflow リポジトリの **[GitHub Wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)** にあります。このリポジトリは独自の Wiki を持ちません。

このリポジトリ内のドキュメント：[コントリビュート](./CONTRIBUTING.md) · [セキュリティ](./SECURITY.md) · [行動規範](./CODE_OF_CONDUCT.md) · [リリース手順](./RELEASING.md)

## ライセンス

Apache-2.0。[LICENSE](./LICENSE) と [NOTICE](./NOTICE) を参照してください。
