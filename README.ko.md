<div align="center">

# TCRN Workflow Helper

### 손으로 확인할 파일은 하나, 한 번뿐입니다. 나머지는 이것이 대신 거절합니다

**단일 파일, 의존성 없는 부트스트랩. 릴리스의 코드가 한 줄이라도 실행되기 전에, 그것이 공개된 바로 그것임을 증명합니다.**

[简体中文](./README.md) · [English](./README.en.md) · [日本語](./README.ja.md) · 한국어 · [Français](./README.fr.md)

![status](https://img.shields.io/badge/status-1.0.1-blue) ![deps](https://img.shields.io/badge/dependencies-0-success) ![files](https://img.shields.io/badge/bootstrap-1%20file-brightgreen) ![force](https://img.shields.io/badge/--force-does%20not%20exist-critical)

![license](https://img.shields.io/badge/license-Apache--2.0-lightgrey) ![node](https://img.shields.io/badge/node-%E2%89%A5%2024-informational) ![network](https://img.shields.io/badge/network-none-important) ![hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%C2%B7%20Codex-blueviolet) ![supports](https://img.shields.io/badge/TCRN%20Workflow-v1.0.1-blue)

[이 파일부터 확인하세요](#이-파일부터-확인하세요) · [무엇을 해결하는가](#무엇을-해결하는가) · [누구를 위한 것인가](#누구를-위한-것인가) · [무엇을 강제하는가](#무엇을-강제하는가) · [3분 만에 시작하기](#3분-만에-시작하기) · [현재 상태](#현재-상태) · [전체 문서](#전체-문서)

</div>

---

## 이 파일부터 확인하세요

믿어야 하는 것은 부트스트랩 하나뿐입니다. 그러니 그것이 하는 말을 믿기 전에 그것 자체를 확인하세요. 명령 하나, 비교 하나입니다.

```sh
shasum -a 256 bootstrap/trusted-bootstrap.mjs
# ee61a092b96b16ca1207d5a259a493b4ab3354d1aba52cc6536dd1a474dd8d1b
```

이 다이제스트는 세 곳에 공개되어 있습니다. 여기, `SECURITY.md`, 그리고 GitHub 릴리스 노트입니다. **계산한 값이 다르면 멈추세요.** 아무것도 실행하지 말고, 그냥 한번 해보지도 마세요. 불일치는 이 장치가 작동하고 있다는 뜻입니다.

## 무엇을 해결하는가

스킬이나 워크플로가 저장소에서 도착합니다. 그런데 당신이 곧 실행할 바이트가 누군가 실제로 검토한 바이트라는 것을 증명하는 것은 아무것도 없습니다.

TCRN Workflow Helper는 그 문제를 한 번의 수동 확인으로 줄입니다. 부트스트랩을 확인한 뒤부터는, 어떤 릴리스 바이트를 받아들일지가 당신의 판단이 아니라 암호로 결정됩니다. `--force`는 없습니다. 그런 선택지가 존재하지 않기 때문입니다.

## 누구를 위한 것인가

| | |
| --- | --- |
| **적합합니다** | 자기 컴퓨터에서 TCRN Workflow를 실행하며, 코드가 실행되기 전에 바이트를 확인하고 싶은 경우. 한 번의 수동 확인을 대가로 이후의 자동 거절을 받아들이는 경우. |
| **적합하지 않습니다** | 릴리스 바이트의 출처 보장이 필요 없거나, 내려받은 것을 그대로 실행해도 괜찮은 경우. |

## 무엇을 강제하는가

| 보장 | 작동 방식 |
| --- | --- |
| **재현 가능한 산출물** | 스킬 아카이브, 소스 아카이브, SBOM이 결정적입니다. 깨끗한 클론의 CI가 처음부터 다시 만들고 다이제스트가 커밋된 것과 같음을 단언합니다. 누구나 바이트를 다시 만들어 확인할 수 있습니다. |
| **정확한 릴리스 신원** | 승인된 Workflow 릴리스는 저장소 URL, 버전, 커밋, 트리, 주석 태그 객체로 고정되며 실제 Git 체크아웃에 대해 검사됩니다. Git 객체 id는 내용 해시이므로 이 결속은 스스로를 인증합니다. |
| **고정된 릴리스 바이트** | 승인된 아카이브와 출처 증명 다이제스트가 부트스트랩 자체에 컴파일되어 있습니다. 다른 아카이브는 `IDENTITY_MISMATCH`로 닫히며 실패합니다. |
| **롤백 방지** | GitHub 불변 릴리스: 태그는 옮길 수 없고 자산은 바꿔치기할 수 없습니다. 예전 릴리스도 고정 다이제스트 비교를 통과하지 못합니다. 부트스트랩 하나는 정확히 하나의 아카이브만 받아들이기 때문입니다. |
| **악의적 아카이브 방어** | 경로 탈출, 절대 경로, 제어 문자, 비 NFC 경로, 중복 및 대소문자 충돌 경로, 링크, 특수 파일, 항목별 다이제스트 변조, 항목 수와 바이트 상한이 모두 압축 해제 전에 거부됩니다. |
| **운영 환경 보호** | 설치, 갱신, 재설치, 제거는 일회용 `tcrn-helper-test-*` 루트 안에서만 동작합니다. `.claude`나 `.codex` 구성 요소를 포함한 경로는 대소문자와 무관하게 파일 시스템을 살펴보기도 전에 `LIVE_LOCATION_FORBIDDEN`으로 거부됩니다. |
| **트랜잭션 생명주기** | 모든 변경은 스테이징되고 저널이 남는 트랜잭션이며, 충돌 복구는 실제 `SIGKILL` 주입으로 증명됩니다. 실패한 작업은 바이트가 동일한 이전 상태를 남기고 잔여물이 없습니다. |

## 3분 만에 시작하기

```sh
# 전체 증명 스위트 실행 (오프라인. 실제 SIGKILL 결함 주입을 포함하므로 10~20분)
npm test

# 무엇이든 실행되기 전에 릴리스 번들을 검증한다
node bootstrap/trusted-bootstrap.mjs validate \
  --archive <archive.json> --provenance <provenance.json> --state <state.json>

# 설치 프로그램이 스킬 폴더에 둔 사본을 읽기 전용으로 검증한다
node bootstrap/trusted-bootstrap.mjs verify-installed-copy \
  --installed-dir <스킬-폴더/tcrn-workflow-helper> \
  --provenance <provenance.json> --state <state.json> --marker <marker.json>

# 승인된 Workflow 체크아웃을 정확히 하나 해석한다 (모호함, 심볼릭 링크, 더러운 작업 트리는 거부)
node bootstrap/trusted-bootstrap.mjs resolve --root <workflow-체크아웃>
```

성공하면 정규 형식의 JSON 영수증 하나가 나옵니다(`TRUST_VALIDATED`, `ROOT_RESOLVED`, `NETWORK_PLAN_APPROVED`, `INSTALL_COMPLETED`, `UNINSTALL_COMPLETED`). 실패하면 안정적인 사유 코드 하나가 나옵니다. 그 사이는 없습니다.

## 현재 상태

- `1.0.1`은 최초 승인 릴리스이며 TCRN Workflow `v1.0.1`을 정확히 지원합니다.
- 부트스트랩은 단일 파일입니다. 의존성 0, 네트워크 없음, 텔레메트리 없음.
- 네트워크 작업은 계획만 하고 실행하지 않습니다. `plan-network`는 정적 계획을 출력할 뿐 요청을 보내지 않습니다.

## 전체 문서

아키텍처, 명령 레퍼런스, 주장과 게이트, 알려진 한계는 TCRN Workflow 저장소의 [wiki](https://github.com/tpmoonchefryan/tcrn-workflow/wiki)에 있습니다. 이 저장소는 자체 wiki를 두지 않습니다.

이 저장소의 문서: [기여](./CONTRIBUTING.md) · [보안](./SECURITY.md) · [행동 강령](./CODE_OF_CONDUCT.md) · [릴리스 절차](./RELEASING.md)

## 라이선스

Apache-2.0. [LICENSE](./LICENSE)와 [NOTICE](./NOTICE)를 참조하세요.
