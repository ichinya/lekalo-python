# lekalo-python

Языковой runtime Python для процесса `lekalo.target/v1`. `src/` содержит чтение профиля, статическое сканирование и языковые символы; правила регистрации FastAPI принадлежат отдельному `lekalo-python-fastapi`.

```sh
cargo +1.97.0 test --locked
cargo +1.97.0 build --locked --config 'profile.dev.debug=0'
node --test tests/scan-protocol.test.mjs tests/fastapi.test.mjs
```

Сборка самостоятельна: соседний checkout ядра не нужен. SDK берётся из `lekalo-adapter-sdk` по Git SHA, FastAPI также берётся из собственного репозитория по Git SHA. Копий их исходников в runtime нет. Целевая версия Python и версия хостового Rust — разные настройки.

Пока FastAPI подключается как библиотека на этапе сборки, а разрешённые providers профиля ограничены прежним протоколом. Обновление закреплённого FastAPI: измените `rev` в Cargo.toml, обновите Cargo.lock, выполните `node scripts/check-sources.mjs` и тесты.

Произвольный repo/ref и загрузка правил по компонентам требуют последующего resolver/provider API: [lekalo#239](https://github.com/ichinya/lekalo/issues/239), [lekalo#197](https://github.com/ichinya/lekalo/issues/197). Межпроцессные тесты с CLI ядра остаются host-conformance в основном репозитории.

`ci/package-workflow.yml` — неактивный шаблон CI. Для автоматического запуска его нужно установить в `.github/workflows/` учётными данными с правом `workflow`; текущая публикация проверена локально.

## Распознавание проектов для `init --adopt`

`crates/discovery` владеет языковыми правилами обнаружения, перенесёнными из
`lekalo-core/src/init/detect.rs`. Эта небольшая Rust-библиотека принимает
байты/значения; обход каталогов, no-follow чтение, проверка путей и ограничения
остаются в хосте. Команды build/test являются предложениями и не исполняются.

```sh
cargo test --locked --manifest-path crates/discovery/Cargo.toml
```

Ядро вызывает самостоятельный процесс `lekalo-python-discovery` по `lekalo/runtime/v1`; копий и Cargo-зависимости на этот пакет в ядре нет. Формат существующего adoption receipt сохраняется.

The adapter SDK is supplied by an immutable Git dependency on [lekalo-adapter-sdk](https://github.com/ichinya/lekalo-adapter-sdk), recorded in Cargo.toml/Cargo.lock. There is no vendored SDK implementation in this repository.

## Установка discovery-сервиса

```sh
cargo install --locked --path crates/discovery --root /your/tools
```

Добавьте `/your/tools/bin` в PATH, укажите `services.discovery/python: {command: [lekalo-python-discovery]}` в `lekalo.yaml` и выполните `lekalo runtime lock`. Операции: `describe`, `discovery.describe`, `discovery.inspect`; входные файлы передаются как данные, процесс не читает проект. [Контракт сервиса](https://github.com/ichinya/lekalo/blob/feat/external-services-241/docs/external-services.md). Сборка сервиса использует `debug=0`, `incremental=false`.
