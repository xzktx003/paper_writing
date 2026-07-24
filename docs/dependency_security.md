# 依赖安全与可达性基线

日期：2026-07-22

## 管理原则

- `app/package-lock.json` 是唯一依赖锁文件；安全结论必须基于实际 lock，而不是只看 `package.json` 范围。
- 禁止使用 `npm audit fix --force` 作为默认修复方式。先用 `npm explain <package>` 判断生产/开发路径，再在现有 semver 范围内做定向更新并运行完整回归。
- `npm audit` 的数量不是充分证据；生产可达性、输入来源和调用边界仍需在安全审查中记录。
- `app/tests/dependencySecurityContract.test.mjs` 锁定本轮已知 advisory 的最低安全版本，避免 lockfile 在后续安装中回退。

## 2026-07-22 整改

整改前：

```text
moderate: 2
high:     3
critical: 2
total:    7
```

生产路径：

| 包 | 依赖路径 | 整改前 | 整改后 | 说明 |
| --- | --- | ---: | ---: | --- |
| `tar` | backend direct dependency | 7.5.16 | 7.5.21 | 模板/归档处理路径，生产可达 |
| `react-router-dom` / `react-router` | frontend direct/transitive | 6.30.3 | 6.30.4 | 浏览器路由，生产可达 |
| `fast-uri` | Fastify → AJV / fast-json-stringify | 3.1.2 | 3.1.4 | 请求/响应 schema 工具链，生产可达 |
| `brace-expansion` | Fastify static → glob/minimatch | 5.0.6 | 5.0.7 | 静态资源服务依赖链，生产安装可达 |

开发路径：

| 包 | 依赖路径 | 整改前 | 整改后 | 说明 |
| --- | --- | ---: | ---: | --- |
| `shell-quote` | concurrently | 1.8.3 | 1.10.0 | 仅开发命令编排 |
| `vite` | frontend / Vitest | 8.0.14–8.0.16 | 8.1.5 | 构建与测试开发工具链 |

整改后：

```text
npm audit
0 vulnerabilities
```

## 验证要求

依赖变更至少运行：

1. `npm audit --json`；
2. `npx vitest run tests/dependencySecurityContract.test.mjs`；
3. 前端 typecheck 与 production build；
4. 后端单元/路由测试；
5. 隔离 integration 和 Playwright E2E。

最终发布时仍需重新运行 audit，因为 advisory 数据和依赖解析结果会变化。
