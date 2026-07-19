# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report vulnerabilities privately using GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):
open the repository's **Security** tab and choose **Report a vulnerability**.

Please include:

- a description of the issue and its impact,
- steps to reproduce, and
- any relevant configuration.

You will receive an acknowledgement, and a fix or mitigation will be
coordinated before public disclosure.

## Scope notes

- This project ships a **mock** billing flow. No real payment processor,
  card data, or funds are involved anywhere in the codebase.
- Never commit real credentials. `.env` is ignored; use `.env.example` as the
  template.
