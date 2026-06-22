# Contributing to Evershine Academy LMS

Thank you for contributing to this academy management platform. The goal is to keep the repository reliable, secure, and maintainable for academic operations.

---

## Code of Conduct

- Be respectful and inclusive
- Focus on what is best for the community
- Gracefully accept constructive criticism

---

## How to Contribute

### Reporting Bugs

1. Use the [GitHub Issue Tracker](https://github.com/Ibadat-Ali86/evershine_lms/issues)
2. Describe the bug with steps to reproduce
3. Include your environment (Node.js version, browser, OS)
4. Add screenshots if applicable

### Suggesting Enhancements

1. Open an issue with the tag `enhancement`
2. Explain the use case and expected behavior
3. Reference any related existing functionality

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following the style guide below
4. **Run checks**: `npm run lint && npm run test`
5. **Build verification**: `npm run build`
6. **Submit PR** with a clear description

---

## Style Guide

### TypeScript

- Use **strict typing** — avoid `any` without explicit `// UNSAFE:` justification
- Use `zod` schemas for all API input validation
- Use `prisma.$transaction()` for multi-step mutations
- Type all function parameters and return values

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables / Functions | camelCase | `getStudentById` |
| Components | PascalCase | `StudentCard` |
| API Routes | kebab-case | `/api/teacher-portal/results` |
| Database Models | PascalCase | `ClassSection` |
| Constants | UPPER_SNAKE_CASE | `SESSION_SHIFT_TIMES` |

### Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add student attendance export
fix: resolve N+1 query in results API
docs: update API documentation
chore: bump Prisma to 5.23
refactor: extract fee calculation service
test: add shift validation unit tests
```

---

## Security Guidelines

All contributions must follow these security rules:

- **Never commit secrets** — no API keys, passwords, or tokens in code
- **Validate all inputs** — use Zod schemas at API boundaries
- **Use parameterized queries** — never use raw SQL string interpolation
- **Check authorization** — all routes must verify user role before data access
- **Log mutations** — all POST/PATCH/DELETE must write to `AuditLog`
- **Handle errors** — never swallow exceptions silently; return typed errors

---

## PR Checklist

Before submitting a pull request, verify:

- [ ] Code compiles: `npm run build` succeeds
- [ ] Tests pass: `npm run test`
- [ ] Lint clean: `npm run lint`
- [ ] No `any` types without justification
- [ ] All API inputs validated with Zod
- [ ] RBAC guards on new/modified routes
- [ ] Audit logging for mutations
- [ ] No secrets or credentials in code
- [ ] Database migrations are backward-compatible
- [ ] Documentation updated if API surface changed

---

## Questions?

Open an issue or contact the maintainers at `it-team@evershineacademy.edu.pk`.
