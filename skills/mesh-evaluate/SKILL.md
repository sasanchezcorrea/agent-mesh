---
name: mesh-evaluate
description: >
  Evaluate the live agentmesh tools and skills for usefulness, cost,
  redundancy, and failure risk. Use when deciding what to keep enabled.
argument-hint: ""
license: MIT
---

# Mesh evaluation

Evaluate the live stack, not only `manifest.json`.

For each MCP server, hook, and skill, report:

- whether it is connected and working;
- concrete value for the current task;
- measured token, credit, or latency cost when available;
- overlap or redundancy with another component;
- failure or maintenance risk;
- decision: **keep**, **limit by mode**, or **remove**.

Use `/mesh-cost` for measurements. Never invent a number; label unknowns.
Finish with the smallest recommended stack for `lite`, `full`, and `ultra`.
