---
name: arrow-functions
description: "Use for JavaScript and Node.js code when you want arrow functions only, modern ES module style, and clean code conventions."
user-invocable: true
---

# Arrow Functions and Clean Code

## When to Use
- Writing or updating JavaScript and Node.js code
- Keeping the codebase consistent with modern ES module style
- Reviewing code for readability and small refactors

## Rules
- Use arrow functions for all new functions.
- Prefer `const` by default; use `let` only when reassignment is required.
- Use `async` and `await` instead of promise chains when it improves readability.
- Use early returns to reduce nesting.
- Keep functions small and focused on one job.
- Use descriptive names for variables, parameters, and helper functions.
- Handle errors explicitly with `try/catch` around I/O and API calls.
- Use template literals for composed strings.
- Prefer ES module imports and exports.
- Avoid unused variables and dead code.

## Practical Checklist
1. Write the function as an arrow function.
2. Check whether the logic can be split into a smaller helper.
3. Replace mutable state with `const` where possible.
4. Add clear error handling for any external call.
5. Keep the output concise and readable.

## Good Defaults
- Functional, direct code over clever abstractions
- Explicit return values
- Consistent formatting and naming
- Minimal side effects