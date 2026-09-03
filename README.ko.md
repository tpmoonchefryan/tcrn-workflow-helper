<div align="center">

# TCRN Workflow Helper

### 손으로 확인하는 파일은 하나, 한 번뿐입니다. 그다음부터는 나머지 전부를 대신 거부합니다

**단일 파일, 의존성 제로 부트스트랩. 릴리스가 공개된 바로 그것임을, 한 줄이 실행되기 전에 증명합니다.**

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md) · 한국어 · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue?style=flat-square) ![deps](https://img.shields.io/badge/dependencies-0-success?style=flat-square) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen?style=flat-square) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical?style=flat-square)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey?style=flat-square) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational?style=flat-square) ![network](https://img.shields.io/badge/network-none-important?style=flat-square) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet?style=flat-square) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue?style=flat-square)

[먼저 이 파일 하나를 확인하세요](#먼저-이-파일-하나를-확인하세요) · [무엇을 해결하는가](#무엇을-해결하는가) · [누구를 위한 것인가](#누구를-위한-것인가) · [무엇을 강제하는가](#무엇을-강제하는가) · [3분 만에 시작하기](#3분-만에-시작하기) · [현재 상태](#현재-상태) · [전체 문서](#전체-문서)

</div>

<table>
<tr>
<td align="center" width="25%">

### 1
개 파일<br><sub>부트스트랩의 전부. 한 번에 다 읽을 수 있습니다</sub>

</td>
<td align="center" width="25%">

### 1
번의 수동 확인<br><sub>한 번 하면 이후 거부는 자동입니다</sub>

</td>
<td align="center" width="25%">

### 0
개 의존성<br><sub>네트워크 없음, 텔레메트리 없음</sub>

</td>
<td align="center" width="25%">

### 0
개 `--force`<br><sub>비활성화가 아니라, 옵션 자체가 없습니다</sub>

</td>
</tr>
</table>

---

## 먼저 이 파일 하나를 확인하세요

부트스트랩은 여러분이 신뢰해야 하는 유일한 대상입니다. 그러니 그것이 하는 말을 믿기 전에, 그것 자체를 먼저 확인하세요. 명령 하나, 비교 한 번입니다.

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

이 다이제스트는 세 곳에 공개되어 있습니다: 여기, `SECURITY.md`, 그리고 GitHub 릴리스 노트. 서로 대조할 수 있는 독립된 세 출처입니다.

> [!IMPORTANT]
> 계산 결과가 일치하지 않으면 거기서 멈추세요. 아무것도 실행하지 말고, "그래도 한번 해보기"도 하지 마세요. 불일치는 이 장치가 작동하고 있다는 뜻입니다.

---

## 무엇을 해결하는가

스킬이나 워크플로가 리포지토리에서 도착하지만, 여러분이 실행하려는 바이트가 누군가 실제로 검토한 바이트라는 것을 증명하는 것은 아무것도 없습니다.

TCRN Workflow Helper는 이 문제를 수동 확인 한 번으로 수렴시킵니다. 부트스트랩을 확인한 뒤에는, 어떤 릴리스 바이트를 받아들일지가 여러분의 판단이 아니라 암호로 결정됩니다.

`--force`는 없습니다. 옵션 자체가 존재하지 않기 때문입니다. 기본값이 꺼짐인 스위치도 아니고, 확인을 거치는 위험한 작업도 아닙니다. 이 프로그램에 없는 것입니다.

---

## 누구를 위한 것인가

| ✓ 맞는 경우 | ✗ 맞지 않는 경우 |
| :--- | :--- |
| 자기 머신에서 TCRN Workflow를 실행하며, 코드가 돌기 전에 바이트를 확인하고 싶습니다. | 릴리스 바이트의 출처 보증이 필요하지 않습니다. |
| 수동 확인 한 번을 받아들이고, 그 대가로 이후의 자동 거부를 얻습니다. | 내려받은 것을 그대로 실행해도 괜찮습니다. |

---

## 무엇을 강제하는가

| 보증 | 작동 방식 |
| :--- | :--- |
| **재현 가능한 산출물** | 스킬 아카이브, 소스 아카이브, SBOM이 모두 결정적입니다. CI가 깨끗한 클론에서 처음부터 재구축하고 다이제스트가 커밋된 것과 일치함을 단언합니다. 누구나 바이트를 재구축해 확인할 수 있습니다. |
| **정확한 릴리스 아이덴티티** | 수리된 Workflow 버전은 리포지토리 URL, 버전, 커밋, 트리, 주석 태그 오브젝트로 고정되며 실제 Git 체크아웃에 대해 검증됩니다. Git 오브젝트 id는 콘텐츠 해시이므로 이 결합은 스스로를 인증합니다. |
| **고정된 릴리스 바이트** | 수리된 아카이브와 프로버넌스 다이제스트가 부트스트랩 자체에 컴파일되어 있습니다. 다른 아카이브는 `IDENTITY_MISMATCH`로 페일 클로즈됩니다. |
| **롤백 방지** | GitHub 불변 릴리스: 태그는 이동할 수 없고 에셋은 교체할 수 없습니다. 이전 릴리스도 다이제스트 비교를 통과하지 못합니다. 부트스트랩 하나가 받아들이는 아카이브는 정확히 하나이기 때문입니다. |
| **적대적 아카이브 방어** | 경로 탈출, 절대 경로, 제어 문자, 비 NFC 경로, 중복 및 대소문자 충돌 경로, 링크, 특수 파일, 항목별 다이제스트 변조, 항목 수와 바이트 상한. 전부 압축 해제 이전에 거부됩니다. |
| **운영 환경을 건드리지 않음** | 설치, 업데이트, 재설치, 제거는 일회용 `tcrn-helper-test-*` 루트 안에서만 동작합니다. `.claude` 또는 `.codex` 경로 구성 요소를 포함한 위치는 대소문자를 가리지 않고, 파일 시스템을 조사하기도 전에 `LIVE_LOCATION_FORBIDDEN`으로 거부됩니다. |
| **트랜잭션 방식 라이프사이클** | 모든 변경은 스테이징되고 저널에 기록되는 트랜잭션이며, 크래시 복구는 실제 `SIGKILL` 주입으로 증명됩니다. 실패한 작업은 직전 상태를 바이트 단위로 그대로 남기고 잔여물을 만들지 않습니다. |

---

## 3분 만에 시작하기

```sh
# 전체 증명 스위트 실행 (오프라인. 실제 SIGKILL 주입을 포함해 10~20분 소요)
npm test

# 무언가 실행되기 전에 릴리스 세트를 검증
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>
```

<details>
<summary><b>나머지 부트스트랩 명령</b></summary>

<br>

```sh
# 인스톨러가 스킬 디렉터리에 놓은 복사본을 읽기 전용으로 검증
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <스킬디렉터리/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# 수리된 Workflow 체크아웃을 정확히 하나 해석 (모호함·심볼릭 링크·더러운 트리는 거부)
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-체크아웃>
```

</details>

> [!NOTE]
> 성공하면 정규 형식 JSON 영수증 하나를 출력합니다 (`TRUST_VALIDATED`, `ROOT_RESOLVED`, `NETWORK_PLAN_APPROVED`, `INSTALL_COMPLETED`, `UNINSTALL_COMPLETED`). 실패하면 안정적인 리즌 코드 하나를 출력합니다. 그 중간은 없습니다.

---

## 현재 상태

- `1.0.1`은 첫 수리 버전이며 TCRN Workflow `v1.0.1`을 정확히 지원합니다.
- 부트스트랩은 단일 파일입니다. 의존성 제로, 네트워크 없음, 텔레메트리 없음.
- 네트워크 작업은 계획만 하고 실행하지 않습니다: `plan-network`는 정적 계획을 출력할 뿐 어떤 요청도 보내지 않습니다.

## 전체 문서

아키텍처, 명령 레퍼런스, 판정 기준과 게이트, 알려진 제한은 TCRN Workflow 리포지토리의 [**GitHub Wiki**](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)에 있습니다. 이 리포지토리는 자체 위키를 두지 않습니다.

이 리포지토리의 문서: [기여하기](./CONTRIBUTING.md) · [보안 정책](./SECURITY.md) · [행동 강령](./CODE_OF_CONDUCT.md) · [릴리스 절차](./RELEASING.md)

## 라이선스

Apache-2.0. [LICENSE](./LICENSE)와 [NOTICE](./NOTICE)를 참조하세요.
