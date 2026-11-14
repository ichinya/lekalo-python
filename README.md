# lekalo-python

Языковой адаптер [Lekalo](https://github.com/ichinya/lekalo) для Python: понимание исходников, типов и символов, привязка к коду, observed-scan и интеграции инструментов языка.

- Протокол к ядру — lekalo.target process/JSON protocol (сейчас реализован в adapters/python монорепы).
- Framework-пакеты (lekalo-python-fastapi) подключаются через versioned provider API — [lekalo-php#1](https://github.com/ichinya/lekalo-php/issues/1) (контракт общий для языковых адаптеров).
- Общий план отделения — [ichinya/lekalo#241](https://github.com/ichinya/lekalo/issues/241).
