---
updated: 2026-03-20
items:
  - id: levothyroxine
    name: 左甲状腺素钠片
    kind: medication
    dose: 50 μg
    times: ["06:00"]
    with_food: false
    start: 2024-01-01
    reason: 甲状腺功能减退
    related: [TSH]
    source: prescribed
    prescriber: 示例医院内分泌科
    precautions:
      - 与钙片至少间隔 4 小时
    doctor_confirmed: true
  - id: calcium
    name: 钙片 + D3
    kind: supplement
    dose: 1 片
    times: ["19:00"]
    with_food: true
    start: 2025-06-01
    reason: 绝经后骨质保护
    related: [CA]
    source: self
    brand: 示例品牌
    spec: 每片钙 600 mg + D3 400 IU
    expiry: 2027-08-31
    doctor_confirmed: true
---
